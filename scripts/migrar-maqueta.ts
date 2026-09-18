/**
 * Pasa los wireframes al modelo de La Maqueta (bloques con x, y, w, h).
 * Toca data/seed.json, home.data.WIRE y los overrides de la tabla layouts.
 * Es idempotente: si ya está migrado, no hace nada.
 */
import fs from "node:fs";
import path from "node:path";
import { adminDb } from "../lib/db";
import { aBloques } from "../lib/maqueta";

const RUTA = path.join(process.cwd(), "data", "seed.json");

function migrarWire(wire: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [sec, v] of Object.entries(wire)) {
    const { filas, ...resto } = v as any;
    out[sec] = { ...resto, bloques: aBloques(v) };
  }
  return out;
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(RUTA, "utf8"));
  seed.WIRE = migrarWire(seed.WIRE);
  fs.writeFileSync(RUTA, JSON.stringify(seed, null, 2) + "\n");
  console.log("seed.json: WIRE migrado");
  for (const [sec, v] of Object.entries<any>(seed.WIRE)) {
    console.log(`  ${sec}: ${v.bloques.length} bloques, ${Math.max(...v.bloques.map((b: any) => b.y + b.h))} filas de alto`);
  }

  const sb = adminDb();

  const { data: home, error } = await sb.from("home").select("data").eq("id", "home").single();
  if (error) throw error;
  await sb.from("home").update({ data: { ...home.data, WIRE: seed.WIRE }, actualizado: new Date().toISOString() }).eq("id", "home");
  console.log("home.data.WIRE actualizado");

  const { data: layouts } = await sb.from("layouts").select("*");
  for (const fila of layouts ?? []) {
    if (fila.bloques?.length || !fila.filas?.length) { console.log(`  layouts ${fila.seccion}: ya migrado`); continue; }
    const bloques = aBloques(fila);
    await sb.from("layouts").update({ bloques, filas: null, actualizado: new Date().toISOString() }).eq("seccion", fila.seccion);
    console.log(`  layouts ${fila.seccion}: ${bloques.length} bloques`);
  }
  console.log("listo");
}

main().catch((e) => { console.error(e); process.exit(1); });
