/** Carga el contenido actual del tablero en Supabase. Corré `npm run seed` una sola vez. */
import { adminDb } from "../lib/db";
import seed from "../data/seed.json";

async function main() {
  const sb = adminDb();
  const todos = [seed.BUK, ...seed.OTROS];

  for (const c of todos as any[]) {
    await sb.from("competidores").upsert({
      id: c.id, nombre: c.nombre, sitio: c.sitio, pais: c.pais, frente: c.frente,
      tipo: c.tipo ?? "competidor", estado: c.estado ?? "activo",
      data: { tesis: c.tesis, kpis: c.kpis, aviso: c.aviso, ocupado: c.ocupado,
              libre: c.libre, territorioNota: c.territorioNota, acciones: c.acciones },
    });

    const corrida = c.corrida?.id;
    if (corrida) {
      await sb.from("corridas").upsert({
        id: corrida, n: c.corrida.n, fecha: "2026-09-17",
        headline: c.tesis?.titulo ?? "", findings: [], visual: {},
      });
    }
    for (const s of c.senales ?? []) {
      await sb.from("senales").upsert({
        id: s.id, competidor: c.id, corrida, sev: s.sev, cat: s.cat,
        titulo: s.t, detalle: s.d, porque: s.w, vs: s.vs ?? {},
        fuentes: s.src ?? [], verificado: s.ver ?? "",
      });
    }
  }

  await sb.from("home").upsert({
    id: "home",   // una fila por página del sitio
    data: { HOME: seed.HOME, UX: seed.UX, RECURSOS: seed.RECURSOS,
            WIRE: seed.WIRE, COPY_DEF: seed.COPY_DEF,
            REVISA: seed.REVISA, NO_REVISA: seed.NO_REVISA },
  });

  const backlog = [
    ["b001","01","Meter IA y nómina en el H1","Rankmi, Buk CO y Humand llevan la IA a la primera línea; Rankmi, Buk y Factorial nombran nómina en el hero.","Rankmi · Buk CO · Factorial"],
    ["b002","03","Conseguir cifras reales para la banda de resultados","Bloqueante: las tiene Data. Los cuatro referentes verificados tienen su banda de métricas.","Rankmi · Buk CO"],
    ["b003","04","Ampliar los tabs de 5 a 7 con Pay y Time","Los lanzamientos entran donde la gente ya mira. Requiere capturas de producto.","Ticket de home"],
    ["b004","06","Reemplazar la sección de IA por la grilla de los 10 agentes","Factorial One y Sammy AI están bautizados y con sección propia.","Factorial · Humand"],
    ["b005","07","Una métrica validada por testimonio","Bloqueante: los referentes muestran −70% de tiempo y 60% de horas ahorradas.","Rankmi · Factorial"],
    ["b006","08","Definir qué certificaciones podemos declarar","Con nómina en la oferta, la objeción pasa a ser cumplimiento fiscal.","Buk · Rankmi"],
    ["b007","06","Evaluar subir los agentes antes del catálogo","Factorial One ocupa la 4.ª sección, antes de los módulos.","Factorial · home"],
    ["b008","07","Usar Capterra como puente mientras llegan las métricas","Factorial cita reseñas de G2 con nombre y cargo.","Factorial · home"],
    ["b009","01","Probar un H1 de menos de ocho palabras","Humand gana contraste con “Tu empresa, más inteligente.”","Humand · home"],
    ["b010","02","Añadir corte por rol después de los módulos","Rankmi segmenta beneficios en RRHH, ejecutivos, jefaturas y colaboradores.","Rankmi · home"],
  ];
  for (const [id, seccion, titulo, detalle, origen] of backlog) {
    await sb.from("backlog").upsert({ id, seccion, titulo, detalle, origen, corrida: "01", estado: "pendiente" });
  }

  console.log(`Listo: ${todos.length} competidores, ${backlog.length} entradas de backlog y la propuesta de home.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
