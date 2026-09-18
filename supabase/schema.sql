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
  pagina text not null default 'home',
  seccion text not null,
  valores jsonb not null default '{}'::jsonb,
  actualizado timestamptz default now(),
  primary key (pagina, seccion)
);

create table if not exists layouts (
  pagina text not null default 'home',
  seccion text not null,
  fondo text,
  bloques jsonb not null default '[]'::jsonb,   -- [{id, t, x, y, w, h}] sobre la grilla de 12
  filas jsonb,                                  -- legado: el modelo de filas anterior
  actualizado timestamptz default now(),
  primary key (pagina, seccion)
);

-- Una fila por página del sitio: 'home' hoy, y las que se sumen después.
-- `data` lleva las secciones, los wireframes y el copy por defecto de esa página.
create table if not exists home (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  actualizado timestamptz default now()
);

-- Para bases creadas antes del modelo de bloques y de páginas
alter table layouts add column if not exists bloques jsonb not null default '[]'::jsonb;
alter table layouts alter column filas drop not null;
alter table layouts add column if not exists pagina text not null default 'home';
alter table copys  add column if not exists pagina text not null default 'home';
alter table backlog add column if not exists pagina text not null default 'home';

do $$
begin
  if (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
      where c.relname = 'layouts_pkey') > 0
     and not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                     where c.relname = 'layouts_pkey' and a.attname = 'pagina') then
    alter table layouts drop constraint layouts_pkey;
    alter table layouts add primary key (pagina, seccion);
  end if;
  if (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
      where c.relname = 'copys_pkey') > 0
     and not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                     where c.relname = 'copys_pkey' and a.attname = 'pagina') then
    alter table copys drop constraint copys_pkey;
    alter table copys add primary key (pagina, seccion);
  end if;
end $$;

update home set id = 'home' where id = 'actual';

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

-- Tiempo real: sin esto el canal se suscribe pero no llega ningún evento,
-- porque en Supabase una tabla no emite cambios hasta que entra a la publicación.
do $$
declare t text;
begin
  foreach t in array array['competidores','corridas','senales','triage','backlog',
                           'aprobaciones','hilos','capturas','copys','layouts','home']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
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
