"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { aBloques, acomodar, alto, proximoY, topar, COLS, type Blk } from "@/lib/maqueta";

const REVISORES = ["Xime", "Yess"];
const PERSONAS = ["Andrés", "Xime", "Yess", "Yeni"];
const SEV: Record<string, string> = { crit: "Crítica", warn: "Alta", info: "Media", ok: "Oportunidad" };
const VISTAS = [
  ["resumen", "Resumen"],
  ["senales", "Señales"],
  ["home", "Mejoras website"],
  ["backlog", "Backlog"],
  ["historial", "Historial"],
] as const;

type Vista = (typeof VISTAS)[number][0];

export default function Tablero(props: any) {
  const { competidores, senales, paginas, corridas } = props;
  const [vista, setVista] = useState<Vista>("home");
  const [pagina, setPagina] = useState<string>(paginas[0]?.id ?? "home");
  const [actual, setActual] = useState<string>(competidores[0]?.id ?? "buk");
  const [backlog, setBacklog] = useState<any[]>(props.backlogInicial);
  const [capturas, setCapturas] = useState<any[]>(props.capturasIniciales);
  const [aprob, setAprob] = useState<any[]>(props.aprobacionesIniciales);
  const [hilos, setHilos] = useState<any[]>(props.hilosIniciales);
  const [copys, setCopys] = useState<any[]>(props.copysIniciales);
  const [layouts, setLayouts] = useState<any[]>(props.layoutsIniciales);
  const [yo, setYo] = useState("Andrés");
  const [aviso, setAviso] = useState("");

  /* Tiempo real: lo que decide una persona lo ven todas. */
  useEffect(() => {
    const canal = db
      .channel("tablero")
      .on("postgres_changes", { event: "*", schema: "public" }, async (payload: any) => {
        const tabla = payload.table;
        const setters: Record<string, any> = {
          backlog: setBacklog, capturas: setCapturas, aprobaciones: setAprob,
          hilos: setHilos, copys: setCopys, layouts: setLayouts,
        };
        if (!setters[tabla]) return;
        const { data } = await db.from(tabla).select("*");
        setters[tabla](data ?? []);
      })
      .subscribe();
    return () => { db.removeChannel(canal); };
  }, []);

  /* Todo lo de esta vista vive dentro de una página del sitio. */
  const home = paginas.find((p: any) => p.id === pagina)?.data ?? {};
  const enEstaPagina = (fila: any) => (fila.pagina ?? "home") === pagina;

  const comp = competidores.find((c: any) => c.id === actual) ?? competidores[0];
  const misSenales = senales.filter((s: any) => s.competidor === comp?.id);
  const cap = (id: string) => capturas.find((c: any) => c.id === id);
  const copyDe = (sec: string, k: string) =>
    copys.find((c: any) => enEstaPagina(c) && c.seccion === sec)?.valores?.[k] ?? home.COPY_DEF?.[sec]?.[k] ?? "";
  const layoutDe = (sec: string) => layouts.find((l: any) => enEstaPagina(l) && l.seccion === sec);
  const aprobado = (clave: string) =>
    REVISORES.filter((r) => aprob.find((a: any) => a.id === `${pagina}/${clave}__${r}` && a.valor === "si"));
  /** Clave de hilo de comentarios de una sección, dentro de su página. */
  const claveSec = (sec: string) => `${pagina}/sec-${sec}`;

  async function guardarAprob(clave: string, revisora: string, valor: string | null) {
    const alcance = `${pagina}/${clave}`;
    const id = `${alcance}__${revisora}`;
    if (valor === null) {
      setAprob((v) => v.filter((a) => a.id !== id));
      await db.from("aprobaciones").delete().eq("id", id);
    } else {
      const fila = { id, clave: alcance, revisora, valor, actualizado: new Date().toISOString() };
      setAprob((v) => [...v.filter((a) => a.id !== id), fila]);
      const { error } = await db.from("aprobaciones").upsert(fila);
      if (error) setAviso("No se pudo guardar: " + error.message);
    }
  }

  async function comentar(clave: string, texto: string, padre?: string) {
    if (!texto.trim()) return;
    const fila = {
      id: "c" + Date.now().toString(36), clave, padre: padre ?? null,
      autor: yo, texto: texto.trim(), creado: new Date().toISOString(),
    };
    setHilos((v) => [...v, fila]);
    const { error } = await db.from("hilos").insert(fila);
    if (error) setAviso("No se pudo comentar: " + error.message);
  }

  const otraSeccion = (fila: any, sec: string) => !(enEstaPagina(fila) && fila.seccion === sec);

  async function guardarCopy(sec: string, k: string, valor: string) {
    const previo = copys.find((c: any) => enEstaPagina(c) && c.seccion === sec)?.valores ?? {};
    const valores = { ...previo, [k]: valor };
    setCopys((v) => [...v.filter((c) => otraSeccion(c, sec)), { pagina, seccion: sec, valores }]);
    const { error } = await db.from("copys").upsert({ pagina, seccion: sec, valores, actualizado: new Date().toISOString() });
    if (error) setAviso("No se pudo guardar el copy: " + error.message);
  }

  async function guardarLayout(sec: string, fondo: string, bloques: any[]) {
    setLayouts((v) => [...v.filter((l) => otraSeccion(l, sec)), { pagina, seccion: sec, fondo, bloques }]);
    const { error } = await db.from("layouts").upsert({ pagina, seccion: sec, fondo, bloques, actualizado: new Date().toISOString() });
    if (error) setAviso("No se pudo guardar la maqueta: " + error.message);
  }

  /** Borra el override y devuelve la sección al wireframe que propuso el agente. */
  async function borrarLayout(sec: string) {
    setLayouts((v) => v.filter((l) => otraSeccion(l, sec)));
    const { error } = await db.from("layouts").delete().eq("pagina", pagina).eq("seccion", sec);
    if (error) setAviso("No se pudo restaurar: " + error.message);
  }

  async function correrAhora() {
    const secreto = window.prompt("Clave para lanzar la corrida:");
    if (!secreto) return;
    setAviso("Lanzando la corrida…");
    const r = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secreto }),
    });
    const j = await r.json();
    setAviso(r.ok ? j.mensaje : "No se pudo lanzar: " + j.error);
  }

  const abiertos = backlog.filter((b) => enEstaPagina(b) && b.estado !== "publicado").length;

  return (
    <div className="app">
      <aside className="sb">
        <div className="brand">
          <div className="dot" />
          <div>
            <b>Sherlock</b>
            <small>Radar competitivo</small>
          </div>
        </div>

        {["competidor", "referente"].map((tipo) => (
          <div className="sb-group" key={tipo}>
            <div className="sb-h">{tipo === "competidor" ? "Competidores" : "Referentes"}</div>
            {competidores.filter((c: any) => c.tipo === tipo).map((c: any) => (
              <button key={c.id} className="comp" aria-current={c.id === actual}
                onClick={() => { setActual(c.id); setVista("senales"); }}>
                <span className={"av" + (tipo === "referente" ? " ref" : "")}>{c.nombre.slice(0, 2).toUpperCase()}</span>
                <span>{c.nombre}</span>
                <span className="cnt">{senales.filter((s: any) => s.competidor === c.id).length || "—"}</span>
              </button>
            ))}
          </div>
        ))}

        <div className="sb-group">
          <div className="sb-h">Vistas</div>
          {VISTAS.map(([k, label]) => (
            <button key={k} className="nav" aria-current={vista === k} onClick={() => setVista(k as Vista)}>
              {label}
              {k === "backlog" && abiertos ? <span className="cnt">{abiertos}</span> : null}
            </button>
          ))}
        </div>

        <div className="sb-foot">
          Comentás como{" "}
          <select value={yo} onChange={(e) => setYo(e.target.value)} className="quien">
            {PERSONAS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <br />
          Próxima corrida: lunes 08:00
        </div>
      </aside>

      <main className="main">
        <div className="bar">
          <div className="bar-in">
            <div>
              <h2>{VISTAS.find(([k]) => k === vista)?.[1]}</h2>
              <div className="crumb">
                {vista === "home"
                  ? `${home.HOME?.tarea ?? ""} · ${aprobado("01").length ? "en revisión" : "prioridad 1"}`
                  : `${comp?.nombre ?? ""} · corrida ${corridas[0]?.n ?? "—"}`}
              </div>
            </div>
            <div className="bar-right">
              {(vista === "home" || vista === "backlog") && (
                <div className="pgs" role="tablist" aria-label="Página del sitio">
                  {paginas.map((p: any) => (
                    <button key={p.id} className="pg" role="tab" aria-selected={p.id === pagina}
                      onClick={() => setPagina(p.id)}>
                      {p.data?.HOME?.nombre ?? p.id}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn ghost" onClick={correrAhora}>▶ Correr ahora</button>
            </div>
          </div>
        </div>

        <div className="view">
          {vista === "home" && (
            <PropuestaHome
              home={home} copyDe={copyDe} guardarCopy={guardarCopy}
              layoutDe={layoutDe} guardarLayout={guardarLayout} borrarLayout={borrarLayout}
              cap={cap} backlog={backlog} aprob={aprob} aprobado={aprobado}
              guardarAprob={guardarAprob} hilos={hilos} comentar={comentar} yo={yo}
              pagina={pagina} claveSec={claveSec} enEstaPagina={enEstaPagina}
            />
          )}
          {vista === "senales" && <Senales comp={comp} senales={misSenales} cap={cap} />}
          {vista === "resumen" && <Resumen comp={comp} senales={misSenales} corridas={corridas} />}
          {vista === "backlog" && (
            <Backlog backlog={backlog} setBacklog={setBacklog} home={home} enEstaPagina={enEstaPagina}
              aprobado={aprobado} guardarAprob={guardarAprob} hilos={hilos} comentar={comentar} setAviso={setAviso} />
          )}
          {vista === "historial" && <Historial corridas={corridas} />}
        </div>
      </main>

      {aviso && <div className="toast on" onClick={() => setAviso("")}>{aviso}</div>}
    </div>
  );
}

/* ---------------- Propuesta de home ---------------- */

function PropuestaHome({ home, copyDe, guardarCopy, layoutDe, guardarLayout, borrarLayout, cap, backlog, aprobado, guardarAprob, hilos, comentar, yo, pagina, claveSec, enEstaPagina }: any) {
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});
  const secciones = home.HOME?.secciones ?? [];
  const sb = home.HOME?.scoreboard;

  return (
    <>
      <div className="hero hero-min">
        <div className="eyebrow">Propuesta · basada en la vigilancia semanal</div>
        <h1>La home no dice que Crehana tiene IA, ni que paga la nómina.</h1>
        <p>{home.HOME?.objetivo}</p>
      </div>

      {sb && (
        <section className="sec">
          <div className="sec-h"><h3>{sb.titulo}</h3><span>ninguna la cumple Crehana hoy</span></div>
          <div className="board">
            {sb.filas.map((f: any) => (
              <div className="brow" key={f.c} title={f.dato}>
                <div className="blabel">{f.c}</div>
                <div className="btrack"><div className="bfill" style={{ width: `${(f.n / f.de) * 100}%` }} /></div>
                <div className="bnum">{f.n}/{f.de}</div>
                <div className={"bcre " + (f.crehana ? "si" : "no")}>{f.crehana ? "✓" : "✕"}</div>
              </div>
            ))}
          </div>
          <p className="board-note">{sb.nota}</p>
        </section>
      )}

      <section className="sec">
        <div className="sec-h">
          <h3>La home propuesta, sección por sección</h3>
          <span>{secciones.filter((s: any) => aprobado(s.n).length === REVISORES.length).length} de {secciones.length} con doble visto bueno</span>
        </div>

        {secciones.map((x: any) => {
          const pend = backlog.filter((b: any) => enEstaPagina(b) && b.seccion === x.n && b.estado !== "publicado").length;
          const nC = hilos.filter((c: any) => c.clave === claveSec(x.n)).length;
          return (
            <div className="sc" key={x.n} id={`sc-${x.n}`}>
              <div className="sc-h">
                <span className="sc-n">{x.n}</span>
                <span className="sc-t">{x.t}</span>
                <span className="sc-e">{x.estado}</span>
                {pend > 0 && <span className="sc-p">{pend} en backlog</span>}
                <span className="sc-m">{x.cuesta}</span>
              </div>
              <div className="sc-b">
                <div className="sc-copy">{x.copy}</div>
                <p className="sc-baj">{x.bajada}</p>
                <div className="sc-notas">
                  <div className="sc-nota"><b>Nota de producción.</b> {x.nota}</div>
                  <div className="sc-why"><b>Por qué.</b> {x.porque}</div>
                </div>

                <Maqueta
                  sec={x.n} home={home} copyDe={copyDe} guardarCopy={guardarCopy}
                  layoutDe={layoutDe} guardarLayout={guardarLayout} borrarLayout={borrarLayout}
                  edit={!!edit[x.n]} setEdit={(v: boolean) => setEdit({ ...edit, [x.n]: v })}
                />

                <div className="shot-trio">
                  {[["comp", "Competidor"], ["ref", "Referente"], ["cre", "Crehana hoy"]].map(([suf, label]) => {
                    const c = cap(`${pagina}/sec-${x.n}-${suf}`);
                    return (
                      <div className="shot" key={suf}>
                        <div className="shot-lab">{label}</div>
                        {c ? (
                          <figure className="shot-fig">
                            <img src={c.url} alt={`${label} · sección ${x.n}`} loading="lazy" />
                            <figcaption>{c.pie}</figcaption>
                          </figure>
                        ) : (
                          <div className="shot-slot">Sin captura todavía</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="sc-f">
                  <Aprobacion clave={x.n} aprob={null} aprobado={aprobado} guardar={guardarAprob} />
                  <button className="sc-cm" onClick={() => setAbierto({ ...abierto, [x.n]: !abierto[x.n] })}>
                    {abierto[x.n] ? "Ocultar" : "Comentarios"}{nC ? ` (${nC})` : ""}
                  </button>
                </div>
                {abierto[x.n] && <Hilo clave={claveSec(x.n)} hilos={hilos} comentar={comentar} yo={yo} />}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ---------------- La Maqueta: canvas imantado ---------------- */

const FONDOS = [["claro", "Claro"], ["gris", "Gris"], ["profundo", "Morado profundo"], ["lima", "Lima"]];
const FILA_PX = 24;
const GAP_PX = 10;

/** Lo que se puede insertar, agrupado por familia. */
const PALETA: [string, string, string, number][] = [
  ["Texto", "h1", "Titular", 8],
  ["Texto", "h2", "Título", 8],
  ["Texto", "sub", "Bajada", 7],
  ["Texto", "eyebrow", "Eyebrow", 5],
  ["Texto", "nota", "Nota", 6],
  ["Acción", "cta", "CTA primario", 3],
  ["Acción", "cta2", "CTA secundario", 3],
  ["Acción", "form", "Formulario", 5],
  ["Contenido", "mock", "Captura", 6],
  ["Contenido", "mockmini", "Captura chica", 4],
  ["Contenido", "logos", "Logos", 8],
  ["Contenido", "cifra", "Métrica", 3],
  ["Contenido", "caso", "Testimonio", 3],
  ["Contenido", "agente", "Agente", 2],
  ["Contenido", "tabs", "Tabs", 12],
  ["Contenido", "bullets", "Bullets", 4],
  ["Contenido", "sellos", "Sellos", 6],
  ["Estructura", "nav", "Navegación", 12],
  ["Estructura", "flujo", "Flujo", 8],
  ["Estructura", "ph", "Espacio", 4],
];

function Maqueta({ sec, home, copyDe, guardarCopy, layoutDe, guardarLayout, borrarLayout, edit, setEdit }: any) {
  const base = home.WIRE?.[sec];
  const ov = layoutDe(sec);
  const hayOv = !!ov && !!(ov.bloques?.length || ov.filas?.length);

  const entrante = useMemo(
    () => JSON.stringify({
      fondo: (hayOv ? ov.fondo : base?.fondo) ?? "claro",
      bloques: aBloques(hayOv ? ov : base),
    }),
    [ov, base, hayOv]
  );

  const [spec, setSpec] = useState<any>(() => JSON.parse(entrante));
  const [sel, setSel] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [gesteando, setGesteando] = useState<string | null>(null);
  const [paleta, setPaleta] = useState(false);

  const specRef = useRef(spec);
  specRef.current = spec;
  const propio = useRef(entrante);
  const gesto = useRef(false);
  const timer = useRef<any>(null);
  const lienzo = useRef<HTMLDivElement | null>(null);

  /* Adopta lo que editó otra persona; ignora el eco de lo nuestro. */
  useEffect(() => {
    if (gesto.current || entrante === propio.current) return;
    setSpec(JSON.parse(entrante));
    propio.current = entrante;
  }, [entrante]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!base) return null;

  const bloques: Blk[] = spec.bloques;
  const filasAlto = Math.max(6, ...bloques.map((b) => b.y + b.h));

  /* Pinta ya, guarda agrupado. */
  function aplicar(next: any, ya = false) {
    setSpec(next);
    propio.current = JSON.stringify(next);
    clearTimeout(timer.current);
    if (ya) guardarLayout(sec, next.fondo, next.bloques);
    else timer.current = setTimeout(() => guardarLayout(sec, next.fondo, next.bloques), 400);
  }
  const conBloques = (bs: Blk[], fijo?: string, ya = true) =>
    aplicar({ ...specRef.current, bloques: acomodar(bs, fijo) }, ya);

  const unidadX = () => {
    const ancho = lienzo.current?.getBoundingClientRect().width ?? 1;
    return (ancho - (COLS - 1) * GAP_PX) / COLS + GAP_PX;
  };
  const unidadY = () => FILA_PX + GAP_PX;

  function restaurar() {
    clearTimeout(timer.current);
    const limpio = { fondo: base.fondo ?? "claro", bloques: aBloques(base) };
    setSpec(limpio);
    propio.current = JSON.stringify(limpio);
    setSel(null);
    borrarLayout(sec);
  }

  /** Un solo gesto para mover y para estirar: cambia qué campos toca. */
  function gestionar(e: any, id: string, modo: "mover" | "w" | "h" | "wh") {
    e.preventDefault();
    e.stopPropagation();
    gesto.current = true;
    setSel(id);
    setGesteando(id);
    const x0 = e.clientX, y0 = e.clientY;
    const ini = bloques.find((b) => b.id === id)!;
    const ux = unidadX(), uy = unidadY();

    const mover = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - x0) / ux);
      const dy = Math.round((ev.clientY - y0) / uy);
      const bs = specRef.current.bloques.map((b: Blk) => ({ ...b }));
      const b = bs.find((v: Blk) => v.id === id);
      if (!b) return;
      if (modo === "mover") {
        b.x = topar(ini.x + dx, 0, COLS - b.w);
        b.y = Math.max(0, ini.y + dy);
      }
      if (modo === "w" || modo === "wh") b.w = topar(ini.w + dx, 1, COLS - b.x);
      if (modo === "h" || modo === "wh") b.h = Math.max(1, ini.h + dy);
      aplicar({ ...specRef.current, bloques: acomodar(bs, id) });
    };
    const fin = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fin);
      gesto.current = false;
      setGesteando(null);
      clearTimeout(timer.current);
      guardarLayout(sec, specRef.current.fondo, specRef.current.bloques);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fin);
  }

  function insertar(t: string, w: number) {
    const usados = new Set(bloques.map((b) => b.id));
    let id = t, n = 1;
    while (usados.has(id)) id = `${t}-${++n}`;
    const nuevo: Blk = { id, t, x: 0, y: proximoY(bloques), w, h: alto(t) };
    conBloques([...bloques, nuevo], id);
    setSel(id);
    setPaleta(false);
  }
  function duplicar(id: string) {
    const o = bloques.find((b) => b.id === id);
    if (!o) return;
    const usados = new Set(bloques.map((b) => b.id));
    let nid = o.t, n = 1;
    while (usados.has(nid)) nid = `${o.t}-${++n}`;
    conBloques([...bloques, { ...o, id: nid, y: o.y + o.h }], nid);
    setSel(nid);
  }
  function borrar(id: string) {
    conBloques(bloques.filter((b) => b.id !== id));
    setSel(null);
  }
  function nudge(id: string, campo: "x" | "y" | "w" | "h", d: number) {
    const bs = bloques.map((b) => ({ ...b }));
    const b = bs.find((v) => v.id === id);
    if (!b) return;
    if (campo === "x") b.x = topar(b.x + d, 0, COLS - b.w);
    if (campo === "y") b.y = Math.max(0, b.y + d);
    if (campo === "w") b.w = topar(b.w + d, 1, COLS - b.x);
    if (campo === "h") b.h = Math.max(1, b.h + d);
    conBloques(bs, id);
  }

  function teclas(e: any) {
    if (!edit || !sel) return;
    const conShift = e.shiftKey;
    const mapa: Record<string, () => void> = {
      ArrowLeft: () => nudge(sel, conShift ? "w" : "x", -1),
      ArrowRight: () => nudge(sel, conShift ? "w" : "x", 1),
      ArrowUp: () => nudge(sel, conShift ? "h" : "y", -1),
      ArrowDown: () => nudge(sel, conShift ? "h" : "y", 1),
      Delete: () => borrar(sel),
      Backspace: () => borrar(sel),
      Escape: () => { setSel(null); setTexto(null); setPaleta(false); },
    };
    const fn = mapa[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
  }

  const b = sel ? bloques.find((v) => v.id === sel) : null;
  const familias = [...new Set(PALETA.map(([f]) => f))];

  return (
    <div className="mq">
      <div className="mq-bar">
        <span className="mq-meta">
          Maqueta · fondo {spec.fondo}{base.ref ? ` · inspirado en ${base.ref}` : ""}
        </span>
        <div className="mq-acciones">
          {edit && (
            <button className="mq-btn" aria-expanded={paleta} onClick={() => setPaleta(!paleta)}>
              + Agregar bloque
            </button>
          )}
          {edit && hayOv && <button className="mq-btn sutil" onClick={restaurar}>Restaurar original</button>}
          <button className={"mq-btn fuerte" + (edit ? " on" : "")}
            onClick={() => { setEdit(!edit); setSel(null); setTexto(null); setPaleta(false); }}>
            {edit ? "✓ Listo" : "✎ Editar maqueta"}
          </button>
        </div>
      </div>

      {edit && paleta && (
        <div className="mq-paleta">
          {familias.map((f) => (
            <div className="mq-fam" key={f}>
              <span className="mq-fam-h">{f}</span>
              <div className="mq-fam-b">
                {PALETA.filter(([fam]) => fam === f).map(([, t, label, w]) => (
                  <button key={t + label} className="mq-pieza" onClick={() => insertar(t, w)}>{label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div className="mq-tools">
          <div className="mq-fondos">
            {FONDOS.map(([k, label]) => (
              <button key={k} className={`mq-fondo f-${k}${spec.fondo === k ? " on" : ""}`}
                title={label} aria-label={label}
                onClick={() => aplicar({ ...specRef.current, fondo: k }, true)} />
            ))}
          </div>
          {b ? (
            <>
              <span className="mq-sel">{b.t}</span>
              <span className="mq-dato">x {b.x} · y {b.y} · {b.w}/12 · alto {b.h}</span>
              <button className="mq-icono" title="Duplicar" onClick={() => duplicar(b.id)}>⧉</button>
              <button className="mq-icono peligro" title="Borrar" onClick={() => borrar(b.id)}>🗑</button>
            </>
          ) : (
            <span className="mq-dato">Arrastrá un bloque para moverlo · estirá de los bordes · doble clic para escribir</span>
          )}
        </div>
      )}

      <div className={`mq-canvas f-${spec.fondo}${edit ? " editando" : ""}`}
        ref={lienzo}
        tabIndex={edit ? 0 : -1}
        onKeyDown={teclas}
        onClick={(e) => { if (edit && e.target === e.currentTarget) setSel(null); }}
        style={{ gridAutoRows: `${FILA_PX}px`, gap: `${GAP_PX}px`, minHeight: filasAlto * (FILA_PX + GAP_PX) }}>
        {bloques.map((blk) => (
          <div key={blk.id}
            className={"mq-blk" + (sel === blk.id ? " sel" : "") + (gesteando === blk.id ? " gesteando" : "")}
            style={{
              gridColumn: `${blk.x + 1} / span ${blk.w}`,
              gridRow: `${blk.y + 1} / span ${blk.h}`,
            }}
            onClick={(e) => { if (edit) { e.stopPropagation(); setSel(blk.id); } }}
            onDoubleClick={() => edit && setTexto(blk.id)}>
            {edit && (
              <span className="mq-grip" onPointerDown={(e) => gestionar(e, blk.id, "mover")}>⠿ {blk.t}</span>
            )}
            <div className="mq-body">
              <Pieza tipo={blk.t} id={blk.id} sec={sec} copyDe={copyDe} guardarCopy={guardarCopy}
                editable={!edit || texto === blk.id} />
            </div>
            {edit && (
              <>
                <span className="mq-rs der" onPointerDown={(e) => gestionar(e, blk.id, "w")} />
                <span className="mq-rs abajo" onPointerDown={(e) => gestionar(e, blk.id, "h")} />
                <span className="mq-rs esquina" onPointerDown={(e) => gestionar(e, blk.id, "wh")} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pieza({ tipo, id, sec, copyDe, guardarCopy, editable }: any) {
  /* La clave del copy es el id del bloque, así dos piezas del mismo tipo no comparten texto. */
  const texto = (cls: string, ph: string, parte?: string) => {
    const k = parte ? `${id}.${parte}` : id;
    return (
      <div className={cls}
        contentEditable={editable}
        suppressContentEditableWarning
        onBlur={(e) => guardarCopy(sec, k, e.currentTarget.textContent ?? "")}>
        {copyDe(sec, k) || ph}
      </div>
    );
  };
  switch (tipo) {
    case "nav": return <div className="w-nav"><span className="w-logo">crehana</span><span className="w-links">Soluciones · Recursos · Nosotros · Clientes · Crehana AI</span><span className="w-navcta">Agenda un demo</span></div>;
    case "eyebrow": return texto("w-eyebrow", "EYEBROW");
    case "h1": return texto("w-h1", "Titular");
    case "h2": return texto("w-h2", "Título de sección");
    case "h2mini": return texto("w-h2mini", "Título corto");
    case "sub": return texto("w-sub", "Bajada");
    case "nota": return texto("w-nota", "Nota al pie");
    case "cta": return texto("w-cta", "CTA primario");
    case "cta2": return texto("w-cta2", "CTA secundario");
    case "mock": return <div className="w-mock"><span>captura de producto</span></div>;
    case "mockmini": return <div className="w-mockmini"><span>captura</span></div>;
    case "form": return <div className="w-form"><span>formulario</span></div>;
    case "logos": return <div className="w-logos">{Array.from({ length: 7 }).map((_, i) => <span className="w-logo-ph" key={i} />)}</div>;
    case "cifra": return <div className="w-cifra">{texto("w-num", "—", "num")}{texto("w-lab", "métrica", "lab")}</div>;
    case "tabs": return <div className="w-tabs">{["Personas", "Reclutamiento", "Capacitación", "Desempeño", "Clima"].map((t, i) => <span className={"w-tab" + (i === 0 ? " on" : "")} key={t}>{t}</span>)}{["Nómina", "Asistencia"].map((t) => <span className="w-tab nuevo" key={t}>{t} ·nuevo</span>)}</div>;
    case "bullets": return <div className="w-bul">{[0, 1, 2].map((i) => <span className="w-bul-l" key={i} />)}</div>;
    case "flujo": return texto("w-flujo", "Asistencia → Nómina → Desarrollo");
    case "agente": return <div className="w-ag"><span className="w-ag-ic" />{texto("w-ag-n", "Agente", "n")}</div>;
    case "caso": return <div className="w-caso">{texto("w-caso-m", "—%", "m")}{texto("w-caso-c", "cita breve", "c")}{texto("w-caso-a", "nombre · cargo", "a")}</div>;
    case "sellos": return <div className="w-sellos">{[0, 1, 2, 3].map((i) => <span className="w-sello" key={i} />)}</div>;
    default: return <div className="w-ph" />;
  }
}

/* ---------------- piezas compartidas ---------------- */

function Aprobacion({ clave, aprobado, guardar }: any) {
  const ok = aprobado(clave);
  return (
    <div className="apr-wrap">
      {REVISORES.map((r) => {
        const si = ok.includes(r);
        return (
          <div className="apr" key={r}>
            <span className="apr-who">{r}</span>
            <button className="apr-btn si" aria-pressed={si} onClick={() => guardar(clave, r, si ? null : "si")}>✓</button>
            <button className="apr-btn no" onClick={() => guardar(clave, r, "no")}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function Hilo({ clave, hilos, comentar, yo }: any) {
  const [texto, setTexto] = useState("");
  const raiz = hilos.filter((c: any) => c.clave === clave && !c.padre);
  return (
    <div className="th">
      <div className="th-h">Comentarios</div>
      {raiz.map((c: any) => (
        <div className="cm" key={c.id}>
          <div className="cm-top"><span className="cm-a">{c.autor}</span><span className="cm-t">{new Date(c.creado).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span></div>
          <div className="cm-b">{c.texto}</div>
          {hilos.filter((r: any) => r.padre === c.id).map((r: any) => (
            <div className="cm re" key={r.id}>
              <div className="cm-top"><span className="cm-a">{r.autor}</span></div>
              <div className="cm-b">{r.texto}</div>
            </div>
          ))}
        </div>
      ))}
      <div className="cmp">
        <span className="cmp-who">{yo}</span>
        <input className="cmp-in" value={texto} placeholder="Escribe un comentario"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { comentar(clave, texto); setTexto(""); } }} />
        <button className="btn cmp-go" onClick={() => { comentar(clave, texto); setTexto(""); }}>Enviar</button>
      </div>
    </div>
  );
}

function Senales({ comp, senales, cap }: any) {
  if (!senales.length) return <div className="empty"><b>{comp?.nombre} está en la lista</b>Todavía no tiene señales de esta corrida.</div>;
  return (
    <div className="cards">
      {senales.map((f: any) => {
        const c = cap(`f-${comp.id}-${f.id}`);
        return (
          <article className="card" key={f.id}>
            <div className="card-top">
              <span className={"sev " + f.sev}>{SEV[f.sev] ?? f.sev}</span>
              <span className="cat">{f.cat}</span>
            </div>
            <h4>{f.titulo}</h4>
            <p>{f.detalle}</p>
            <div className="why"><b>Por qué importa.</b> {f.porque}</div>
            {c && <figure className="shot-fig"><img src={c.url} alt={f.titulo} loading="lazy" /><figcaption>{c.pie}</figcaption></figure>}
            {f.vs?.ellos && (
              <div className="vs">
                <div className="vs-h"><span>Cara a cara</span><span className={"saldo " + (f.vs.saldo ?? "par")}>{f.vs.texto}</span></div>
                <div className="vs-body">
                  <div className="vs-cell them"><b>{comp.nombre}</b>{f.vs.ellos}</div>
                  <div className="vs-cell us"><b>Crehana hoy</b>{f.vs.nos}</div>
                </div>
              </div>
            )}
            <p className="src">Fuente: {(f.fuentes ?? []).map((s: any) => s.t).join(" · ")} {f.verificado && `· ${f.verificado}`}</p>
          </article>
        );
      })}
    </div>
  );
}

function Resumen({ comp, senales, corridas }: any) {
  const d = comp?.data ?? {};
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Corrida {corridas[0]?.n ?? "—"} · {comp?.frente}</div>
        <h1>{d.tesis?.titulo}</h1>
        <p>{d.tesis?.cuerpo}</p>
      </div>
      <div className="kpis">
        {(d.kpis ?? []).map((k: any) => (
          <div className="kpi" key={k.l}><b>{k.n}</b><span>{k.l}</span><i>{k.s}</i></div>
        ))}
      </div>
      <section className="sec">
        <div className="sec-h"><h3>Señales de esta corrida</h3><span>{senales.length} en total</span></div>
        <div className="cards">
          {senales.map((f: any) => (
            <div className="card" key={f.id}>
              <div className="card-top"><span className={"sev " + f.sev}>{SEV[f.sev] ?? f.sev}</span><span className="cat">{f.cat}</span></div>
              <h4>{f.titulo}</h4>
              <div className="why"><b>Por qué importa.</b> {f.porque}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Backlog({ backlog, setBacklog, home, aprobado, guardarAprob, hilos, comentar, setAviso, enEstaPagina }: any) {
  const ESTADOS = ["pendiente", "en diseño", "publicado"];
  const secciones = home.HOME?.secciones ?? [];
  const porSec: Record<string, any[]> = {};
  backlog.filter(enEstaPagina).forEach((b: any) => { (porSec[b.seccion] ??= []).push(b); });

  async function cambiar(b: any, estado: string) {
    setBacklog((v: any[]) => v.map((x) => (x.id === b.id ? { ...x, estado } : x)));
    const { error } = await db.from("backlog").update({ estado, actualizado: new Date().toISOString() }).eq("id", b.id);
    if (error) setAviso("No se pudo guardar: " + error.message);
  }

  return (
    <>
      <div className="note">
        <b>Cómo se llena.</b> Cada corrida del lunes traduce las señales en cambios concretos de la home y los agrega acá, atados a la sección que tocan.
      </div>
      {Object.keys(porSec).sort().map((sec) => (
        <div key={sec}>
          <div className="bl-h">{sec} · {secciones.find((s: any) => s.n === sec)?.t ?? ""}</div>
          {porSec[sec].map((b: any) => (
            <div className="bl" key={b.id}>
              <div className="bl-top">
                <span className={"bl-est " + (b.estado === "publicado" ? "pub" : b.estado === "en diseño" ? "dis" : "pen")}>{b.estado}</span>
                <span className="cat">{b.origen}</span>
              </div>
              <h4>{b.titulo}</h4>
              <p>{b.detalle}</p>
              <div className="triage">
                {ESTADOS.map((e) => (
                  <button key={e} className="t-btn" aria-pressed={b.estado === e} onClick={() => cambiar(b, e)}>{e}</button>
                ))}
              </div>
              <Aprobacion clave={`bk-${b.id}`} aprobado={aprobado} guardar={guardarAprob} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function Historial({ corridas }: any) {
  if (!corridas.length) return <div className="empty"><b>Sin corridas archivadas</b>La primera corrida la guarda el agente.</div>;
  return (
    <div className="hist">
      {corridas.map((r: any) => (
        <div className="run" key={r.id}>
          <div className="run-head">
            <span className="run-n">C{String(r.n).padStart(2, "0")} · {r.fecha}</span>
            <span className="run-t">{r.headline}</span>
            <span className="run-c">{(r.findings ?? []).length} señales</span>
          </div>
        </div>
      ))}
    </div>
  );
}
