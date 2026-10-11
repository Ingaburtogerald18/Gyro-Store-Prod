-- ============================================================================
-- 0027_ofertas_por_color.sql — Ofertas por color con vencimiento
-- ============================================================================
-- ⚠️ Correrla en el SQL Editor de Supabase solo con el OK del dueño. Va
-- después de 0026, en una sola transacción y se puede correr más de una vez.
--
-- Una oferta es un precio fijo para todos los códigos de un color de un
-- producto, menor al precio normal, que vence en una fecha y hora de Nicaragua
-- (se guarda como timestamptz). Una por producto y color: poner otra la
-- reemplaza. Solo la usa la tienda; Ventas sigue con el precio normal.
-- `color` es '' en los productos sin colores (la oferta va al producto entero).
-- ============================================================================

begin;

create table if not exists public.product_offers (
  id               uuid primary key default gen_random_uuid(),
  catalog_item_id  uuid not null references public.catalog_items(id) on delete cascade,
  color            text not null default '',
  price            numeric(12,2) not null check (price > 0),
  ends_at          timestamptz not null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (catalog_item_id, color)
);

create index if not exists product_offers_ends_at_idx on public.product_offers (ends_at);

comment on table public.product_offers is 'Oferta de un color de un producto: precio fijo con vencimiento. Solo la tienda.';

-- Mismo trato que el resto de las tablas (01_schema.sql, sección 13).
alter table public.product_offers enable row level security;
revoke all on public.product_offers from anon, authenticated;
grant all on public.product_offers to service_role;

drop trigger if exists product_offers_set_updated_at on public.product_offers;
create trigger product_offers_set_updated_at
  before update on public.product_offers
  for each row execute function public.set_updated_at();

commit;

notify pgrst, 'reload schema';

-- Verificación: "Todo en orden" o qué falta.
with problemas as (
  select 'Falta la tabla' as problema, 'product_offers' as detalle
  where to_regclass('public.product_offers') is null
  union all
  select 'Falta RLS', 'product_offers'
  where exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'product_offers' and not rowsecurity
  )
)
select problema, detalle from problemas
union all
select 'Todo en orden', 'Tabla product_offers lista.'
where not exists (select 1 from problemas);
