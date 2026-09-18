"use client";

import { usePreferencia } from "./navegacion";

const PESTANAS = [
  ["criterios", "Criterios"],
  ["hallazgos", "Hallazgos"],
  ["benchmark", "Benchmark"],
  ["principios", "Principios UX"],
  ["ritmo", "Ritmo de fondos"],
  ["recursos", "Recursos de diseño"],
] as const;

const SEV: Record<string, string> = { crit: "Crítico", warn: "Alto", info: "Medio", ok: "Oportunidad" };
const NOMBRE_FONDO: Record<string, string> = { claro: "Claro", gris: "Gris", profundo: "Profundo", lima: "Lima" };

/**
 * El research que el agente produce, arriba de la propuesta y en pestañas para que no empuje
 * las secciones fuera de la pantalla.
 */
export function Research({ home, fondoDe }: { home: any; fondoDe: (sec: string) => string }) {
  const [tab, setTab] = usePreferencia<string>("research-tab", "criterios");
  const [oculto, setOculto] = usePreferencia<boolean>("research-oculto", false);
  const H = home.HOME ?? {};
  const disponibles = PESTANAS.filter(([k]) => tieneDatos(k, home));
  const activa = disponibles.some(([k]) => k === tab) ? tab : disponibles[0]?.[0];
  if (!disponibles.length) return null;

  return (
    <section className="rs" aria-label="Research">
      <div className="rs-h">
        <h3>Research</h3>
        {!oculto && (
          <div className="rs-tabs" role="tablist">
            {disponibles.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={activa === k} className="rs-tab" onClick={() => setTab(k)}>
                {label}
                {k === "hallazgos" && H.hallazgos?.length ? <span className="rs-cnt">{H.hallazgos.length}</span> : null}
              </button>
            ))}
          </div>
        )}
        <button className="rs-ocultar" onClick={() => setOculto(!oculto)} aria-expanded={!oculto}>
          {oculto ? "Mostrar" : "Ocultar"}
        </button>
      </div>

      {!oculto && (
        <div className="rs-b" role="tabpanel">
          {activa === "criterios" && <Criterios sb={H.scoreboard} />}
          {activa === "hallazgos" && <Hallazgos hallazgos={H.hallazgos} pendientes={H.pendientes} />}
          {activa === "benchmark" && <Benchmark filas={H.benchmark} revisa={home.REVISA} noRevisa={home.NO_REVISA} />}
          {activa === "principios" && <Principios ux={home.UX} />}
          {activa === "ritmo" && <Ritmo ux={home.UX} fondoDe={fondoDe} />}
          {activa === "recursos" && <Recursos r={home.RECURSOS} />}
        </div>
      )}
    </section>
  );
}

function tieneDatos(k: string, home: any) {
  const H = home.HOME ?? {};
  switch (k) {
    case "criterios": return !!H.scoreboard?.filas?.length;
    case "hallazgos": return !!H.hallazgos?.length;
    case "benchmark": return !!H.benchmark?.length;
    case "principios": return !!home.UX?.principios?.length;
    case "ritmo": return !!home.UX?.ritmo?.length;
    case "recursos": return !!home.RECURSOS?.lotes?.length;
  }
  return false;
}

function Criterios({ sb }: any) {
  const ninguna = sb.filas.every((f: any) => !f.crehana);
  return (
    <>
      <p className="rs-intro">{sb.titulo}{ninguna ? " · Crehana no cumple ninguno hoy" : ""}</p>
      <div className="board mini">
        {sb.filas.map((f: any) => (
          <div className="brow" key={f.c} title={f.dato}>
            <div className="blabel">{f.c}</div>
            <div className="btrack"><div className="bfill" style={{ width: `${(f.n / f.de) * 100}%` }} /></div>
            <div className="bnum">{f.n}/{f.de}</div>
            <div className={"bcre " + (f.crehana ? "si" : "no")} aria-label={f.crehana ? "Crehana lo cumple" : "Crehana no lo cumple"}>
              {f.crehana ? "✓" : "✕"}
            </div>
          </div>
        ))}
      </div>
      {sb.nota && <p className="rs-nota">{sb.nota}</p>}
    </>
  );
}

function Hallazgos({ hallazgos, pendientes }: any) {
  const orden: Record<string, number> = { crit: 0, warn: 1, info: 2, ok: 3 };
  const lista = [...hallazgos].sort((a, b) => (orden[a.sev] ?? 9) - (orden[b.sev] ?? 9));
  return (
    <div className="rs-dos">
      <ol className="rs-hall">
        {lista.map((h: any, i: number) => (
          <li key={i}>
            <span className={"sev " + h.sev}>{SEV[h.sev] ?? h.sev}</span>
            <div><b>{h.t}</b><p>{h.d}</p></div>
          </li>
        ))}
      </ol>
      {pendientes?.length > 0 && (
        <aside className="rs-bloq">
          <h4>Bloquea el avance</h4>
          <ul>{pendientes.map((p: string) => <li key={p}>{p}</li>)}</ul>
        </aside>
      )}
    </div>
  );
}

