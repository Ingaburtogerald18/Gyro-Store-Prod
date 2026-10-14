-- ============================================================================
-- 0030_versiones_de_la_tienda.sql — Últimas 5 versiones publicadas de la tienda
-- ============================================================================
-- ⚠️ Correrla en el SQL Editor de Supabase solo con el OK del dueño. Va
-- después de 0029, en una sola transacción y se puede correr más de una vez.
--
-- Cada «Publicar» del modo edición guarda cómo quedó la tienda: la portada
-- (banners, navegación, secciones, carrito) y la presentación de los productos
-- (fotos, «Mostrar en la tienda», orden), con quién, cuándo y qué cambió.
-- Precio, stock y datos de la plantilla no se guardan: vienen del panel. El
-- servidor conserva solo las últimas 5 y no borra de R2 lo que una versión usa.
-- ============================================================================

begin;

create table if not exists public.store_versions (
  id            uuid primary key default gen_random_uuid(),
  landing       jsonb not null,
  products      jsonb not null default '{}',
  summary       jsonb not null default '[]',
  published_by  uuid references public.profiles(id) on delete set null,
  published_at  timestamptz not null default now()
);

create index if not exists store_versions_published_at_idx on public.store_versions (published_at desc);

comment on table public.store_versions is 'Últimas versiones publicadas desde el modo edición (portada y presentación de productos). El servidor guarda 5.';

-- Mismo trato que el resto de las tablas (01_schema.sql, sección 13).
alter table public.store_versions enable row level security;
revoke all on public.store_versions from anon, authenticated;
grant all on public.store_versions to service_role;

commit;

notify pgrst, 'reload schema';

-- Verificación: "Todo en orden" o qué falta.
with problemas as (
  select 'Falta la tabla' as problema, 'store_versions' as detalle
  where to_regclass('public.store_versions') is null
  union all
  select 'Falta RLS', 'store_versions'
  where exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'store_versions' and not rowsecurity
  )
)
select problema, detalle from problemas
union all
select 'Todo en orden', 'Versiones de la tienda listas.'
where not exists (select 1 from problemas);
