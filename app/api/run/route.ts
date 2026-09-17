import { NextResponse } from "next/server";

/** Dispara la corrida en GitHub Actions. Lo usa el botón "Correr ahora". */
export async function POST(req: Request) {
  const { secreto } = await req.json().catch(() => ({ secreto: "" }));
  if (!process.env.RUN_SECRET || secreto !== process.env.RUN_SECRET) {
    return NextResponse.json({ error: "Secreto inválido" }, { status: 401 });
  }
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    return NextResponse.json({ error: "Falta GITHUB_REPO o GITHUB_DISPATCH_TOKEN" }, { status: 500 });
  }
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/sherlock.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!r.ok) {
    return NextResponse.json({ error: `GitHub respondió ${r.status}: ${await r.text()}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, mensaje: "Corrida lanzada. Tarda entre 5 y 15 minutos." });
}