function Benchmark({ filas, revisa, noRevisa }: any) {
  return (
    <>
      <div className="rs-scroll">
        <table className="bench mini">
          <thead>
            <tr><th>Marca</th><th>Titular</th><th>IA</th><th>Nómina</th><th>Prueba social</th><th>La lectura</th></tr>
          </thead>
          <tbody>
            {filas.map((f: any) => (
              <tr key={f.marca}>
                <td className="bn">{f.marca}</td><td>{f.h1}</td><td>{f.ia}</td>
                <td>{f.nomina}</td><td>{f.social}</td><td className="lectura">{f.lectura}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(revisa?.length || noRevisa?.length) && (
        <div className="rs-cob">
          {revisa?.length > 0 && <div><h4>Qué mira el agente</h4><ul>{revisa.map((x: string) => <li key={x}>{x}</li>)}</ul></div>}
          {noRevisa?.length > 0 && <div><h4>Qué no puede ver</h4><ul>{noRevisa.map((x: string) => <li key={x}>{x}</li>)}</ul></div>}
        </div>
      )}
    </>
  );
}

function Principios({ ux }: any) {
  return (
    <>
      {ux.resumen && <p className="rs-intro">{ux.resumen}</p>}
      <div className="rs-princ">
        {ux.principios.map((p: any) => (
          <article key={p.t} className="rs-p">
            <h4>{p.t}</h4>
            <p>{p.d}</p>
            {p.a && <p className="rs-apl"><b>En nuestra home:</b> {p.a}</p>}
            {p.f && <span className="rs-fuente">{p.f}</span>}
          </article>
        ))}
      </div>
    </>
  );
}

/** Compara la regla de alternancia contra el fondo que tiene hoy cada maqueta, no contra el plan. */
function Ritmo({ ux, fondoDe }: any) {
  const filas = ux.ritmo.map((r: any) => ({ ...r, hoy: fondoDe(r.n) || r.fondo }));
  const repetidas = new Set<string>();
  filas.forEach((r: any, i: number) => { if (i > 0 && filas[i - 1].hoy === r.hoy) { repetidas.add(r.n); repetidas.add(filas[i - 1].n); } });
  const profundas = filas.filter((r: any) => r.hoy === "profundo").length;
  const ok = repetidas.size === 0 && profundas <= 3;

  return (
    <>
      <div className="rs-ritmo">
        {filas.map((r: any) => (
          <div key={r.n} className={"rs-rit" + (repetidas.has(r.n) ? " choca" : "")} title={r.why}>
            <div className={"rs-sw f-" + r.hoy} />
            <span className="rs-rit-n">{r.n}</span>
            <span className="rs-rit-t">{r.t}</span>
            <span className="rs-rit-f">{NOMBRE_FONDO[r.hoy] ?? r.hoy}{r.hoy !== r.fondo ? ` · plan: ${NOMBRE_FONDO[r.fondo] ?? r.fondo}` : ""}</span>
          </div>
        ))}
      </div>
      <p className={"rs-regla " + (ok ? "ok" : "mal")}>
        {ok
          ? "La página cumple la regla."
          : [repetidas.size ? "Hay secciones seguidas con el mismo fondo (marcadas en rojo)." : "",
             profundas > 3 ? `Hay ${profundas} bloques profundos; el máximo es 3.` : ""].filter(Boolean).join(" ")}
        {" "}{ux.ritmoNota}
      </p>
    </>
  );
}

function Recursos({ r }: any) {
  const piezas = r.lotes.flatMap((l: any) => l.piezas);
  const porProducir = piezas.filter((p: any) => p.estado !== "listo" && p.estado !== "publicado").length;
  return (
    <>
      {r.resumen && <p className="rs-intro">{r.resumen}</p>}
      <p className="rs-meta">{piezas.length} piezas en {r.lotes.length} secciones · {porProducir} por producir</p>
      <div className="rs-scroll">
        <table className="bench mini">
          <thead><tr><th>Sección</th><th>Pieza</th><th>Cantidad</th><th>Formato</th><th>Esfuerzo</th><th>Estado</th></tr></thead>
          <tbody>
            {r.lotes.flatMap((l: any) =>
              l.piezas.map((p: any, i: number) => (
                <tr key={l.sec + p.n}>
                  {i === 0 && <td className="bn" rowSpan={l.piezas.length}>{l.sec} · {l.t}</td>}
                  <td><b>{p.n}</b><br /><span className="rs-d">{p.d}</span></td>
                  <td>{p.q}</td><td>{p.f}</td><td>{p.e}</td>
                  <td><span className={"rs-est " + (p.estado === "por producir" ? "pend" : "")}>{p.estado}</span></td>
                </tr>
              )))}
          </tbody>
        </table>
      </div>
      {r.transversal?.length > 0 && (
        <div className="rs-trans">
          <h4>Para todas las secciones</h4>
          <ul>{r.transversal.map((t: any) => <li key={t.n}><b>{t.n}.</b> {t.d}</li>)}</ul>
        </div>
      )}
    </>
  );
}
