/**
 * Sube el material interno de Crehana (contexto/*.md, gitignoreado) al bucket privado `contexto`.
 * El agente lo baja en cada corrida. Correr cada vez que cambie el material: `npm run contexto`.
 */
import { adminDb } from "../lib/db";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const dir = path.join(process.cwd(), "contexto");
  const archivos = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  if (!archivos.length) throw new Error("No hay archivos .md en contexto/");
  const sb = adminDb();

  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === "contexto")) {
    const { error } = await sb.storage.createBucket("contexto", { public: false });
    if (error) throw error;
    console.log("Bucket privado `contexto` creado.");
  }

  for (const nombre of archivos) {
    const ruta = path.join(dir, nombre);
    const { error } = await sb.storage.from("contexto").upload(nombre, fs.readFileSync(ruta), {
      contentType: "text/markdown; charset=utf-8",
      upsert: true,
    });
    if (error) throw error;
    console.log(`✓ ${nombre} (${fs.statSync(ruta).size} bytes)`);
  }

  /* Lo que ya no está en local se borra del bucket, para que el agente no lea material viejo. */
  const { data: remotos } = await sb.storage.from("contexto").list();
  const sobran = (remotos ?? []).map((o) => o.name).filter((n) => n.endsWith(".md") && !archivos.includes(n));
  if (sobran.length) {
    await sb.storage.from("contexto").remove(sobran);
    console.log(`− borrados del bucket: ${sobran.join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
