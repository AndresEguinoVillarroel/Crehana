"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { aBloques, acomodar, alto, proximoY, topar, COLS, type Alineacion, type Blk } from "@/lib/maqueta";
import { Guardado, Ic, Paleta, Sidebar, usePreferencia, type Destino, type EstadoGuardado } from "./navegacion";
import { Research } from "./research";
import { Presentacion } from "./presentacion";
import { armarBrief } from "./brief";

const REVISORES = ["Xime", "Yess"];
/** El portafolio completo, en el orden del menú de crehana.com. Los nuevos suman, no reemplazan. */
const PRODUCTOS = ["Personas", "Nómina", "Reclutamiento", "Desempeño", "Clima", "Capacitación", "People Analytics", "Asistencia", "Integraciones", "Crehana AI"];
const NUEVOS = ["Nómina", "Asistencia"];

/** Quién puede firmar, y qué hace cada una en el flujo. */
const PERSONAS = ["Andrés", "Xime", "Yess", "Yeni"];
const ROLES: Record<string, string> = {
  Andrés: "Coordina la propuesta y el backlog",
  Xime: "Revisa y aprueba secciones y cambios",
  Yess: "Revisa y aprueba secciones y cambios",
  Yeni: "Produce los recursos de diseño",
};
const SEV: Record<string, string> = { crit: "Crítica", warn: "Alta", info: "Media", ok: "Oportunidad" };

type Vista = "home" | "backlog" | "resumen" | "senales" | "historial";

