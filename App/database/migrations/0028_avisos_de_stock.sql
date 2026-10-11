-- ============================================================================
-- 0028_avisos_de_stock.sql — «Avisame cuando haya» desde la tienda
-- ============================================================================
-- ⚠️ Correrla en el SQL Editor de Supabase solo con el OK del dueño. Va
-- después de 0027, en una sola transacción y se puede correr más de una vez.
--
-- Un cliente pide que le avisen cuando llegue una variante agotada o en camino.
-- Entra al CRM como contacto (origen «Tienda»; si el teléfono ya existe, se
-- reutiliza) con un seguimiento «Avisar cuando llegue: <modelo> · <variante>».
-- `stock_notices` liga ese seguimiento a la variante: cuando tiene stock, el
-- CRM lo muestra como «Ya llegó, avisar». Nadie recibe mensajes automáticos.
-- Un aviso abierto por teléfono y variante: lo controla el servidor mirando
-- si el seguimiento sigue pendiente.
-- ============================================================================

begin;

-- Postgres 12+ permite agregar el valor dentro de la transacción; no se usa acá.
alter type public.contact_origin add value if not exists 'store' before 'other';

create table if not exists public.stock_notices (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  follow_up_id     uuid not null references public.follow_ups(id) on delete cascade,
  catalog_item_id  uuid not null references public.catalog_items(id) on delete cascade,
  variant_name     text not null default '',
  label            text not null,
  created_at       timestamptz not null default now()
);

create index if not exists stock_notices_contact_id_idx on public.stock_notices (contact_id);
create index if not exists stock_notices_follow_up_id_idx on public.stock_notices (follow_up_id);
create index if not exists stock_notices_catalog_item_id_idx on public.stock_notices (catalog_item_id);

comment on table public.stock_notices is 'Aviso pedido desde la tienda: liga un seguimiento del CRM a la variante que el cliente espera.';

-- Mismo trato que el resto de las tablas (01_schema.sql, sección 13).
alter table public.stock_notices enable row level security;
revoke all on public.stock_notices from anon, authenticated;
grant all on public.stock_notices to service_role;

commit;

notify pgrst, 'reload schema';

-- Verificación: "Todo en orden" o qué falta.
with problemas as (
  select 'Falta el origen' as problema, 'contact_origin = store' as detalle
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'contact_origin' and e.enumlabel = 'store'
  )
  union all
  select 'Falta la tabla', 'stock_notices'
  where to_regclass('public.stock_notices') is null
  union all
  select 'Falta RLS', 'stock_notices'
  where exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'stock_notices' and not rowsecurity
  )
)
select problema, detalle from problemas
union all
select 'Todo en orden', 'Origen «Tienda» y tabla stock_notices listos.'
where not exists (select 1 from problemas);
