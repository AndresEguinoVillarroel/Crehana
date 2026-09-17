# Sherlock · radar competitivo de Crehana

Tablero del equipo de marketing y diseño, con un agente que corre solo cada lunes:
captura los sitios de competidores y referentes, los compara contra crehana.com,
y traduce lo que encuentra en cambios concretos para la home.

- **Tablero**: Next.js en Vercel. Señales, propuesta de home con wireframes editables, backlog, aprobaciones de Xime y Yess, comentarios en hilo.
- **Base**: Supabase. Todo compartido y en vivo: lo que decide una persona lo ven todas.
- **Agente**: GitHub Actions, lunes 12:00 UTC (08:00 en La Paz). Ahí Playwright funciona sin restricciones, así que las capturas salen solas.

---

## Puesta en marcha (unos 20 minutos, sin comprar dominio)

### 1. Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. SQL Editor → pegá todo `supabase/schema.sql` → **Run**. Crea las tablas, las políticas y el bucket de capturas.
3. Project Settings → API. Copiá tres valores: la **URL**, la **anon key** y la **service_role key**.

### 2. El repo

```bash
git clone https://github.com/<tu-usuario>/sherlock-crehana.git
cd sherlock-crehana
npm install
cp .env.example .env.local     # completá los valores de Supabase y tu ANTHROPIC_API_KEY
npm run seed                   # carga competidores, señales y la propuesta actual
npm run dev                    # http://localhost:3000
```

### 3. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importá este repo.
2. Environment Variables: pegá las mismas de `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`, `RUN_SECRET`).
3. Deploy. Queda en `https://sherlock-crehana.vercel.app` — esa es la URL que compartís con el equipo. Sin dominio propio.

### 4. El agente

En el repo: Settings → Secrets and variables → Actions → **New repository secret**, uno por cada uno:

| Secreto | De dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (secreta) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

Probalo sin esperar al lunes: pestaña **Actions** → *Sherlock — corrida semanal* → **Run workflow**.
Las capturas quedan como artefacto de la corrida por 30 días.

### 5. El botón "Correr ahora"

Necesita un token de GitHub con permiso `actions: write` sobre este repo, en `GITHUB_DISPATCH_TOKEN`,
y una frase cualquiera en `RUN_SECRET` que el tablero pide al apretar el botón. Sirve para que
nadie con el link pueda disparar corridas sin querer.

---

## Cómo trabaja el equipo

- **Yeni** parte del listado de recursos de diseño de cada sección: qué pieza falta, en qué formato y con cuánto esfuerzo.
- **Xime y Yess** aprueban o rechazan cada sección y cada cambio del backlog, cada una con su propia vía.
- Cualquiera **comenta en hilo** y responde, eligiendo con qué nombre escribe.
- El **copy de los wireframes se edita en la página** y gana sobre lo que proponga el agente: Sherlock nunca pisa un texto que el equipo tocó.
- **Ajustar layout** permite cambiar el ancho de cada bloque, moverlo y elegir la combinación de color de la sección.

## Qué hace el agente cada lunes

1. Lee su memoria: corridas anteriores, decisiones del equipo, backlog abierto, aprobaciones y comentarios.
2. Captura cada sitio sección por sección, y siempre también crehana.com.
3. Sube las capturas y guarda la anterior en `prev`, para poder comparar semanas.
4. Compara cada señal contra lo que ve hoy en crehana.com y da un saldo: ventaja de ellos, paridad o ventaja Crehana.
5. Escribe hasta cuatro entradas nuevas de backlog, sin duplicar lo que ya está abierto ni reabrir lo rechazado.
6. Deja un resumen de la semana.

Si una fuente se cae, la declara caída. Si no pudo ver algo, lo dice. Nunca describe un cambio visual que no vio.

## Estructura

```
app/            tablero (page.tsx + tablero.tsx) y el endpoint /api/run
lib/            cliente de Supabase y tokens de marca
scripts/        sherlock.ts (la corrida), prompt.md (sus instrucciones), seed.ts
supabase/       schema.sql
data/seed.json  el contenido actual: competidores, señales, propuesta, wireframes, recursos
```

## Notas

- La paleta y las tipografías son las de Crehana: `#4822F4`, `#140058`, lima `#D6FD6A`, Familjen Grotesk + Inter.
- Las políticas de la base están abiertas para el rol anónimo porque el tablero es interno y vive detrás de una URL privada. Si más adelante querés login, cambiá `true` por `auth.role() = 'authenticated'` en `schema.sql` y sumá Supabase Auth.
- `personio.es` bloquea el rastreo automatizado; el agente lo declara como no cubierto en vez de inventar.
