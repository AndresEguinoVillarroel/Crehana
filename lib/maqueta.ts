/**
 * Modelo de La Maqueta: bloques con posición y tamaño sobre una grilla de 12 columnas.
 * La grilla es imantada y sin superposición, como los dashboards de ClickUp:
 * arrastrás donde quieras, el bloque cae en la grilla y los vecinos se corren.
 */

/** a: alineación horizontal del contenido. Sin valor es izquierda, que es como nacen todos. */
export type Alineacion = "izq" | "centro" | "der";
export type Blk = { id: string; t: string; x: number; y: number; w: number; h: number; a?: Alineacion };

export const COLS = 12;

/** Alto por defecto de cada tipo, en filas de grilla. */
export const ALTOS: Record<string, number> = {
  nav: 2, eyebrow: 1, h1: 3, h2: 2, h2mini: 1, sub: 2, nota: 1,
  cta: 2, cta2: 2, mock: 4, mockmini: 3, form: 4, logos: 2,
  cifra: 3, tabs: 2, bullets: 2, flujo: 1, agente: 2, caso: 4,
  sellos: 2, ph: 1,
  carrusel: 3, rating: 2, chat: 6, circuito: 2, modulo: 4,
  plan: 5, video: 4, faq: 4, comparativa: 5,
};

export const alto = (t: string) => ALTOS[t] ?? 2;
export const topar = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

/** ¿Se solapan dos bloques? */
export function choca(a: Blk, b: Blk) {
  return a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Deja el layout consistente después de mover o estirar `fijo`:
 * lo respeta donde está, empuja hacia abajo lo que choque y después sube todo lo que pueda.
 */
export function acomodar(bloques: Blk[], fijo?: string): Blk[] {
  const orden = (a: Blk, b: Blk) => a.y - b.y || a.x - b.x;
  const anclado = fijo ? bloques.find((b) => b.id === fijo) : undefined;
  const resto = bloques.filter((b) => b.id !== fijo).sort(orden);

  const puestos: Blk[] = anclado ? [{ ...anclado }] : [];
  for (const b of resto) {
    const n = { ...b };
    let guarda = 0;
    while (puestos.some((p) => choca(n, p)) && guarda++ < 200) n.y++;
    puestos.push(n);
  }

  /* Compactar hacia arriba: sin esto quedarían huecos flotando. */
  const fin: Blk[] = [];
  for (const b of puestos.sort(orden)) {
    const n = { ...b };
    let guarda = 0;
    while (n.y > 0 && !fin.some((p) => choca({ ...n, y: n.y - 1 }, p)) && guarda++ < 200) n.y--;
    fin.push(n);
  }
  return fin.sort(orden);
}

/** Primer `y` libre para un bloque nuevo de ancho w. */
export function proximoY(bloques: Blk[]) {
  return bloques.reduce((max, b) => Math.max(max, b.y + b.h), 0);
}

/**
 * Lee cualquiera de las formas que tuvo el wireframe y devuelve bloques.
 * Acepta la actual `{bloques}`, la de filas con objetos y la vieja de tuplas [tipo, ancho].
 */
export function aBloques(wire: any): Blk[] {
  if (!wire) return [];
  /* Una lista vacía no cuenta: las filas viejas traen bloques [] por defecto y los datos siguen en filas. */
  if (Array.isArray(wire.bloques) && wire.bloques.length) {
    return wire.bloques.map((b: any) => ({
      id: b.id, t: b.t,
      x: Number(b.x) || 0, y: Number(b.y) || 0,
      w: Math.max(1, Number(b.w) || 1), h: Math.max(1, Number(b.h) || alto(b.t)),
      ...(b.a === "centro" || b.a === "der" ? { a: b.a } : {}),
    }));
  }

  const vistos: Record<string, number> = {};
  const out: Blk[] = [];
  let y = 0;
  for (const fila of wire.filas ?? []) {
    let x = 0;
    for (const crudo of fila ?? []) {
      const t = Array.isArray(crudo) ? crudo[0] : crudo.t;
      const wCrudo = Array.isArray(crudo) ? crudo[1] : crudo.w;
      const w = topar(Math.round(Number(wCrudo) || 1), 1, COLS);
      if (x + w > COLS) { y++; x = 0; }
      vistos[t] = (vistos[t] ?? 0) + 1;
      const id = (!Array.isArray(crudo) && crudo.id) || (vistos[t] === 1 ? t : `${t}-${vistos[t]}`);
      out.push({ id, t, x, y, w, h: alto(t) });
      x += w;
    }
    y++;
  }
  return acomodar(out);
}
