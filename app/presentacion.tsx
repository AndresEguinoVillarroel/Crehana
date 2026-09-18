"use client";

import { useEffect, useRef, useState } from "react";
import { Ic } from "./navegacion";

/**
 * La propuesta como se vería publicada: las secciones una debajo de otra, a todo el ancho,
 * sin tarjetas ni controles. Las notas son opcionales, para cuando se presenta.
 * La maqueta llega como render prop para no depender del editor.
 */
export function Presentacion({ home, nombrePagina, maqueta, cerrar }: {
  home: any; nombrePagina: string; maqueta: (sec: string) => React.ReactNode; cerrar: () => void;
}) {
  const H = home.HOME ?? {};
  const secciones: any[] = H.secciones ?? [];
  const pendientes: string[] = H.pendientes ?? [];
  const [notas, setNotas] = useState(false);
  const [activa, setActiva] = useState<string>(secciones[0]?.n ?? "");
  const lienzo = useRef<HTMLDivElement | null>(null);
  /* A dónde se pidió ir: dos flechas seguidas tienen que avanzar dos, aunque el scroll no haya llegado. */
  const pedido = useRef(0);

  const ir = (n: string) => document.getElementById(`pr-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cerrar(); return; }
      const i = pedido.current;
      const siguiente = ["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key);
      const anterior = ["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key);
      if (!siguiente && !anterior && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const j = e.key === "Home" ? 0 : e.key === "End" ? secciones.length - 1
        : Math.min(Math.max(i + (siguiente ? 1 : -1), 0), secciones.length - 1);
      pedido.current = j;
      setActiva(secciones[j]?.n);
      ir(secciones[j]?.n);
    };
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = ""; };
  }, [secciones, cerrar]);

  /* Qué sección se está mirando, para el índice lateral. */
  useEffect(() => {
    const raiz = lienzo.current;
    if (!raiz) return;
    const visibles = new Set<string>();
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const n = e.target.id.replace("pr-", "");
        if (e.isIntersecting) visibles.add(n); else visibles.delete(n);
      }
      const primera = [...visibles].sort()[0];
      if (primera && !alFondo()) marcar(primera);
    }, { root: raiz, rootMargin: "-10% 0px -60% 0px" });
    /* Las últimas secciones son cortas y nunca llegan arriba: al tocar fondo, la activa es la última. */
    const alFondo = () => raiz.scrollTop + raiz.clientHeight >= raiz.scrollHeight - 4;
    const marcar = (n: string) => { setActiva(n); pedido.current = Math.max(0, secciones.findIndex((s) => s.n === n)); };
    const alScroll = () => { if (alFondo() && secciones.length) marcar(secciones[secciones.length - 1].n); };
    raiz.addEventListener("scroll", alScroll, { passive: true });
    raiz.querySelectorAll(".pr-sec").forEach((el) => obs.observe(el));
    return () => { obs.disconnect(); raiz.removeEventListener("scroll", alScroll); };
  }, [notas]);

  return (
    <div className="pr pr-sitio" role="dialog" aria-modal="true" aria-label={`Vista del sitio · ${nombrePagina}`}>
      <div className="pr-top">
        <span className="pr-marca"><i className="dot" /> {nombrePagina} · como se vería publicada</span>
        <button className="pr-x" aria-pressed={notas} onClick={() => setNotas(!notas)}>
          {notas ? "Ocultar notas" : "Mostrar notas"}
        </button>
        <button className="pr-x" onClick={cerrar} aria-label="Salir de la vista del sitio">
          <Ic n="cerrar" /> Salir · Esc
        </button>
      </div>

      <div className="pr-lienzo" ref={lienzo}>
        {secciones.map((s) => (
          <section className="pr-sec" id={`pr-${s.n}`} key={s.n} aria-label={`${s.n} · ${s.t}`}>
            {notas && (
              <div className="pr-nota">
                <span className="pr-nota-n">{s.n}</span>
                <b>{s.t}</b>
                {s.porque && <span className="pr-nota-p">{s.porque}</span>}
              </div>
            )}
            {maqueta(s.n)}
          </section>
        ))}
        {notas && pendientes.length > 0 && (
          <section className="pr-pend-caja">
            <h2>Para avanzar, necesitamos de otros equipos</h2>
            <ul>{pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        )}
      </div>

      <nav className="pr-indice-lat" aria-label="Secciones">
        {secciones.map((s) => (
          <button key={s.n} aria-current={activa === s.n} onClick={() => ir(s.n)} title={`${s.n} · ${s.t}`}>
            <span className="pr-il-n">{s.n}</span><span className="pr-il-t">{s.t}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
