/**
 * Arma el texto que se le pasa a una IA para que implemente la home en HubSpot.
 * Sale todo lo que hay que saber por sección: estructura, textos finales, decisiones
 * del equipo y lo que queda pendiente. En Markdown, para pegar tal cual en un prompt.
 */
import { aBloques, type Blk } from "@/lib/maqueta";

type Args = {
  home: any;
  pagina: string;
  nombrePagina: string;
  layoutDe: (sec: string) => any;
  copyDe: (sec: string, k: string) => string;
  backlog: any[];
  valorAprob: (clave: string, r: string) => string | null;
  revisores: string[];
  hilos: any[];
  corrida?: any;
};

const FONDOS: Record<string, string> = {
  claro: "blanco (#FFFFFF)",
  gris: "gris claro (#F4F4F8)",
  profundo: "morado profundo (#140058)",
  lima: "lima (#D6FD6A)",
};

/** Cómo se llama cada pieza en palabras, para que la IA sepa qué componente construir. */
export const PIEZAS: Record<string, string> = {
  nav: "barra de navegación", eyebrow: "línea de categoría sobre el titular",
  h1: "titular principal (H1)", h2: "título de sección (H2)", h2mini: "título corto (H3)",
  sub: "bajada / párrafo", nota: "nota al pie, texto chico",
  cta: "botón primario", cta2: "botón secundario", form: "formulario",
  mock: "imagen de producto grande", mockmini: "imagen de producto chica",
  logos: "fila de logos de clientes", carrusel: "carrusel de logos",
  rating: "insignia de reseñas con estrellas", cifra: "métrica destacada",
  tabs: "pestañas de módulos", bullets: "lista de puntos", caso: "tarjeta de testimonio",
  agente: "tarjeta de agente de IA", chat: "conversación de ejemplo con Crehana AI",
  modulo: "tarjeta de módulo", plan: "tarjeta de plan / precio", video: "video o demo grabada",
  faq: "acordeón de preguntas frecuentes", comparativa: "comparación antes / con Crehana",
  circuito: "secuencia de pasos con flechas", flujo: "línea de flujo", sellos: "sellos de certificación",
  ph: "espacio vacío",
};

/** Las claves de copy de cada pieza: el id pelado, o id.parte cuando la pieza tiene partes. */
const PARTES: Record<string, string[]> = {
  cifra: ["num", "lab"], caso: ["m", "c", "a"], chat: ["n", "p", "r"],
  circuito: ["p1", "p2", "p3", "p4"], modulo: ["n", "d"], plan: ["n", "p", "d"],
  video: ["t"], faq: ["q1", "q2", "q3"], comparativa: ["a", "b"],
};

const lista = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export function armarBrief(a: Args) {
  const secciones = a.home.HOME?.secciones ?? [];
  const fecha = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

  const cabecera = `# ${a.home.HOME?.nombre ?? a.nombrePagina}: qué actualizar en el sitio

Generado el ${fecha} desde Sherlock${a.corrida ? `, con la corrida ${a.corrida.n} del ${a.corrida.fecha}` : ""}.

Este documento describe, sección por sección, **cómo tiene que quedar la home** y **qué falta cambiar**. Está pensado para implementarlo en un módulo de HubSpot.

## Cómo leerlo
- Cada sección es una franja de ancho completo de la página, en el orden en que aparecen.
- La maqueta está descrita sobre una **grilla de 12 columnas**: \`x\` es la columna donde empieza el bloque (0 a 11) y \`ancho\` cuántas columnas ocupa. \`fila\` es el orden vertical.
- **Los textos que aparecen acá son los definitivos.** Si un texto está vacío, ese bloque no lleva copy.
- Lo que está bajo "Pendiente" todavía no está aprobado: implementalo solo si la sección lo pide explícitamente.
- Respetá los nombres de producto tal cual: Crehana Core, Crehana Pay, Crehana Time, Crehana Attract, Crehana Learn, Crehana Perform, Crehana Engage y **Crehana AI** (con "AI", nunca "IA"). En genérico, "IA".

## Marca
- Morado principal #4822F4 · morado profundo #140058 · lima #D6FD6A.
- Títulos en Familjen Grotesk (o la display del sitio); texto en Inter.
- Tuteo, español latino. CTA: "Solicita una demo" o "Agenda un demo".
`;

  const cuerpo = secciones.map((s: any) => {
    const ov = a.layoutDe(s.n);
    const wire = a.home.WIRE?.[s.n] ?? {};
    const bloques: Blk[] = aBloques(ov?.bloques?.length ? ov : wire);
    const fondo = (ov?.fondo ?? wire.fondo) ?? "claro";

    const estructura = bloques.map((b) => {
      const nombre = PIEZAS[b.t] ?? b.t;
      const alineado = b.a === "centro" ? " · centrado" : b.a === "der" ? " · alineado a la derecha" : "";
      return `${nombre} — columna ${b.x}, ancho ${b.w}/12, fila ${b.y}${alineado}`;
    });

    const textos: string[] = [];
    for (const b of bloques) {
      const partes = PARTES[b.t];
      if (partes) {
        for (const p of partes) {
          const v = a.copyDe(s.n, `${b.id}.${p}`);
          if (v) textos.push(`${PIEZAS[b.t] ?? b.t} (${b.id}) · ${p}: "${v}"`);
        }
      } else {
        const v = a.copyDe(s.n, b.id);
        if (v) textos.push(`${PIEZAS[b.t] ?? b.t}: "${v}"`);
      }
    }

    const clave = `sec-${s.n}`;
    const decisiones = a.revisores.map((r) => {
      const v = a.valorAprob(clave, r);
      return `${r}: ${v === "si" ? "aprobó" : v === "no" ? "rechazó" : "sin decidir"}`;
    });

    const comentarios = a.hilos
      .filter((h: any) => h.clave === `${a.pagina}/sec-${s.n}`)
      .map((h: any) => `${h.autor}: "${h.texto}"`);

    const pendientes = a.backlog
      .filter((b: any) => (b.pagina ?? "home") === a.pagina && b.seccion === s.n && b.estado !== "publicado")
      .map((b: any) => {
        const [detalle, copy] = String(b.detalle ?? "").split("\n\n§COPY\n");
        return `**${b.titulo}** (${b.estado})${detalle ? `\n  ${detalle}` : ""}${copy ? `\n  Copy propuesto:\n\n\`\`\`\n${copy}\n\`\`\`` : ""}`;
      });

    return `
---

## Sección ${s.n} · ${s.t}

- **Qué cambia:** ${s.estado ?? "—"}${s.esfuerzo ? ` · ${s.esfuerzo}` : ""}
- **Fondo:** ${FONDOS[fondo] ?? fondo}
- **Por qué:** ${s.why ?? s.porque ?? "—"}
- **Revisión:** ${decisiones.join(" · ")}

### Estructura
${lista(estructura)}

### Textos definitivos
${textos.length ? lista(textos) : "- (sin textos definidos todavía)"}
${comentarios.length ? `\n### Lo que pidió el equipo\n${lista(comentarios)}` : ""}
${pendientes.length ? `\n### Pendiente de decidir\n${lista(pendientes)}` : ""}`.trimEnd();
  });

  return `${cabecera}${cuerpo.join("\n")}\n`;
}