/** Traduce los errores de base que tienen causa conocida a algo accionable. */
const explicar = (m: string) =>
  /schema cache|does not exist/i.test(m) ? "falta correr supabase/schema.sql en Supabase" : m;

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
  const [variantes, setVariantes] = useState<any[]>(props.variantesIniciales ?? []);
  /* La identidad vive en el navegador de cada persona. Si nunca eligió, se le pregunta antes de nada. */
  const [yo, setYoEstado] = useState<string>("");
  const [preguntarQuien, setPreguntarQuien] = useState(false);
  useEffect(() => {
    let guardado: string | null = null;
    try { guardado = localStorage.getItem("sherlock:yo"); } catch {}
    if (guardado && PERSONAS.includes(guardado)) setYoEstado(guardado);
    else setPreguntarQuien(true);
  }, []);
  const setYo = (p: string) => {
    setYoEstado(p);
    setPreguntarQuien(false);
    try { localStorage.setItem("sherlock:yo", p); } catch {}
  };
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  /* Los errores quedan fijos en el indicador de guardado; el aviso puede irse solo. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* Tiempo real: lo que decide una persona lo ven todas. */
  useEffect(() => {
    const canal = db
      .channel("tablero")
      .on("postgres_changes", { event: "*", schema: "public" }, async (payload: any) => {
        const tabla = payload.table;
        const setters: Record<string, any> = {
          backlog: setBacklog, capturas: setCapturas, aprobaciones: setAprob,
          hilos: setHilos, copys: setCopys, layouts: setLayouts, variantes: setVariantes,
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
  const variantesDe = (sec: string) => variantes.filter((v: any) => enEstaPagina(v) && v.seccion === sec);
  /** Aplica una propuesta del agente: pisa la maqueta de la sección y su copy sugerido. */
  async function aplicarVariante(sec: string, v: any) {
    await guardarLayout(sec, v.fondo ?? "claro", v.bloques ?? []);
    if (v.copy && Object.keys(v.copy).length) {
      const previo = copys.find((c: any) => enEstaPagina(c) && c.seccion === sec)?.valores ?? {};
      const valores = { ...previo, ...v.copy };
      setCopys((x) => [...x.filter((c) => otraSeccion(c, sec)), { pagina, seccion: sec, valores }]);
      await persistir("el texto", () =>
        db.from("copys").upsert({ pagina, seccion: sec, valores, actualizado: new Date().toISOString() }));
    }
  }
  const aprobado = (clave: string) =>
    REVISORES.filter((r) => aprob.find((a: any) => a.id === `${pagina}/${clave}__${r}` && a.valor === "si"));
  /** "si", "no" o null: lo que decidió cada revisora, para poder mostrar también los rechazos. */
  const valorAprob = (clave: string, r: string) =>
    aprob.find((a: any) => a.id === `${pagina}/${clave}__${r}`)?.valor ?? null;
  /** Clave de hilo de comentarios de una sección, dentro de su página. */
  const claveSec = (sec: string) => `${pagina}/sec-${sec}`;

  /* Toda escritura pasa por acá: el indicador de la barra dice si quedó guardada o por qué no. */
  const [guardado, setGuardado] = useState<EstadoGuardado>({ estado: "listo" });
  async function persistir(que: string, accion: () => PromiseLike<{ error: any }>) {
    setGuardado({ estado: "guardando" });
    const { error } = await accion();
    if (error) {
      const motivo = explicar(error.message);
      setGuardado({ estado: "error", detalle: motivo });
      setAviso(`No se guardó ${que}: ${motivo}`);
    } else {
      setGuardado({ estado: "listo" });
    }
  }

  async function guardarAprob(clave: string, revisora: string, valor: string | null) {
    const alcance = `${pagina}/${clave}`;
    const id = `${alcance}__${revisora}`;
    if (valor === null) {
      setAprob((v) => v.filter((a) => a.id !== id));
      await persistir("la aprobación", () => db.from("aprobaciones").delete().eq("id", id));
    } else {
      const fila = { id, clave: alcance, revisora, valor, actualizado: new Date().toISOString() };
      setAprob((v) => [...v.filter((a) => a.id !== id), fila]);
      await persistir("la aprobación", () => db.from("aprobaciones").upsert(fila));
    }
  }

  async function comentar(clave: string, texto: string, padre?: string) {
    if (!texto.trim()) return;
    const fila = {
      id: "c" + Date.now().toString(36), clave, padre: padre ?? null,
      autor: yo, texto: texto.trim(), creado: new Date().toISOString(),
    };
    setHilos((v) => [...v, fila]);
    await persistir("el comentario", () => db.from("hilos").insert(fila));
  }

  const otraSeccion = (fila: any, sec: string) => !(enEstaPagina(fila) && fila.seccion === sec);

  async function guardarCopy(sec: string, k: string, valor: string) {
    const previo = copys.find((c: any) => enEstaPagina(c) && c.seccion === sec)?.valores ?? {};
    const valores = { ...previo, [k]: valor };
    setCopys((v) => [...v.filter((c) => otraSeccion(c, sec)), { pagina, seccion: sec, valores }]);
    await persistir("el texto", () =>
      db.from("copys").upsert({ pagina, seccion: sec, valores, actualizado: new Date().toISOString() }));
  }

  async function guardarLayout(sec: string, fondo: string, bloques: any[]) {
    setLayouts((v) => [...v.filter((l) => otraSeccion(l, sec)), { pagina, seccion: sec, fondo, bloques }]);
    await persistir("la maqueta", () =>
      db.from("layouts").upsert({ pagina, seccion: sec, fondo, bloques, actualizado: new Date().toISOString() }));
  }

  /** Borra el override y devuelve la sección al wireframe que propuso el agente. */
  async function borrarLayout(sec: string) {
    setLayouts((v) => v.filter((l) => otraSeccion(l, sec)));
    await persistir("la restauración", () => db.from("layouts").delete().eq("pagina", pagina).eq("seccion", sec));
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

  /** Resumen de la página para pasárselo a una IA: al portapapeles y como archivo .md. */
  async function exportarBrief() {
    const texto = armarBrief({
      home, pagina, nombrePagina: pagina,
      layoutDe, copyDe, backlog, valorAprob, revisores: REVISORES, hilos,
      corrida: corridas[0],
    });
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setAviso("No se pudo copiar al portapapeles, pero el archivo se descargó igual.");
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/markdown;charset=utf-8" }));
    a.download = `${pagina}-cambios-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---- navegación ---- */
  const [menu, setMenu] = useState(false);
  const [mini, setMini] = usePreferencia("mini", false);
  const [paleta, setPaleta] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);
  const [salto, setSalto] = useState<{ sec: string; n: number } | null>(null);
  const [presentando, setPresentando] = useState(false);

  function ir(d: Destino) {
    const cambiaDeLugar = d.vista !== vista || (!!d.pagina && d.pagina !== pagina) || (!!d.comp && d.comp !== actual);
    if (d.pagina) setPagina(d.pagina);
    if (d.comp) setActual(d.comp);
    setVista(d.vista as Vista);
    setMenu(false);
    if (d.sec) setSalto((s) => ({ sec: d.sec!, n: (s?.n ?? 0) + 1 }));
    else if (cambiaDeLugar) window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (!salto || vista !== "home") return;
    document.getElementById(`sc-${salto.sec}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [salto, vista, pagina]);

  /* La sección que se está leyendo queda marcada en el índice del sidebar. */
  useEffect(() => {
    if (vista !== "home") { setSeccionActiva(null); return; }
    const visibles = new Set<string>();
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const id = e.target.id.replace("sc-", "");
        if (e.isIntersecting) visibles.add(id); else visibles.delete(id);
      }
      const primera = [...visibles].sort()[0];
      if (primera && !alFondo()) setSeccionActiva(primera);
    }, { rootMargin: "-90px 0px -55% 0px" });
    /* Al final de la página las últimas secciones no llegan arriba: tocando fondo, la activa es la última. */
    const ultimas = home.HOME?.secciones ?? [];
    const alFondo = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    const alScroll = () => { if (alFondo() && ultimas.length) setSeccionActiva(ultimas[ultimas.length - 1].n); };
    window.addEventListener("scroll", alScroll, { passive: true });
    document.querySelectorAll(".sc").forEach((el) => obs.observe(el));
    return () => { obs.disconnect(); window.removeEventListener("scroll", alScroll); };
  }, [vista, pagina]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta((v) => !v); }
      if (mod && e.key === "\\") { e.preventDefault(); setMini(!mini); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mini]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombrePagina = paginas.find((p: any) => p.id === pagina)?.data?.HOME?.nombre ?? pagina;
  const enComp = vista === "senales" || vista === "resumen";
  const ruta: string[] =
    vista === "home" ? ["Mejoras website", nombrePagina]
    : vista === "backlog" ? ["Mejoras website", nombrePagina, "Backlog"]
    : enComp ? [comp?.tipo === "referente" ? "Referentes" : "Competidores", comp?.nombre ?? ""]
    : ["Radar", "Historial"];
  const bajada =
    vista === "home" ? home.HOME?.tarea
    : enComp ? `Corrida ${corridas[0]?.n ?? "—"}${comp?.frente ? ` · ${comp.frente}` : ""}`
    : undefined;

  return (
    <div className={"app" + (mini ? " con-mini" : "")}>
      <Sidebar
        competidores={competidores} senales={senales} paginas={paginas} corridas={corridas} backlog={backlog}
        vista={vista} pagina={pagina} actual={actual} seccionActiva={seccionActiva}
        ir={ir} yo={yo} setYo={setYo} personas={PERSONAS}
        mini={mini} setMini={setMini} menu={menu} abrirPaleta={() => setPaleta(true)}
      />
      {menu && <div className="sb-velo" onClick={() => setMenu(false)} />}

      <main className="main">
        <div className="bar">
          <div className="bar-in">
            <button className="burger" aria-label="Abrir navegación" onClick={() => setMenu(true)}>
              <Ic n="menu" />
            </button>
            <div className="bar-t">
              <nav className="ruta" aria-label="Ubicación">
                {ruta.slice(0, -1).map((r) => <span key={r}>{r}</span>)}
              </nav>
              <h1>{ruta[ruta.length - 1]}</h1>
              {bajada && <div className="crumb">{bajada}</div>}
            </div>
            {enComp && (
              <div className="pgs" role="tablist" aria-label="Vista del competidor">
                {([["resumen", "Resumen"], ["senales", "Señales"]] as const).map(([k, label]) => (
                  <button key={k} className="pg" role="tab" aria-selected={vista === k} onClick={() => ir({ vista: k })}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="bar-right">
              {(vista === "home" || vista === "backlog") && <Guardado g={guardado} />}
              {vista === "home" && (
                <>
                  <button className="btn ghost" onClick={exportarBrief}
                    title="Copiar el resumen de cambios para pasárselo a una IA" aria-label="Exportar para IA">
                    <Ic n="duplicar" /> <span className="lbl">{copiado ? "¡Copiado!" : "Exportar para IA"}</span>
                  </button>
                  <button className="btn ghost" onClick={() => setPresentando(true)} title="Presentar" aria-label="Presentar">
                    <Ic n="presentar" /> <span className="lbl">Presentar</span>
                  </button>
                </>
              )}
              <button className="btn ghost" onClick={correrAhora} title="Correr ahora" aria-label="Correr ahora">
                <Ic n="correr" /> <span className="lbl">Correr ahora</span>
              </button>
            </div>
          </div>
        </div>

        <div className="view">
          {vista === "home" && (
            <PropuestaHome
              home={home} copyDe={copyDe} guardarCopy={guardarCopy}
              layoutDe={layoutDe} guardarLayout={guardarLayout} borrarLayout={borrarLayout}
              variantesDe={variantesDe} aplicarVariante={aplicarVariante}
              cap={cap} backlog={backlog} aprob={aprob} aprobado={aprobado}
              guardarAprob={guardarAprob} hilos={hilos} comentar={comentar} yo={yo}
              pagina={pagina} claveSec={claveSec} enEstaPagina={enEstaPagina}
              valorAprob={valorAprob} ir={ir}
            />
          )}
          {vista === "senales" && <Senales comp={comp} senales={misSenales} cap={cap} />}
          {vista === "resumen" && <Resumen comp={comp} senales={misSenales} corridas={corridas} />}
          {vista === "backlog" && (
            <Backlog backlog={backlog} setBacklog={setBacklog} home={home} enEstaPagina={enEstaPagina}
              valorAprob={valorAprob} guardarAprob={guardarAprob} persistir={persistir} ir={ir} pagina={pagina} />
          )}
          {vista === "historial" && <Historial corridas={corridas} />}
        </div>
      </main>

      {presentando && vista === "home" && (
        <Presentacion home={home} nombrePagina={nombrePagina} cerrar={() => setPresentando(false)}
          maqueta={(sec) => (
            <Maqueta sec={sec} home={home} copyDe={copyDe} guardarCopy={guardarCopy}
              layoutDe={layoutDe} guardarLayout={guardarLayout} borrarLayout={borrarLayout}
              edit={false} setEdit={() => {}} lectura />
          )} />
      )}

      <Paleta abierta={paleta} cerrar={() => setPaleta(false)} ir={ir}
        paginas={paginas} competidores={competidores} backlog={backlog} />

      {preguntarQuien && <Bienvenida elegir={setYo} />}

      {aviso && <div className="toast on" onClick={() => setAviso("")}>{aviso}</div>}
    </div>
  );
}

/* ---------------- Propuesta de home ---------------- */

function PropuestaHome({ home, copyDe, guardarCopy, layoutDe, guardarLayout, borrarLayout, variantesDe, aplicarVariante, cap, backlog, aprobado, valorAprob, guardarAprob, hilos, comentar, yo, pagina, claveSec, enEstaPagina, ir }: any) {
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [plegadas, setPlegadas] = usePreferencia<Record<string, boolean>>(`plegadas:${pagina}`, {});
  const [hiloAbierto, setHiloAbierto] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ url: string; pie: string; label: string } | null>(null);
  const secciones = home.HOME?.secciones ?? [];
  const lotes = home.RECURSOS?.lotes ?? [];

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (foto) setFoto(null); else if (hiloAbierto) setHiloAbierto(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [foto, hiloAbierto]);

  const fondoDe = (sec: string) => {
    const ov = layoutDe(sec);
    return (ov && (ov.bloques?.length || ov.filas?.length) ? ov.fondo : home.WIRE?.[sec]?.fondo) ?? "";
  };
  const conDobleOk = secciones.filter((s: any) => aprobado(s.n).length === REVISORES.length).length;
  const todasPlegadas = secciones.length > 0 && secciones.every((s: any) => plegadas[s.n]);
  const secHilo = secciones.find((s: any) => s.n === hiloAbierto);

  return (
    <>
      <div className="hero hero-min">
        <div className="eyebrow">Propuesta · basada en la vigilancia semanal</div>
        {home.HOME?.titular && <h2>{home.HOME.titular}</h2>}
        <p>{home.HOME?.objetivo}</p>
      </div>

      <Research home={home} fondoDe={fondoDe} />

      <section className="sec">
        <div className="sec-h">
          <h3>La propuesta, sección por sección</h3>
          <span>{conDobleOk} de {secciones.length} con doble visto bueno</span>
          <button className="sec-tg"
            onClick={() => setPlegadas(Object.fromEntries(secciones.map((s: any) => [s.n, !todasPlegadas])))}>
            {todasPlegadas ? "Desplegar todas" : "Plegar todas"}
          </button>
        </div>

        {secciones.map((x: any) => {
          const pend = backlog.filter((b: any) => enEstaPagina(b) && b.seccion === x.n && b.estado !== "publicado").length;
          const nC = hilos.filter((c: any) => c.clave === claveSec(x.n)).length;
          const pleg = !!plegadas[x.n];
          const piezas = lotes.find((l: any) => l.sec === x.n)?.piezas ?? [];
          return (
            <div className={"sc" + (pleg ? " plegada" : "")} key={x.n} id={`sc-${x.n}`}>
              <div className="sc-h">
                <h4 className="sc-hd">
                  <button className="sc-tg" aria-expanded={!pleg} aria-controls={`scb-${x.n}`}
                    onClick={() => setPlegadas({ ...plegadas, [x.n]: !pleg })}>
                    <Ic n="flecha" className={pleg ? "" : "abierto"} />
                    <span className="sc-n">{x.n}</span>
                    <span className="sc-t">{x.t}</span>
                  </button>
                </h4>
                <span className={"sc-e " + claseEstado(x.estado)}>{x.estado}</span>
                {x.cuesta && <span className="sc-m">{x.cuesta}</span>}
                <div className="sc-acc">
                  {pend > 0 && (
                    <button className="sc-p" onClick={() => ir({ vista: "backlog", pagina })} title="Ver en el backlog">
                      {pend} en backlog
                    </button>
                  )}
                  <Aprobacion clave={x.n} valor={valorAprob} guardar={guardarAprob} compacta />
                  <button className="sc-cm" aria-pressed={hiloAbierto === x.n}
                    aria-label={`Comentarios de ${x.t}${nC ? `, ${nC}` : ""}`}
                    onClick={() => setHiloAbierto(hiloAbierto === x.n ? null : x.n)}>
                    <Ic n="comentario" />{nC > 0 && <span>{nC}</span>}
                  </button>
                </div>
              </div>

              {!pleg && (
                <div className="sc-b" id={`scb-${x.n}`}>
                  <div className="sc-grid">
                    <div className="sc-main">
                      <div className="sc-copy">{x.copy}</div>
                      <p className="sc-baj">{x.bajada}</p>
                      <Maqueta
                        sec={x.n} home={home} copyDe={copyDe} guardarCopy={guardarCopy}
                        layoutDe={layoutDe} guardarLayout={guardarLayout} borrarLayout={borrarLayout}
                        variantesDe={variantesDe} aplicarVariante={aplicarVariante}
                        edit={!!edit[x.n]} setEdit={(v: boolean) => setEdit({ ...edit, [x.n]: v })}
                      />
                      <div className="shot-trio">
                        {[["comp", "Competidor"], ["ref", "Referente"], ["cre", "Crehana hoy"]].map(([suf, label]) => {
                          const c = cap(`${pagina}/sec-${x.n}-${suf}`);
                          return (
                            <div className="shot" key={suf}>
                              <div className="shot-lab">{label}</div>
                              {c ? (
                                <button className="shot-fig" onClick={() => setFoto({ url: c.url, pie: c.pie, label })}
                                  aria-label={`Ampliar captura: ${label}, sección ${x.n}`}>
                                  <img src={c.url} alt="" loading="lazy" />
                                  <span className="shot-pie">{c.pie}</span>
                                </button>
                              ) : (
                                <div className="shot-slot">Sin captura todavía</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <aside className="sc-rail">
                      {x.porque && <div className="sc-why"><b>Por qué</b>{x.porque}</div>}
                      {x.nota && <div className="sc-nota"><b>Nota de producción</b>{x.nota}</div>}
                      {piezas.length > 0 && (
                        <div className="sc-piezas">
                          <b>Piezas de diseño · {piezas.length}</b>
                          <ul>
                            {piezas.map((p: any) => (
                              <li key={p.n} title={p.d}>
                                <span>{p.n}</span>
                                <span className="sc-pz-m">{p.f} · {p.e}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </aside>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {secHilo && (
        <aside className="lat" aria-label={`Comentarios de ${secHilo.t}`}>
          <div className="lat-h">
            <div><small>Comentarios</small><b>{secHilo.n} · {secHilo.t}</b></div>
            <button className="lat-x" onClick={() => setHiloAbierto(null)} aria-label="Cerrar comentarios"><Ic n="cerrar" /></button>
          </div>
          <div className="lat-b">
            <Hilo clave={claveSec(secHilo.n)} hilos={hilos} comentar={comentar} yo={yo} />
          </div>
        </aside>
      )}

      {foto && (
        <div className="lb" role="dialog" aria-modal="true" aria-label={foto.label} onClick={() => setFoto(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={foto.url} alt={foto.label} />
            <figcaption>{foto.label} · {foto.pie}</figcaption>
          </figure>
          <button className="lb-x" aria-label="Cerrar"><Ic n="cerrar" /></button>
        </div>
      )}
    </>
  );
}

/** El estado de la sección describe el tipo de cambio; el color dice cuánto cambia. */
function claseEstado(estado: string) {
  if (estado === "nueva") return "new";
  if (estado === "mantener") return "keep";
  return "edit";
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
  ["Contenido", "carrusel", "Carrusel de logos", 8],
  ["Contenido", "rating", "Reseñas de terceros", 4],
  ["Contenido", "chat", "Chat de Crehana AI", 5],
  ["Contenido", "modulo", "Tarjeta de módulo", 3],
  ["Contenido", "video", "Video / demo", 4],
  ["Acción", "plan", "Plan con precio", 3],
  ["Estructura", "nav", "Navegación", 12],
  ["Estructura", "flujo", "Flujo", 8],
  ["Estructura", "circuito", "Circuito de pasos", 12],
  ["Estructura", "comparativa", "Antes / con Crehana", 6],
  ["Estructura", "faq", "FAQ", 8],
  ["Estructura", "ph", "Espacio", 4],
];

function Maqueta({ sec, home, copyDe, guardarCopy, layoutDe, guardarLayout, borrarLayout, variantesDe, aplicarVariante, edit, setEdit, lectura }: any) {
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
  function alinear(id: string, a: Alineacion) {
    const bs = bloques.map((b) => {
      if (b.id !== id) return b;
      const { a: _previa, ...resto } = b;
      return a === "izq" ? resto : { ...resto, a };
    });
    aplicar({ ...specRef.current, bloques: bs }, true);
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
  /* Propuestas de estructura de las corridas, y cuál está puesta ahora mismo. */
  const propuestas: any[] = variantesDe?.(sec) ?? [];
  const firma = JSON.stringify(bloques.map((x) => [x.t, x.x, x.y, x.w, x.h]));
  const aplicada = propuestas.find((v) =>
    JSON.stringify(aBloques(v).map((x) => [x.t, x.x, x.y, x.w, x.h])) === firma)?.id;

  return (
    <div className={"mq" + (lectura ? " lectura" : "")}>
      {!lectura && <div className="mq-bar">
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
            {edit ? <><Ic n="check" /> Listo</> : <><Ic n="lapiz" /> Editar maqueta</>}
          </button>
        </div>
      </div>}

      {!lectura && propuestas.length > 0 && (
        <div className="mq-vars">
          <span className="mq-vars-h">Propuestas del agente</span>
          {propuestas.map((v: any) => (
            <button key={v.id} className={"mq-var" + (aplicada === v.id ? " on" : "")}
              title={[v.apuesta, v.contra && `Se despega de: ${v.contra}`].filter(Boolean).join("\n\n")}
              onClick={() => aplicarVariante(sec, v)}>
              <b>{v.nombre}</b>
              {v.apuesta && <span>{v.apuesta}</span>}
            </button>
          ))}
          {hayOv && <button className="mq-var sutil" onClick={restaurar}>Volver al original</button>}
        </div>
      )}

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
              <div className="mq-alin" role="group" aria-label="Alineación del contenido">
                {([["izq", "izquierda"], ["centro", "centro"], ["der", "derecha"]] as const).map(([k, l]) => (
                  <button key={k} className="mq-icono" aria-pressed={(b.a ?? "izq") === k}
                    aria-label={`Alinear a la ${l}`} title={`Alinear a la ${l}`} onClick={() => alinear(b.id, k)}>
                    <Ic n={`alin-${k}`} />
                  </button>
                ))}
              </div>
              <button className="mq-icono" title="Duplicar" onClick={() => duplicar(b.id)} aria-label="Duplicar bloque"><Ic n="duplicar" /></button>
              <button className="mq-icono peligro" title="Borrar" onClick={() => borrar(b.id)} aria-label="Borrar bloque"><Ic n="basura" /></button>
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
              <span className="mq-grip" onPointerDown={(e) => gestionar(e, blk.id, "mover")}><Ic n="agarre" />{blk.t}</span>
            )}
            <div className="mq-body" data-a={blk.a ?? "izq"}>
              <Pieza tipo={blk.t} id={blk.id} sec={sec} copyDe={copyDe} guardarCopy={guardarCopy}
                editable={!lectura && (!edit || texto === blk.id)} />
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
    case "tabs": return <div className="w-tabs">{PRODUCTOS.map((t, i) => <span className={"w-tab" + (i === 0 ? " on" : "") + (NUEVOS.includes(t) ? " nuevo" : "")} key={t}>{t}{NUEVOS.includes(t) ? " ·nuevo" : ""}</span>)}</div>;
    case "bullets": return <div className="w-bul">{[0, 1, 2].map((i) => <span className="w-bul-l" key={i} />)}</div>;
    case "flujo": return texto("w-flujo", "Asistencia → Nómina → Desarrollo");
    case "agente": return <div className="w-ag"><span className="w-ag-ic" />{texto("w-ag-n", "Agente", "n")}</div>;
    case "caso": return <div className="w-caso">{texto("w-caso-m", "—%", "m")}{texto("w-caso-c", "cita breve", "c")}{texto("w-caso-a", "nombre · cargo", "a")}</div>;
    case "sellos": return <div className="w-sellos">{[0, 1, 2, 3].map((i) => <span className="w-sello" key={i} />)}</div>;
    case "carrusel": return (
      <div className="w-carr">
        <span className="w-carr-fl">‹</span>
        <div className="w-carr-pista">{Array.from({ length: 5 }).map((_, i) => <span className="w-logo-ph" key={i} />)}</div>
        <span className="w-carr-fl">›</span>
        <div className="w-carr-pts">{[0, 1, 2].map((i) => <i className={i === 0 ? "on" : ""} key={i} />)}</div>
      </div>
    );
    case "rating": return (
      <div className="w-rat"><span className="w-rat-est">★★★★★</span>{texto("w-rat-t", "4.6/5 en Capterra · 800+ reseñas")}</div>
    );
    case "chat": return (
      <div className="w-chat">
        {texto("w-chat-n", "Crehana AI · Scout", "n")}
        {texto("w-chat-p", "¿Quién tiene el desempeño más alto este trimestre?", "p")}
        {texto("w-chat-r", "La respuesta del agente, en lenguaje natural.", "r")}
      </div>
    );
    case "circuito": return (
      <div className="w-circ">
        {["p1", "p2", "p3", "p4"].map((p, i) => (
          <span className="w-circ-n" key={p}>{i > 0 && <i className="w-circ-fl">→</i>}{texto("w-circ-t", `Paso ${i + 1}`, p)}</span>
        ))}
      </div>
    );
    case "modulo": return (
      <div className="w-mod"><span className="w-mod-ic" />{texto("w-mod-n", "Crehana Core", "n")}{texto("w-mod-d", "qué resuelve, en una línea", "d")}</div>
    );
    case "plan": return (
      <div className="w-plan">{texto("w-plan-n", "Plan", "n")}{texto("w-plan-p", "desde US$ —", "p")}{texto("w-plan-d", "qué incluye", "d")}<span className="w-plan-cta">Ver planes</span></div>
    );
    case "video": return (
      <div className="w-video"><span className="w-video-play">▶</span>{texto("w-video-t", "Demo grabada · 3 min", "t")}</div>
    );
    case "faq": return (
      <div className="w-faq">{["q1", "q2", "q3"].map((q, i) => (
        <span className="w-faq-l" key={q}>{texto("w-faq-q", `¿Pregunta ${i + 1}?`, q)}<i>+</i></span>
      ))}</div>
    );
    case "comparativa": return (
      <div className="w-comp">
        <div className="w-comp-c">{texto("w-comp-h", "Antes", "a")}<span className="w-bul-l" /><span className="w-bul-l" /></div>
        <div className="w-comp-c con">{texto("w-comp-h", "Con Crehana", "b")}<span className="w-bul-l" /><span className="w-bul-l" /></div>
      </div>
    );
    default: return <div className="w-ph" />;
  }
}

/* ---------------- piezas compartidas ---------------- */

/** ✓ y ✕ independientes por revisora; volver a tocar el marcado deshace la decisión. */
function Aprobacion({ clave, valor, guardar, compacta }: any) {
  const texto: Record<string, string> = { si: "aprobó", no: "rechazó" };
  return (
    <div className={"apr-wrap" + (compacta ? " compacta" : "")} role="group" aria-label="Aprobación">
      {REVISORES.map((r) => {
        const v = valor(clave, r);
        return (
          <div className={"apr" + (v ? " " + v : "")} key={r} title={`${r} ${texto[v] ?? "todavía no decidió"}`}>
            <span className="apr-who">{r}</span>
            <button className="apr-btn si" aria-pressed={v === "si"} aria-label={`${r} aprueba`}
              onClick={() => guardar(clave, r, v === "si" ? null : "si")}><Ic n="check" /></button>
            <button className="apr-btn no" aria-pressed={v === "no"} aria-label={`${r} rechaza`}
              onClick={() => guardar(clave, r, v === "no" ? null : "no")}><Ic n="cerrar" /></button>
          </div>
        );
      })}
    </div>
  );
}

const fechaHilo = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

function Hilo({ clave, hilos, comentar, yo }: any) {
  const [texto, setTexto] = useState("");
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const raiz = hilos.filter((c: any) => c.clave === clave && !c.padre);

  const enviar = () => { comentar(clave, texto); setTexto(""); };
  const responder = (padre: string) => { comentar(clave, respuesta, padre); setRespuesta(""); setRespondiendo(null); };

  return (
    <div className="th">
      {raiz.length === 0 && (
        <p className="th-vacio">Todavía no hay comentarios. Lo que escribas acá lo ve todo el equipo, y el agente lo lee como instrucción antes de proponer.</p>
      )}
      {raiz.map((c: any) => (
        <div className="cm" key={c.id}>
          <div className="cm-top"><span className="cm-a">{c.autor}</span><span className="cm-t">{fechaHilo(c.creado)}</span></div>
          <div className="cm-b">{c.texto}</div>
          {hilos.filter((r: any) => r.padre === c.id).map((r: any) => (
            <div className="cm re" key={r.id}>
              <div className="cm-top"><span className="cm-a">{r.autor}</span><span className="cm-t">{fechaHilo(r.creado)}</span></div>
              <div className="cm-b">{r.texto}</div>
            </div>
          ))}
          {respondiendo === c.id ? (
            <div className="cmp re">
              <input className="cmp-in" value={respuesta} autoFocus placeholder={`Responder como ${yo}`}
                onChange={(e) => setRespuesta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") responder(c.id);
                  if (e.key === "Escape") { e.stopPropagation(); setRespondiendo(null); }
                }} />
              <button className="btn cmp-go" onClick={() => responder(c.id)}>Responder</button>
            </div>
          ) : (
            <button className="cm-reply" onClick={() => { setRespondiendo(c.id); setRespuesta(""); }}>Responder</button>
          )}
        </div>
      ))}
      <div className="cmp">
        <span className="cmp-who">{yo}</span>
        <input className="cmp-in" value={texto} placeholder="Escribí un comentario"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
        <button className="btn cmp-go" onClick={enviar}>Enviar</button>
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
        <h2>{d.tesis?.titulo}</h2>
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

const ESTADOS_BL: [string, string][] = [["pendiente", "Pendiente"], ["en diseño", "En diseño"], ["publicado", "Publicado"]];
const claseBl = (e: string) => (e === "publicado" ? "pub" : e === "en diseño" ? "dis" : "pen");

function Backlog({ backlog, setBacklog, home, valorAprob, guardarAprob, persistir, enEstaPagina, ir, pagina }: any) {
  const [filtro, setFiltro] = usePreferencia<string>("backlog-filtro", "abiertos");
  const secciones = home.HOME?.secciones ?? [];
  const propios = backlog.filter(enEstaPagina);
  const pasa = (b: any) =>
    filtro === "todos" ? true : filtro === "abiertos" ? b.estado !== "publicado" : b.estado === filtro;
  const visibles = propios.filter(pasa);
  const porSec: Record<string, any[]> = {};
  visibles.forEach((b: any) => { (porSec[b.seccion] ??= []).push(b); });

  const filtros: [string, string, number][] = [
    ["abiertos", "Abiertos", propios.filter((b: any) => b.estado !== "publicado").length],
    ...ESTADOS_BL.map(([k, l]) => [k, l, propios.filter((b: any) => b.estado === k).length] as [string, string, number]),
    ["todos", "Todos", propios.length],
  ];

  function cambiar(b: any, estado: string) {
    setBacklog((v: any[]) => v.map((x) => (x.id === b.id ? { ...x, estado } : x)));
    persistir("el estado", () => db.from("backlog").update({ estado, actualizado: new Date().toISOString() }).eq("id", b.id));
  }

  return (
    <>
      <div className="bk-bar">
        <div className="bk-filtros" role="tablist" aria-label="Filtrar por estado">
          {filtros.map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={filtro === k} className="bk-f" onClick={() => setFiltro(k)}>
              {l}<span>{n}</span>
            </button>
          ))}
        </div>
        <span className="bk-ayuda">Cada corrida del lunes suma los cambios que salen de las señales, atados a la sección que tocan.</span>
      </div>

      {visibles.length === 0 && (
        <div className="empty"><b>Nada en este filtro</b>Probá con “Todos” para ver el backlog completo.</div>
      )}

      {Object.keys(porSec).sort().map((sec) => (
        <section className="bk-g" key={sec}>
          <div className="bk-gh">
            <h4><span>{sec}</span>{secciones.find((s: any) => s.n === sec)?.t ?? ""}</h4>
            <span className="bk-gn">{porSec[sec].length}</span>
            <button className="bk-ver" onClick={() => ir({ vista: "home", pagina, sec })}>Ver la sección</button>
          </div>
          <ul className="bk-lista">
            {porSec[sec].map((b: any) => (
              <li className="bk-fila" key={b.id}>
                <label className={"bk-est " + claseBl(b.estado)}>
                  <span className="sr">Estado</span>
                  <select value={b.estado} onChange={(e) => cambiar(b, e.target.value)}>
                    {ESTADOS_BL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <div className="bk-txt">
                  <b>{b.titulo}</b>
                  {(() => {
                    /* El agente manda el copy propuesto dentro de `detalle`, después de §COPY. */
                    const [det, copy] = String(b.detalle ?? "").split("\n\n§COPY\n");
                    return (
                      <>
                        {det && <p>{det}</p>}
                        {copy && <blockquote className="bk-copy"><span>Copy propuesto</span>{copy}</blockquote>}
                      </>
                    );
                  })()}
                  {b.origen && <span className="bk-origen">{b.origen}</span>}
                </div>
                <Aprobacion clave={`bk-${b.id}`} valor={valorAprob} guardar={guardarAprob} compacta />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

const SEV_CORTA: Record<string, string> = { crit: "Crítica", warn: "Alta", info: "Media", ok: "Oportunidad" };

function Historial({ corridas }: any) {
  const [abierta, setAbierta] = useState<string | null>(corridas[0]?.id ?? null);
  if (!corridas.length) return <div className="empty"><b>Sin corridas archivadas</b>La primera corrida la guarda el agente.</div>;
  return (
    <ol className="hist">
      {corridas.map((r: any, i: number) => {
        const hallazgos = r.findings ?? [];
        const abiertaEsta = abierta === r.id;
        const fecha = new Date(r.fecha + "T12:00:00Z").toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", timeZone: "America/La_Paz" });
        return (
          <li className={"run" + (abiertaEsta ? " abierta" : "")} key={r.id}>
            <button className="run-head" aria-expanded={abiertaEsta} disabled={!hallazgos.length && !r.visual?.nota}
              onClick={() => setAbierta(abiertaEsta ? null : r.id)}>
              <span className="run-n">C{String(r.n).padStart(2, "0")}</span>
              <span className="run-f">{fecha}{i === 0 && <em>Última</em>}</span>
              <span className="run-t">{r.headline}</span>
              <span className="run-c">{hallazgos.length ? `${hallazgos.length} señales` : "sin señales"}</span>
            </button>
            {abiertaEsta && (
              <div className="run-body">
                {hallazgos.map((h: any) => (
                  <div className="run-item" key={h.id}>
                    <span className={"sev " + h.sev}>{SEV_CORTA[h.sev] ?? h.sev}</span>
                    <span>{h.title}</span>
                  </div>
                ))}
                {r.visual?.nota && <p className="run-nota">{r.visual.nota}</p>}
                {r.visual?.caidas?.length > 0 && <p className="run-nota">Fuentes caídas: {r.visual.caidas.join(" · ")}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Primera vez en este navegador: sin saber quién es, un comentario o una aprobación quedaría firmado a nombre de otra persona. */
function Bienvenida({ elegir }: { elegir: (p: string) => void }) {
  const primera = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { primera.current?.focus(); }, []);
  return (
    <div className="bv-velo">
      <div className="bv" role="dialog" aria-modal="true" aria-labelledby="bv-t">
        <div className="dot" />
        <h2 id="bv-t">Hola, ¿quién sos?</h2>
        <p>Con tu nombre firmamos los comentarios y las aprobaciones. Queda guardado en este navegador y lo podés cambiar cuando quieras desde abajo a la izquierda.</p>
        <div className="bv-lista">
          {PERSONAS.map((p, i) => (
            <button key={p} ref={i === 0 ? primera : undefined} className="bv-op" onClick={() => elegir(p)}>
              <span className="av yo-av">{p.slice(0, 1)}</span>
              <span><b>{p}</b><small>{ROLES[p]}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
