/**
 * Ata a una página lo que hoy está suelto: la fila de `home`, las claves de
 * aprobaciones y de hilos, y los ids de las capturas de sección.
 * Las columnas `pagina` de layouts, copys y backlog ya vienen con default 'home'.
 * Es idempotente.
 */
import fs from "node:fs";
import path from "node:path";
import { adminDb } from "../lib/db";

const PAGINA = "home";

async function main() {
  const sb = adminDb();

  /* La fila del contenido pasa de 'actual' a llevar el id de la página. */
  const { data: filas } = await sb.from("home").select("id");
  const ids = (filas ?? []).map((f: any) => f.id);
  if (ids.includes("actual") && !ids.includes(PAGINA)) {
    await sb.from("home").update({ id: PAGINA }).eq("id", "actual");
    console.log(`home: 'actual' -> '${PAGINA}'`);
  } else {
    console.log(`home: ids ${ids.join(", ")} (sin cambios)`);
  }

  /* El nombre y la url de la página salen del seed. */
  const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed.json"), "utf8"));
  const { data: fila } = await sb.from("home").select("data").eq("id", PAGINA).maybeSingle();
  if (fila && !fila.data?.HOME?.nombre) {
    const data = { ...fila.data, HOME: { ...fila.data.HOME, nombre: seed.HOME.nombre, url: seed.HOME.url } };
    await sb.from("home").update({ data, actualizado: new Date().toISOString() }).eq("id", PAGINA);
    console.log(`home.data.HOME: nombre '${seed.HOME.nombre}' y url agregados`);
  }

  /* Aprobaciones: la clave '03' pasa a 'home/03'. */
  const { data: aprobs } = await sb.from("aprobaciones").select("*");
  for (const a of aprobs ?? []) {
    if (String(a.clave).includes("/")) continue;
    const clave = `${PAGINA}/${a.clave}`;
    await sb.from("aprobaciones").delete().eq("id", a.id);
    await sb.from("aprobaciones").insert({ ...a, id: `${clave}__${a.revisora}`, clave });
    console.log(`aprobaciones: ${a.id} -> ${clave}__${a.revisora}`);
  }

  /* Hilos: 'sec-01' pasa a 'home/sec-01'. */
  const { data: hilos } = await sb.from("hilos").select("*");
  let nHilos = 0;
  for (const h of hilos ?? []) {
    if (String(h.clave).includes("/")) continue;
    await sb.from("hilos").update({ clave: `${PAGINA}/${h.clave}` }).eq("id", h.id);
    nHilos++;
  }
  console.log(`hilos: ${nHilos} reatados`);

  /* Capturas de sección: 'sec-01-comp' pasa a 'home/sec-01-comp'.
     Las de señales ('f-rankmi-r1') no pertenecen a ninguna página y quedan igual. */
  const { data: caps } = await sb.from("capturas").select("*");
  let nCaps = 0;
  for (const c of caps ?? []) {
    if (!/^sec-/.test(String(c.id))) continue;
    await sb.from("capturas").delete().eq("id", c.id);
    await sb.from("capturas").insert({ ...c, id: `${PAGINA}/${c.id}` });
    nCaps++;
  }
  console.log(`capturas: ${nCaps} reatadas a '${PAGINA}'`);

  console.log("listo");
}

main().catch((e) => { console.error(e); process.exit(1); });
