/**
 * Corrida semanal de Sherlock.
 * Corre en GitHub Actions (lunes 12:00 UTC) o a mano: `npm run corrida`.
 *
 * 1. Captura el home de cada competidor, cada referente y crehana.com, sección por sección.
 * 2. Sube las capturas a Supabase Storage y las registra en la tabla `capturas`,
 *    guardando la anterior en `prev` para poder comparar semanas.
 * 3. Le pasa a Claude el estado del tablero y las capturas, y recibe señales,
 *    cara a cara y entradas de backlog.
 * 4. Escribe todo en Supabase. El tablero lo muestra sin intervención.
 */
import { chromium, Page } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "../lib/db";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "shots");
const HOY = new Date().toISOString().slice(0, 10);

/** Qué parte de la página ilustra cada sección de la propuesta. */
const TRAMOS = [
  { sec: "01", scroll: 0 },
  { sec: "02", scroll: 1 },
  { sec: "03", scroll: 2 },
  { sec: "04", scroll: 3 },
  { sec: "06", scroll: 5 },
  { sec: "07", scroll: 7 },
  { sec: "08", scroll: 9 },
];

async function capturar(page: Page, url: string, slug: string) {
  const hechas: { archivo: string; sec: string }[] = [];
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // Espera larga: varias landings tienen animación de entrada.
  await page.waitForTimeout(9000);
  for (const sel of ["button:has-text('Aceptar')", "#onetrust-accept-btn-handler", "button:has-text('Accept')"]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 800 })) { await el.click({ timeout: 1500 }); await page.waitForTimeout(700); break; }
    } catch {}
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);

  /* Lo que lee Google, que en una captura no se ve: sirve para cruzar contra el keyword research. */
  const seo = await page.evaluate(() => {
    const txt = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      h1: [...document.querySelectorAll("h1")].map(txt).filter(Boolean),
      h2: [...document.querySelectorAll("h2")].map(txt).filter(Boolean).slice(0, 15),
    };
  }).catch(() => null);

  let ultimo = 0;
  for (const tramo of TRAMOS) {
    if (tramo.scroll > ultimo) {
      await page.evaluate((n) => window.scrollBy(0, window.innerHeight * n), tramo.scroll - ultimo);
      await page.waitForTimeout(2500);
      ultimo = tramo.scroll;
    }
    const archivo = path.join(OUT, `${slug}-${tramo.sec}.jpg`);
    await page.screenshot({ path: archivo, quality: 72, type: "jpeg" });
    hechas.push({ archivo, sec: tramo.sec });
  }
  return { hechas, seo };
}

