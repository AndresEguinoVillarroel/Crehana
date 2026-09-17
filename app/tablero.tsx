"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";

const REVISORES = ["Xime", "Yess"];
const PERSONAS = ["Andrés", "Xime", "Yess", "Yeni"];
const SEV: Record<string, string> = { crit: "Crítica", warn: "Alta", info: "Media", ok: "Oportunidad" };
const VISTAS = [
  ["resumen", "Resumen"],
  ["senales", "Señales"],
  ["home", "Propuesta Home"],
  ["backlog", "Backlog de home"],
  ["historial", "Historial"],
] as const;

type Vista = (typeof VISTAS)[number][0];

export default function Tablero(props: any) {
  const { competidores, senales, home, corridas } = props;
  const [vista, setVista] = useState<Vista>("home");
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

  const comp = competidores.find((c: any) => c.id === actual) ?? competidores[0];
  const misSenales = senales.filter((s: any) => s.competidor === comp?.id);
  const cap = (id: string) => capturas.find((c: any) => c.id === id);
  const copyDe = (sec: string, k: string) =>
    copys.find((c: any) => c.seccion === sec)?.valores?.[k] ?? home.COPY_DEF?.[sec]?.[k] ?? "";
  const layoutDe = (sec: string) => layouts.find((l: any) => l.seccion === sec);
  const aprobado = (clave: string) =>
    REVISORES.filter((r) => aprob.find((a: any) => a.id === `${clave}__${r}` && a.valor === "si"));

  async function guardarAprob(clave: string, revisora: string, valor: string | null) {
    const id = `${clave}__${revisora}`;
    if (valor === null) {
      setAprob((v) => v.filter((a) => a.id !== id));
      await db.from("aprobaciones").delete().eq("id", id);
    } else {
      const fila = { id, clave, revisora, valor, actualizado: new Date().toISOString() };
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

  async function guardarCopy(sec: string, k: string, valor: string) {
    const previo = copys.find((c: any) => c.seccion === sec)?.valores ?? {};
    const valores = { ...previo, [k]: valor };
    setCopys((v) => [...v.filter((c) => c.seccion !== sec), { seccion: sec, valores }]);
    const { error } = await db.from("copys").upsert({ seccion: sec, valores, actualizado: new Date().toISOString() });
    if (error) setAviso("No se pudo guardar el copy: " + error.message);
  }

  async function guardarLayout(sec: string, fondo: string, filas: any[]) {
    setLayouts((v) => [...v.filter((l) => l.seccion !== sec), { seccion: sec, fondo, filas }]);
    const { error } = await db.from("layouts").upsert({ seccion: sec, fondo, filas, actualizado: new Date().toISOString() });
    if (error) setAviso("No se pudo guardar el layout: " + error.message);
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

  const abiertos = backlog.filter((b) => b.estado !== "publicado").length;

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
                  ? `Actualización Home con últimos lanzamientos · ${aprobado("01").length ? "en revisión" : "prioridad 1"}`
                  : `${comp?.nombre ?? ""} · corrida ${corridas[0]?.n ?? "—"}`}
              </div>
            </div>
            <div className="bar-right">
              <button className="btn ghost" onClick={correrAhora}>▶ Correr ahora</button>
            </div>
          </div>
        </div>

        <div className="view">
          {vista === "home" && (
            <PropuestaHome
              home={home} copyDe={copyDe} guardarCopy={guardarCopy}
              layoutDe={layoutDe} guardarLayout={guardarLayout}
              cap={cap} backlog={backlog} aprob={aprob} aprobado={aprobado}
              guardarAprob={guardarAprob} hilos={hilos} comentar={comentar} yo={yo}
            />
          )}
          {vista === "senales" && <Senales comp={comp} senales={misSenales} cap={cap} />}
          {vista === "resumen" && <Resumen comp={comp} senales={misSenales} corridas={corridas} />}
          {vista === "backlog" && (
            <Backlog backlog={backlog} setBacklog={setBacklog} home={home}
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

function PropuestaHome({ home, copyDe, guardarCopy, layoutDe, guardarLayout, cap, backlog, aprobado, guardarAprob, hilos, comentar, yo }: any) {
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
          const pend = backlog.filter((b: any) => b.seccion === x.n && b.estado !== "publicado").length;
          const nC = hilos.filter((c: any) => c.clave === `sec-${x.n}`).length;
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

                <Wireframe
                  sec={x.n} home={home} copyDe={copyDe} guardarCopy={guardarCopy}
                  layoutDe={layoutDe} guardarLayout={guardarLayout}
                  edit={!!edit[x.n]} setEdit={(v: boolean) => setEdit({ ...edit, [x.n]: v })}
                />

                <div className="shot-trio">
                  {[["comp", "Competidor"], ["ref", "Referente"], ["cre", "Crehana hoy"]].map(([suf, label]) => {
                    const c = cap(`sec-${x.n}-${suf}`);
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
                {abierto[x.n] && <Hilo clave={`sec-${x.n}`} hilos={hilos} comentar={comentar} yo={yo} />}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ---------------- Wireframe editable ---------------- */

const FONDOS = [["claro", "Claro"], ["gris", "Gris"], ["profundo", "Morado profundo"], ["lima", "Lima"]];

function Wireframe({ sec, home, copyDe, guardarCopy, layoutDe, guardarLayout, edit, setEdit }: any) {
  const base = home.WIRE?.[sec];
  const ov = layoutDe(sec);
  const [spec, setSpec] = useState<any>(() => ({
    fondo: ov?.fondo ?? base?.fondo ?? "claro",
    filas: ov?.filas ?? (base?.filas ?? []).map((f: any) => f.map((b: any) => [b[0], b[1]])),
  }));
  const [sel, setSel] = useState<{ fi: number; bi: number } | null>(null);
  if (!base) return null;

  function aplicar(nuevo: any) {
    setSpec(nuevo);
    guardarLayout(sec, nuevo.fondo, nuevo.filas);
  }
  function mover(fn: (filas: any[]) => void) {
    const filas = spec.filas.map((f: any) => f.map((b: any) => [b[0], b[1]]));
    fn(filas);
    aplicar({ ...spec, filas: filas.filter((f: any) => f.length) });
  }

  const b = sel ? spec.filas[sel.fi]?.[sel.bi] : null;

  return (
    <div className="wire">
      <div className="wire-h">
        <span>Wireframe · fondo {spec.fondo}{base.ref ? ` · inspirado en ${base.ref}` : ""}</span>
        <button className={"wt" + (edit ? " on" : "")} onClick={() => { setEdit(!edit); setSel(null); }}>
          {edit ? "Listo" : "Ajustar layout"}
        </button>
      </div>

      {edit && (
        <>
          <div className="pal">
            <span className="pal-l">Combinación de color</span>
            {FONDOS.map(([k, label]) => (
              <button key={k} className={`pal-b p-${k}${spec.fondo === k ? " on" : ""}`}
                onClick={() => aplicar({ ...spec, fondo: k })}>{label}</button>
            ))}
          </div>
          <div className="selbar">
            {b ? (
              <>
                <span className="selbar-h">Bloque {b[0]}</span>
                <span className="sb-lab">ancho</span>
                <button className="sb-b" onClick={() => mover((f) => { f[sel!.fi][sel!.bi][1] = Math.max(1, f[sel!.fi][sel!.bi][1] - 1); })}>−</button>
                <button className="sb-b" onClick={() => mover((f) => { f[sel!.fi][sel!.bi][1] = Math.min(12, f[sel!.fi][sel!.bi][1] + 1); })}>+</button>
                <span className="sb-val">{b[1]}/12</span>
                <span className="sb-lab">mover</span>
                <button className="sb-b" disabled={sel!.bi === 0}
                  onClick={() => { mover((f) => { const r = f[sel!.fi]; [r[sel!.bi - 1], r[sel!.bi]] = [r[sel!.bi], r[sel!.bi - 1]]; }); setSel({ ...sel!, bi: sel!.bi - 1 }); }}>←</button>
                <button className="sb-b" disabled={sel!.bi >= spec.filas[sel!.fi].length - 1}
                  onClick={() => { mover((f) => { const r = f[sel!.fi]; [r[sel!.bi + 1], r[sel!.bi]] = [r[sel!.bi], r[sel!.bi + 1]]; }); setSel({ ...sel!, bi: sel!.bi + 1 }); }}>→</button>
                <button className="sb-b" disabled={sel!.fi === 0}
                  onClick={() => { mover((f) => { const el = f[sel!.fi].splice(sel!.bi, 1)[0]; f[sel!.fi - 1].push(el); }); setSel(null); }}>↑</button>
                <button className="sb-b" disabled={sel!.fi >= spec.filas.length - 1}
                  onClick={() => { mover((f) => { const el = f[sel!.fi].splice(sel!.bi, 1)[0]; f[sel!.fi + 1].unshift(el); }); setSel(null); }}>↓</button>
                <button className="sb-b" title="Fila propia"
                  onClick={() => { mover((f) => { const el = f[sel!.fi].splice(sel!.bi, 1)[0]; f.splice(sel!.fi + 1, 0, [el]); }); setSel(null); }}>⤓</button>
                <button className="sb-x" onClick={() => setSel(null)}>listo</button>
              </>
            ) : (
              <span className="selbar-h">Tocá un bloque para moverlo o cambiarle el ancho</span>
            )}
          </div>
        </>
      )}

      <div className={`wf2 f-${spec.fondo}${edit ? " editando" : ""}`}>
        {spec.filas.map((fila: any, fi: number) => (
          <div className="wf2-row" key={fi}>
            {fila.map((blk: any, bi: number) => (
              <div key={bi}
                className={"wf2-cell" + (sel?.fi === fi && sel?.bi === bi ? " sel" : "")}
                style={{ flex: `${blk[1]} 1 0` }}
                onClick={() => edit && setSel({ fi, bi })}>
                {edit && <span className="grip">⠿ {blk[0]}</span>}
                <Pieza tipo={blk[0]} sec={sec} copyDe={copyDe} guardarCopy={guardarCopy} editable={!edit} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {edit && <div className="wire-hint">Tocá un bloque y usá los botones de arriba. El copy se edita con el modo de ajuste apagado.</div>}
    </div>
  );
}

function Pieza({ tipo, sec, copyDe, guardarCopy, editable }: any) {
  const texto = (k: string, cls: string, ph: string) => (
    <div className={cls}
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(e) => guardarCopy(sec, k, e.currentTarget.textContent ?? "")}>
      {copyDe(sec, k) || ph}
    </div>
  );
  switch (tipo) {
    case "nav": return <div className="w-nav"><span className="w-logo">crehana</span><span className="w-links">Soluciones · Recursos · Nosotros · Clientes · Crehana AI</span><span className="w-navcta">Agenda un demo</span></div>;
    case "eyebrow": return texto("eyebrow", "w-eyebrow", "EYEBROW");
    case "h1": return texto("h1", "w-h1", "Titular");
    case "h2": return texto("h2", "w-h2", "Título de sección");
    case "h2mini": return texto("h2mini", "w-h2mini", "Título corto");
    case "sub": return texto("sub", "w-sub", "Bajada");
    case "nota": return texto("nota", "w-nota", "Nota al pie");
    case "cta": return texto("cta", "w-cta", "CTA primario");
    case "cta2": return texto("cta2", "w-cta2", "CTA secundario");
    case "mock": return <div className="w-mock"><span>captura de producto</span></div>;
    case "mockmini": return <div className="w-mockmini"><span>captura</span></div>;
    case "form": return <div className="w-form"><span>formulario</span></div>;
    case "logos": return <div className="w-logos">{Array.from({ length: 7 }).map((_, i) => <span className="w-logo-ph" key={i} />)}</div>;
    case "cifra": return <div className="w-cifra"><div className="w-num">—</div><div className="w-lab">métrica</div></div>;
    case "tabs": return <div className="w-tabs">{["Personas", "Reclutamiento", "Capacitación", "Desempeño", "Clima"].map((t, i) => <span className={"w-tab" + (i === 0 ? " on" : "")} key={t}>{t}</span>)}{["Nómina", "Asistencia"].map((t) => <span className="w-tab nuevo" key={t}>{t} ·nuevo</span>)}</div>;
    case "bullets": return <div className="w-bul">{[0, 1, 2].map((i) => <span className="w-bul-l" key={i} />)}</div>;
    case "flujo": return texto("flujo", "w-flujo", "Asistencia → Nómina → Desarrollo");
    case "agente": return <div className="w-ag"><span className="w-ag-ic" /><span className="w-ag-n">Agente</span></div>;
    case "caso": return <div className="w-caso"><span className="w-caso-m">—%</span><span className="w-caso-c">cita breve</span><span className="w-caso-a">nombre · cargo</span></div>;
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

function Backlog({ backlog, setBacklog, home, aprobado, guardarAprob, hilos, comentar, setAviso }: any) {
  const ESTADOS = ["pendiente", "en diseño", "publicado"];
  const secciones = home.HOME?.secciones ?? [];
  const porSec: Record<string, any[]> = {};
  backlog.forEach((b: any) => { (porSec[b.seccion] ??= []).push(b); });

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
