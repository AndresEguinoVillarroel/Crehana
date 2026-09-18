"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

/* ---------------- íconos ---------------- */

const TRAZOS: Record<string, string> = {
  buscar: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3",
  pagina: "M7 3h7l5 5v13H7zM14 3v5h5",
  lista: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  reloj: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  plegar: "m15 6-6 6 6 6",
  desplegar: "m9 6 6 6-6 6",
  flecha: "m9 6 6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  correr: "M8 5v14l11-7z",
  comentario: "M4 5h16v11H9l-5 4z",
  presentar: "M3 4h18v12H3zM12 16v4M8 20h8",
  cerrar: "M6 6l12 12M18 6 6 18",
  check: "m5 12 5 5L20 7",
  lapiz: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  duplicar: "M8 8h12v12H8zM4 16V4h12",
  basura: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  agarre: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  izq: "M19 12H5m6-6-6 6 6 6",
  der: "M5 12h14m-6-6 6 6-6 6",
  "alin-izq": "M4 6h16M4 10h10M4 14h16M4 18h10",
  "alin-centro": "M4 6h16M7 10h10M4 14h16M7 18h10",
  "alin-der": "M4 6h16M10 10h10M4 14h16M10 18h10",
};

export function Ic({ n, className }: { n: string; className?: string }) {
  return (
    <svg className={"ic " + (className ?? "")} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={TRAZOS[n]} />
    </svg>
  );
}

/* ---------------- preferencias que recuerda el navegador ---------------- */

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem("sherlock:" + clave);
    return v === null ? porDefecto : JSON.parse(v);
  } catch {
    return porDefecto;
  }
}
function escribir(clave: string, valor: unknown) {
  try { localStorage.setItem("sherlock:" + clave, JSON.stringify(valor)); } catch {}
}