async function subir(sb: ReturnType<typeof adminDb>, archivo: string, id: string, pie: string) {
  const bytes = fs.readFileSync(archivo);
  const ruta = `${HOY}/${id}.jpg`;
  const { error } = await sb.storage.from("capturas").upload(ruta, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = sb.storage.from("capturas").getPublicUrl(ruta);
  const { data: previo } = await sb.from("capturas").select("url").eq("id", id).maybeSingle();
  await sb.from("capturas").upsert({
    id,
    url: data.publicUrl,
    prev: previo?.url ?? null,
    pie,
    actualizado: new Date().toISOString(),
  });
  return data.publicUrl;
}

/** Orden de lectura: primero qué es Crehana, después la prueba social y al final la competencia. */
const MATERIAL = ["crehana.md", "testimonios.md", "competencia.md", "keywords.md"];

/**
 * El material interno de Crehana vive en el bucket privado `contexto`, no en git: el repo es público.
 * En local, si el bucket no responde, se usa la copia de contexto/ (gitignoreada).
 */
async function contextoCrehana(sb: ReturnType<typeof adminDb>) {
  const { data: lista, error } = await sb.storage.from("contexto").list();
  const remotos = (lista ?? []).map((o) => o.name).filter((n) => n.endsWith(".md"));
  const orden = (a: string, b: string) =>
    (MATERIAL.indexOf(a) + 1 || 99) - (MATERIAL.indexOf(b) + 1 || 99);

  const partes: string[] = [];
  if (remotos.length) {
    for (const nombre of remotos.sort(orden)) {
      const { data } = await sb.storage.from("contexto").download(nombre);
      if (data) partes.push(await data.text());
    }
  } else {
    const dir = path.join(process.cwd(), "contexto");
    const locales = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort(orden) : [];
    if (locales.length) console.log(`⚠ contexto: bucket vacío o caído (${error?.message ?? "sin archivos"}), uso la copia local`);
    for (const nombre of locales) partes.push(fs.readFileSync(path.join(dir, nombre), "utf8"));
  }

  if (!partes.length) {
    console.log(`⚠ contexto: no hay material interno de Crehana. Corré \`npm run contexto\`.`);
    return "(No disponible en esta corrida. No inventes cifras, clientes ni nombres de producto: marcá como no verificado.)";
  }
  console.log(`contexto: ${partes.length} documentos de material interno`);
  /* Los documentos arrancan con "# " y el prompt ya está en "##": se bajan un nivel para no romper la jerarquía. */
  return partes.map((p) => p.replace(/^(#+) /gm, "##$1 ")).join("\n\n---\n\n");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sb = adminDb();

  const { data: comps } = await sb.from("competidores").select("*").order("tipo");
  if (!comps?.length) throw new Error("No hay competidores cargados. Corré `npm run seed` primero.");

  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "es-CL",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  });

  const capturadas: Record<string, { sec: string; url: string; archivo: string }[]> = {};
  const caidas: string[] = [];
  const seoPorSitio: Record<string, unknown> = {};

  const sitios = [
    ...comps.map((c: any) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, url: `https://${String(c.sitio).replace(/^https?:\/\//, "")}` })),
    { id: "crehana", nombre: "Crehana", tipo: "propio", url: "https://www.crehana.com/" },
  ];

  for (const sitio of sitios) {
    try {
      /* Pestaña nueva por sitio: si uno se cae, su página de error y sus redirecciones pendientes
         no pueden interrumpir la navegación del siguiente. */
      const page = await ctx.newPage();
      let hechas, seo;
      try { ({ hechas, seo } = await capturar(page, sitio.url, sitio.id)); } finally { await page.close(); }
      if (seo) seoPorSitio[sitio.nombre] = seo;
      capturadas[sitio.id] = [];
      for (const hecha of hechas) {
        const sufijo = sitio.tipo === "propio" ? "cre" : sitio.tipo === "referente" ? "ref" : "comp";
        /* Las capturas van dirigidas a una página del sitio. Hoy el agente sólo cubre el home. */
        const id = `home/sec-${hecha.sec}-${sufijo}`;
        const url = await subir(sb, hecha.archivo, id, `${sitio.nombre} · ${HOY} · sección ${hecha.sec}`);
        capturadas[sitio.id].push({ sec: hecha.sec, url, archivo: hecha.archivo });
      }
      console.log(`✓ ${sitio.nombre}: ${hechas.length} capturas`);
    } catch (e: any) {
      caidas.push(`${sitio.nombre} (${e.message?.slice(0, 80)})`);
      console.log(`✗ ${sitio.nombre}: ${e.message?.slice(0, 120)}`);
    }
  }
  await navegador.close();

  // ---- análisis con Claude ----
  const [{ data: corridas }, { data: backlog }, { data: aprob }, { data: hilos }, { data: senales }] =
    await Promise.all([
      sb.from("corridas").select("*").order("n", { ascending: false }).limit(6),
      sb.from("backlog").select("*"),
      sb.from("aprobaciones").select("*"),
      sb.from("hilos").select("*").order("creado", { ascending: false }).limit(40),
      sb.from("senales").select("*").order("creado", { ascending: false }).limit(40),
    ]);

  const n = (corridas?.[0]?.n ?? 0) + 1;
  const semana = `${new Date().getFullYear()}-W${String(
    Math.ceil(((+new Date() - +new Date(new Date().getFullYear(), 0, 1)) / 86400000 + 1) / 7)
  ).padStart(2, "0")}`;
  /* La semana sola no alcanza: dos corridas manuales en la misma semana se pisaban. */
  const idCorrida = `${semana}-c${n}`;

  const crehana = await contextoCrehana(sb);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt =fs.readFileSync(path.join(process.cwd(), "scripts", "prompt.md"), "utf8")
    .replace("{{CORRIDA}}", String(n))
    .replace("{{SEMANA}}", semana)
    .replace("{{FECHA}}", HOY)
    .replace("{{COMPETIDORES}}", JSON.stringify(comps, null, 1))
    .replace("{{CORRIDAS}}", JSON.stringify(corridas ?? [], null, 1))
    .replace("{{SENALES}}", JSON.stringify(senales ?? [], null, 1))
    .replace("{{BACKLOG}}", JSON.stringify(backlog ?? [], null, 1))
    .replace("{{APROBACIONES}}", JSON.stringify(aprob ?? [], null, 1))
    .replace("{{HILOS}}", JSON.stringify(hilos ?? [], null, 1))
    .replace("{{CAPTURAS}}", JSON.stringify(capturadas, null, 1))
    .replace("{{CAIDAS}}", caidas.join("; ") || "ninguna")
    .replace("{{SEO}}", () => JSON.stringify(seoPorSitio, null, 1))
    .replace("{{CREHANA}}", () => crehana);

  // Las capturas del hero de cada sitio entran como imágenes para que Claude las mire de verdad.
  /* Crehana va primero: el cara a cara se hace contra su hero, así que nunca puede quedar afuera. */
  const imagenes = Object.entries(capturadas)
    .sort(([a], [b]) => (a === "crehana" ? -1 : b === "crehana" ? 1 : 0))
    .map(([, lista]) => lista[0])
    .filter(Boolean)
    .slice(0, 16)
    .map((c) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: fs.readFileSync(c.archivo).toString("base64"),
      },
    }));

  const respuesta = await anthropic.messages
    .stream({
      model: "claude-opus-5",
      max_tokens: 32000,
      messages: [{ role: "user", content: [...imagenes, { type: "text", text: prompt }] }],
    })
    .finalMessage();

  const texto = respuesta.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  fs.writeFileSync(path.join(OUT, "respuesta-cruda.txt"), texto, "utf8");
  if (respuesta.stop_reason !== "end_turn") {
    console.log(`⚠ stop_reason: ${respuesta.stop_reason} (la respuesta puede estar incompleta)`);
  }
  const sinFences = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const json = sinFences.slice(sinFences.indexOf("{"), sinFences.lastIndexOf("}") + 1);
  let salida;
  try {
    salida = JSON.parse(json);
  } catch (e: any) {
    console.error(`No se pudo parsear el JSON de la respuesta. Guardada en shots/respuesta-cruda.txt para revisar.`);
    throw e;
  }

  // ---- guardar ----
  await sb.from("corridas").upsert({
    id: idCorrida,
    n,
    fecha: HOY,
    headline: salida.headline,
    findings: salida.senales?.map((s: any) => ({ id: s.id, sev: s.sev, tema: s.tema, title: s.titulo })) ?? [],
    visual: { capturado: Object.keys(capturadas).length > 0, fecha: HOY, caidas, nota: salida.lectura_visual ?? "" },
  });

  for (const s of salida.senales ?? []) {
    await sb.from("senales").upsert({
      id: s.id, competidor: s.competidor, corrida: idCorrida, sev: s.sev, cat: s.cat,
      titulo: s.titulo, detalle: s.detalle, porque: s.porque, vs: s.vs ?? {},
      fuentes: s.fuentes ?? [], verificado: s.verificado ?? HOY,
    });
  }
  for (const b of (salida.backlog ?? []).slice(0, 4)) {
    await sb.from("backlog").upsert({
      id: b.id ?? `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      seccion: b.seccion, titulo: b.titulo, detalle: b.detalle,
      origen: b.origen, corrida: String(n), estado: "pendiente",
    });
  }

  console.log(`\nCorrida ${n} guardada. Señales: ${salida.senales?.length ?? 0}. Backlog nuevo: ${salida.backlog?.length ?? 0}.`);
  console.log(salida.resumen ?? "");
}

main().catch((e) => { console.error(e); process.exit(1); });
