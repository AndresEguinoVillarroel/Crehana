-- Sherlock · esquema de la base
-- Pegar entero en Supabase → SQL Editor → Run.

create table if not exists competidores (
  id text primary key,
  nombre text not null,
  sitio text,
  pais text,
  frente text,
  tipo text not null default 'competidor',   -- 'competidor' | 'referente'
  estado text default 'activo',
  data jsonb default '{}'::jsonb,            -- tesis, kpis, aviso, ocupado, libre, acciones
  creado timestamptz default now()
);

create table if not exists corridas (
  id text primary key,                       -- semana ISO, ej. 2026-W39
  n int not null,
  fecha date not null,
  headline text,
  findings jsonb default '[]'::jsonb,
  visual jsonb default '{}'::jsonb,
  creado timestamptz default now()
);

create table if not exists senales (
  id text primary key,                       -- ej. r1, f7
  competidor text references competidores(id) on delete cascade,
  corrida text references corridas(id) on delete set null,
  sev text,                                  -- crit | warn | info | ok
  cat text,
  titulo text,
  detalle text,
  porque text,
  vs jsonb default '{}'::jsonb,              -- {ellos, nos, saldo, texto}
  fuentes jsonb default '[]'::jsonb,
  verificado text,
  creado timestamptz default now()
);

create table if not exists triage (
  senal text primary key references senales(id) on delete cascade,
  decision text,                             -- adoptar | investigar | ignorar
  owner text,
  actualizado timestamptz default now()
);

create table if not exists backlog (
  id text primary key,
  seccion text not null,                     -- 01..09
  titulo text not null,
  detalle text,
  origen text,
  corrida text,
  estado text default 'pendiente',           -- pendiente | en diseño | publicado
  owner text,
  actualizado timestamptz default now()
);

create table if not exists aprobaciones (
  id text primary key,                       -- "<clave>__<revisora>"
  clave text not null,                       -- sección 01..09 o bk-<id>
  revisora text not null,                    -- Xime | Yess
  valor text not null,                       -- si | no
  actualizado timestamptz default now()
);

create table if not exists hilos (
  id text primary key,
  clave text not null,                       -- sec-01, bk-b007, ...
  padre text,
  autor text not null,
  texto text not null,
  creado timestamptz default now()
);

create table if not exists capturas (
  id text primary key,                       -- sec-01-ref, f-rankmi-r1, ...
  url text not null,
  prev text,
  pie text,
  actualizado timestamptz default now()
);

create table if not exists copys (
  seccion text primary key,
  valores jsonb not null default '{}'::jsonb,
  actualizado timestamptz default now()
);

create table if not exists layouts (
  seccion text primary key,
  fondo text,
  filas jsonb not null default '[]'::jsonb,
  actualizado timestamptz default now()
);

create table if not exists home (
  id text primary key default 'actual',      -- una sola fila: propuesta, ux, recursos, wire, copy_def
  data jsonb not null default '{}'::jsonb,
  actualizado timestamptz default now()
);

-- Acceso: el tablero es interno y vive detrás de una URL privada.
-- RLS abierta al rol anon para lectura y escritura del equipo.
-- Si más adelante sumás login de Supabase, cambiá `true` por `auth.role() = 'authenticated'`.
do $$
declare t text;
begin
  foreach t in array array['competidores','corridas','senales','triage','backlog',
                           'aprobaciones','hilos','capturas','copys','layouts','home']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists equipo_lee on %I', t);
    execute format('drop policy if exists equipo_escribe on %I', t);
    execute format('create policy equipo_lee on %I for select using (true)', t);
    execute format('create policy equipo_escribe on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- Bucket para las capturas semanales
insert into storage.buckets (id, name, public)
values ('capturas', 'capturas', true)
on conflict (id) do nothing;

drop policy if exists capturas_lee on storage.objects;
create policy capturas_lee on storage.objects for select using (bucket_id = 'capturas');
drop policy if exists capturas_escribe on storage.objects;
create policy capturas_escribe on storage.objects for insert with check (bucket_id = 'capturas');
