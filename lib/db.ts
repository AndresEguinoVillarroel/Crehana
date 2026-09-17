import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cliente para el navegador y para las páginas del tablero. */
export const db = createClient(url, anon, { auth: { persistSession: false } });

/** Cliente con permisos plenos: solo en el cron y en los scripts, nunca en el cliente. */
export function adminDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type Seccion = {
  n: string; t: string; estado: string; copy: string;
  bajada: string; nota: string; porque: string; cuesta?: string;
};
