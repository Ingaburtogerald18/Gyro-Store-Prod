-- ============================================================================
-- 0023_sales_returns_stock_movements.sql
-- ⚠️ Preparada, NO aplicada. Correrla en el SQL Editor de Supabase DESPUÉS de
-- la 0022 y cuando el dueño lo apruebe. Sin ella, el panel sigue funcionando;
-- solo quedan desactivados las devoluciones y los ajustes de stock.
--
-- 1) public_orders.sale_id: el pedido web que se convirtió en venta sabe cuál
--    es. Evita convertirlo dos veces y que vuelva a apartar stock.
-- 2) stock_movements: registro de cada entrada/salida de stock que NO es una
--    venta normal (devolución a bodega, merma por defecto, ajuste manual).
--    Hasta ahora esos cambios no dejaban rastro.
-- 3) sale_returns: cada devolución de una línea de venta (garantía o cambio),
--    con a dónde fue la unidad y cuánto se devolvió al cliente.
--
-- Solo agrega una columna y dos tablas. No borra ni cambia datos.
-- ============================================================================
begin;

alter table public.public_orders
  add column if not exists sale_id uuid references public.orders(id) on delete set null;

create unique index if not exists public_orders_sale_id_unique_idx
  on public.public_orders (sale_id) where sale_id is not null;

create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid references public.purchases(id) on delete cascade,
  code          text,
  -- return_to_stock: devolución que vuelve a bodega
  -- write_off:       merma (defecto de fábrica, rotura, pérdida)
  -- adjust_in / adjust_out: corrección manual de conteo
  kind          text not null check (kind in ('return_to_stock', 'write_off', 'adjust_in', 'adjust_out')),
  quantity      integer not null check (quantity > 0),
  -- Costo final por unidad del lote al momento del movimiento (C$): la merma
  -- es plata perdida y Reportería la puede sumar desde acá.
  unit_cost_cs  numeric(12,2),
  reason        text not null,
  order_id      uuid references public.orders(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists stock_movements_purchase_id_idx on public.stock_movements (purchase_id, created_at desc);
create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at desc);

create table if not exists public.sale_returns (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  sku            text not null,
  quantity       integer not null check (quantity > 0),
  destination    text not null check (destination in ('stock', 'merma')),
  refund_amount  numeric(12,2) not null default 0 check (refund_amount >= 0),
  comision_before numeric(12,2),
  comision_after  numeric(12,2),
  reason         text not null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists sale_returns_order_id_idx on public.sale_returns (order_id);

-- Mismo criterio que el resto de tablas internas: solo el servidor (service
-- role) las toca; nada de acceso directo desde el navegador.
alter table public.stock_movements enable row level security;
alter table public.sale_returns enable row level security;

notify pgrst, 'reload schema';

commit;

-- ── Verificación ──
-- select column_name from information_schema.columns
--   where table_name = 'public_orders' and column_name = 'sale_id';
-- select count(*) from public.stock_movements;
-- select count(*) from public.sale_returns;
--
-- ── Vuelta atrás ──
-- begin;
-- drop table if exists public.sale_returns;
-- drop table if exists public.stock_movements;
-- drop index if exists public.public_orders_sale_id_unique_idx;
-- alter table public.public_orders drop column if exists sale_id;
-- notify pgrst, 'reload schema';
-- commit;
