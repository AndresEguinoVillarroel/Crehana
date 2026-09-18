/**
 * Sube contexto/crehana.md (material oficial de Crehana, gitignoreado) al bucket privado `contexto`.
 * El agente lo baja en cada corrida. Correr cada vez que cambie el material: `npm run contexto`.
 */
import { adminDb } from "../lib/db";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const archivo = path.join(process.cwd(), "contexto", "crehana.md");
  if (!fs.existsSync(archivo)) throw new Error("Falta contexto/crehana.md");
  const sb = adminDb();

  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === "contexto")) {
    const { error } = await sb.storage.createBucket("contexto", { public: false });
    if (error) throw error;
    console.log("Bucket privado `contexto` creado.");
  }

  const { error } = await sb.storage.from("contexto").upload("crehana.md", fs.readFileSync(archivo), {
    contentType: "text/markdown; charset=utf-8",
    upsert: true,
  });
  if (error) throw error;
  console.log(`✓ crehana.md subido (${fs.statSync(archivo).size} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