/** Estado persistido por navegador. Se lee después de montar para no romper la hidratación. */
export function usePreferencia<T>(clave: string, porDefecto: T) {
  const [valor, setValor] = useState<T>(porDefecto);
  useEffect(() => { setValor(leer(clave, porDefecto)); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const poner = (v: T) => { setValor(v); escribir(clave, v); };
  return [valor, poner] as const;
}

/* ---------------- fechas de corrida ---------------- */

const LA_PAZ = "America/La_Paz";

/** El cron corre los lunes a las 12:00 UTC, que son las 08:00 en La Paz. */
function proximaCorrida(ahora: Date) {
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 12));
  let dias = (8 - d.getUTCDay()) % 7;
  if (dias === 0 && ahora >= d) dias = 7;
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", timeZone: LA_PAZ });

/* ---------------- sidebar ---------------- */

export type Destino = { vista: string; pagina?: string; comp?: string; sec?: string };

export function Sidebar(p: {
  competidores: any[]; senales: any[]; paginas: any[]; corridas: any[]; backlog: any[];
  vista: string; pagina: string; actual: string; seccionActiva: string | null;
  ir: (d: Destino) => void; yo: string; setYo: (v: string) => void; personas: string[];
  mini: boolean; setMini: (v: boolean) => void; menu: boolean; abrirPaleta: () => void;
}) {
  const [plegados, setPlegados] = usePreferencia<Record<string, boolean>>("plegados", {});
  const alternar = (id: string) => setPlegados({ ...plegados, [id]: !plegados[id] });

  const [proxima, setProxima] = useState<string>("");
  useEffect(() => { setProxima(fechaCorta(proximaCorrida(new Date()))); }, []);

  const ultima = p.corridas[0];
  const mini = p.mini && !p.menu;

  /* Función y no componente: un componente definido acá se remontaría en cada render. */
  const grupo = (id: string, titulo: string, children: React.ReactNode) => (
    <div className="sbg">
      {!mini && (
        <button className="sbg-h" aria-expanded={!plegados[id]} onClick={() => alternar(id)}>
          <Ic n="flecha" className={"sbg-fl" + (plegados[id] ? "" : " abierto")} />
          {titulo}
        </button>
      )}
      {(mini || !plegados[id]) && <div className="sbg-b">{children}</div>}
    </div>
  );

  return (
    <aside className={"sb" + (mini ? " mini" : "") + (p.menu ? " open" : "")} aria-label="Navegación">
      <div className="sb-top">
        <div className="brand" title="Sherlock · Crehana">
          <div className="dot" />
          {!mini && <div><b>Sherlock</b><small>Crehana · radar</small></div>}
        </div>
        {!p.menu && (
          <button className="sb-ic" onClick={() => p.setMini(!p.mini)}
            aria-label={p.mini ? "Expandir barra lateral" : "Contraer barra lateral"}
            title={(p.mini ? "Expandir" : "Contraer") + " · Ctrl+\\"}>
            <Ic n={p.mini ? "desplegar" : "plegar"} />
          </button>
        )}
      </div>

      <button className="sb-buscar" onClick={p.abrirPaleta} title="Buscar · Ctrl+K">
        <Ic n="buscar" />
        {!mini && <><span>Buscar</span><kbd>Ctrl K</kbd></>}
      </button>

      <nav className="sb-nav">
        {grupo("web", "Mejoras website", <>
          {p.paginas.map((pg: any) => {
            const secciones = pg.data?.HOME?.secciones ?? [];
            const aqui = p.pagina === pg.id;
            const abierta = !plegados["pg:" + pg.id];
            const pend = p.backlog.filter((b) => (b.pagina ?? "home") === pg.id && b.estado !== "publicado").length;
            return (
              <Fragment key={pg.id}>
                <div className="it-fila">
                  {!mini && secciones.length > 0 && (
                    <button className="it-tg" aria-label={abierta ? "Ocultar secciones" : "Ver secciones"}
                      aria-expanded={abierta} onClick={() => alternar("pg:" + pg.id)}>
                      <Ic n="flecha" className={abierta ? "abierto" : ""} />
                    </button>
                  )}
                  <button className="it" aria-current={p.vista === "home" && aqui} title={pg.data?.HOME?.nombre ?? pg.id}
                    onClick={() => p.ir({ vista: "home", pagina: pg.id })}>
                    <Ic n="pagina" />
                    {!mini && <span className="it-t">{pg.data?.HOME?.nombre ?? pg.id}</span>}
                  </button>
                </div>
                {!mini && abierta && (
                  <div className="sub">
                    {secciones.map((s: any) => (
                      <button key={s.n} className="it sub-it"
                        aria-current={p.vista === "home" && aqui && p.seccionActiva === s.n}
                        onClick={() => p.ir({ vista: "home", pagina: pg.id, sec: s.n })}>
                        <span className="sub-n">{s.n}</span>
                        <span className="it-t">{s.t}</span>
                      </button>
                    ))}
                    <button className="it sub-it" aria-current={p.vista === "backlog" && aqui}
                      onClick={() => p.ir({ vista: "backlog", pagina: pg.id })}>
                      <Ic n="lista" />
                      <span className="it-t">Backlog</span>
                      {pend > 0 && <span className="cnt">{pend}</span>}
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
        </>)}

        {grupo("radar", "Radar", <>
          <button className="it" aria-current={p.vista === "historial"} title="Historial de corridas"
            onClick={() => p.ir({ vista: "historial" })}>
            <Ic n="reloj" />
            {!mini && <><span className="it-t">Historial</span>{ultima && <span className="cnt">C{String(ultima.n).padStart(2, "0")}</span>}</>}
          </button>
        </>)}

        {(["competidor", "referente"] as const).map((tipo) => (
          <Fragment key={tipo}>{grupo(tipo, tipo === "competidor" ? "Competidores" : "Referentes", <>
            {p.competidores.filter((c) => c.tipo === tipo).map((c) => {
              const suyas = p.senales.filter((s) => s.competidor === c.id);
              const crit = suyas.filter((s) => s.sev === "crit").length;
              return (
                <button key={c.id} className="it"
                  aria-current={(p.vista === "senales" || p.vista === "resumen") && p.actual === c.id}
                  title={`${c.nombre} · ${suyas.length} señales${crit ? `, ${crit} críticas` : ""}`}
                  onClick={() => p.ir({ vista: p.vista === "resumen" ? "resumen" : "senales", comp: c.id })}>
                  <span className={"av" + (tipo === "referente" ? " ref" : "")}>
                    {c.nombre.slice(0, 2).toUpperCase()}
                    {mini && crit > 0 && <i className="av-crit" />}
                  </span>
                  {!mini && (
                    <>
                      <span className="it-t">{c.nombre}</span>
                      {crit > 0 && <span className="crit" aria-label={`${crit} críticas`}>{crit}</span>}
                      <span className="cnt">{suyas.length || "—"}</span>
                    </>
                  )}
                </button>
              );
            })}
          </>)}</Fragment>
        ))}
      </nav>

      <div className="sb-foot">
        {!mini && ultima && (
          <div className="corrida">
            <span className="live on">Corrida {ultima.n} · {fechaCorta(new Date(ultima.fecha + "T12:00:00Z"))}</span>
            {proxima && <span className="prox">Próxima: {proxima} · 08:00</span>}
          </div>
        )}
        <label className="yo" title="Con qué nombre comentás y aprobás">
          <span className="av yo-av">{p.yo.slice(0, 1)}</span>
          {!mini && (
            <>
              <span className="yo-t"><small>Comentás como</small>
                <select value={p.yo} onChange={(e) => p.setYo(e.target.value)} aria-label="Comentás como">
                  {p.personas.map((x) => <option key={x}>{x}</option>)}
                </select>
              </span>
            </>
          )}
        </label>
      </div>
    </aside>
  );
}

/* ---------------- paleta de comandos (Ctrl+K) ---------------- */

type Opcion = { grupo: string; texto: string; detalle?: string; destino: Destino };

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Paleta({ abierta, cerrar, ir, paginas, competidores, backlog }: {
  abierta: boolean; cerrar: () => void; ir: (d: Destino) => void;
  paginas: any[]; competidores: any[]; backlog: any[];
}) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const campo = useRef<HTMLInputElement | null>(null);

  const opciones = useMemo<Opcion[]>(() => {
    const o: Opcion[] = [];
    for (const pg of paginas) {
      const nombre = pg.data?.HOME?.nombre ?? pg.id;
      o.push({ grupo: "Páginas", texto: nombre, detalle: "Mejoras website", destino: { vista: "home", pagina: pg.id } });
      for (const s of pg.data?.HOME?.secciones ?? []) {
        o.push({ grupo: "Secciones", texto: `${s.n} · ${s.t}`, detalle: nombre, destino: { vista: "home", pagina: pg.id, sec: s.n } });
      }
      o.push({ grupo: "Páginas", texto: `Backlog de ${nombre}`, detalle: "Mejoras website", destino: { vista: "backlog", pagina: pg.id } });
    }
    for (const c of competidores) {
      const tipo = c.tipo === "referente" ? "Referente" : "Competidor";
      o.push({ grupo: "Radar", texto: `${c.nombre} · señales`, detalle: tipo, destino: { vista: "senales", comp: c.id } });
      o.push({ grupo: "Radar", texto: `${c.nombre} · resumen`, detalle: tipo, destino: { vista: "resumen", comp: c.id } });
    }
    o.push({ grupo: "Radar", texto: "Historial de corridas", destino: { vista: "historial" } });
    for (const b of backlog) {
      o.push({ grupo: "Backlog", texto: b.titulo, detalle: `Sección ${b.seccion} · ${b.estado}`,
        destino: { vista: "backlog", pagina: b.pagina ?? "home" } });
    }
    return o;
  }, [paginas, competidores, backlog]);

  /* Cada palabra tiene que aparecer, en cualquier orden: "rankmi señ" encuentra "Rankmi · señales". */
  const lista = useMemo(() => {
    const partes = plano(q).split(/\s+/).filter(Boolean);
    const f = partes.length
      ? opciones.filter((o) => {
          const heno = plano(o.texto + " " + (o.detalle ?? ""));
          return partes.every((p) => heno.includes(p));
        })
      : opciones;
    return f.slice(0, 40);
  }, [q, opciones]);

  useEffect(() => {
    if (!abierta) return;
    setQ(""); setI(0);
    requestAnimationFrame(() => campo.current?.focus());
  }, [abierta]);
  useEffect(() => { setI(0); }, [q]);

  if (!abierta) return null;

  const elegir = (o?: Opcion) => { if (!o) return; ir(o.destino); cerrar(); };

  return (
    <div className="pal-velo" onMouseDown={cerrar}>
      <div className="pal-caja" role="dialog" aria-modal="true" aria-label="Buscar en Sherlock" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-in">
          <Ic n="buscar" />
          <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscá una página, sección, competidor o cambio del backlog…"
            role="combobox" aria-expanded="true" aria-controls="pal-lista"
            aria-activedescendant={lista[i] ? `pal-op-${i}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(i + 1, lista.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(i - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); elegir(lista[i]); }
              if (e.key === "Escape") { e.preventDefault(); cerrar(); }
            }} />
          <kbd>Esc</kbd>
        </div>
        <ul className="pal-lista" id="pal-lista" role="listbox">
          {lista.length === 0 && <li className="pal-vacio">Nada coincide con “{q}”.</li>}
          {lista.map((o, k) => (
            <Fragment key={k}>
              {(k === 0 || lista[k - 1].grupo !== o.grupo) && <li className="pal-g" role="presentation">{o.grupo}</li>}
              <li id={`pal-op-${k}`} role="option" aria-selected={k === i} className="pal-op"
                onMouseEnter={() => setI(k)} onMouseDown={(e) => { e.preventDefault(); elegir(o); }}>
                <span className="pal-t">{o.texto}</span>
                {o.detalle && <span className="pal-d">{o.detalle}</span>}
              </li>
            </Fragment>
          ))}
        </ul>
        <div className="pal-pie"><kbd>↑</kbd><kbd>↓</kbd> moverse <kbd>Enter</kbd> abrir <kbd>Ctrl K</kbd> abrir o cerrar</div>
      </div>
    </div>
  );
}

/* ---------------- estado de guardado ---------------- */

export type EstadoGuardado = { estado: "listo" | "guardando" | "error"; detalle?: string };

export function Guardado({ g }: { g: EstadoGuardado }) {
  if (g.estado === "guardando") return <span className="gd guardando" role="status"><span className="gd-t">Guardando…</span></span>;
  if (g.estado === "error") {
    return (
      <span className="gd error" role="alert" title={g.detalle}>
        <span className="gd-t">No se guardó · {g.detalle}</span>
      </span>
    );
  }
  return <span className="gd listo" role="status" title="Todo guardado"><span className="gd-t">Guardado</span></span>;
}
