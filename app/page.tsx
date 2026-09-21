import { db } from "@/lib/db";
import Tablero from "./tablero";

export const revalidate = 0;

export default async function Page() {
  const [competidores, senales, backlog, capturas, aprobaciones, hilos, copys, layouts, variantes, home, corridas] =
    await Promise.all([
      db.from("competidores").select("*").order("tipo", { ascending: true }),
      db.from("senales").select("*"),
      db.from("backlog").select("*"),
      db.from("capturas").select("*"),
      db.from("aprobaciones").select("*"),
      db.from("hilos").select("*").order("creado"),
      db.from("copys").select("*"),
      db.from("layouts").select("*"),
      db.from("variantes").select("*").order("creado", { ascending: false }),
      db.from("home").select("*").order("id"),   // una fila por página del sitio
      db.from("corridas").select("*").order("n", { ascending: false }),
    ]);

  if (!home.data?.length) {
    return (
      <main style={{ maxWidth: 620, margin: "80px auto", padding: 24, fontFamily: "Inter, sans-serif" }}>
        <h1 style={{ fontFamily: "Familjen Grotesk, sans-serif" }}>Falta cargar los datos</h1>
        <p style={{ color: "#45485F", lineHeight: 1.6 }}>
          Corré el esquema de <code>supabase/schema.sql</code> en el SQL Editor de Supabase y después{" "}
          <code>npm run seed</code> con las variables de entorno puestas. El README tiene los pasos en orden.
        </p>
      </main>
    );
  }

  return (
    <Tablero
      competidores={competidores.data ?? []}
      senales={senales.data ?? []}
      backlogInicial={backlog.data ?? []}
      capturasIniciales={capturas.data ?? []}
      aprobacionesIniciales={aprobaciones.data ?? []}
      hilosIniciales={hilos.data ?? []}
      copysIniciales={copys.data ?? []}
      layoutsIniciales={layouts.data ?? []}
      variantesIniciales={variantes.data ?? []}
      paginas={home.data}
      corridas={corridas.data ?? []}
    />
  );
}
