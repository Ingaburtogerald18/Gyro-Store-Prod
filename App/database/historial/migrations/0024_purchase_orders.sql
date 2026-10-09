-- ============================================================================
-- 0024_purchase_orders.sql
-- ⚠️ Preparada, NO aplicada. Correrla en el SQL Editor de Supabase DESPUÉS de
-- la 0022 y la 0023, y solo cuando el dueño lo apruebe.
--
-- Las compras pasan a agruparse por ORDEN DE ALIBABA (antes: "lote", un texto
-- libre como LT1). Cada orden guarda su número, el proveedor, la factura y las
-- fotos del empaque (las pide el agente en Nicaragua para reconocer los bultos).
-- Cada línea de la orden sigue siendo una fila de `purchases` (una variante).
--
-- 1) suppliers: proveedores reutilizables (nombre, contacto, tienda).
-- 2) purchase_invoices: la factura (archivo y total). Vive aparte porque
--    Alibaba puede partir un mismo pago en varias órdenes con UNA sola factura:
--    cada orden apunta a su factura y el total se compara contra la suma de
--    todas las órdenes que cubre.
-- 3) purchase_orders: la orden con su número, proveedor, factura y fotos.
-- 4) purchases.order_id: a qué orden pertenece cada línea.
--    purchases.quantity_ordered: lo pedido, cuando llegó otra cantidad.
-- 5) Las compras que ya existen se agrupan en órdenes con el nombre del lote
--    como número PROVISIONAL (`number_provisional`). El panel las muestra con
--    "Datos por completar" hasta que se carguen número, proveedor, factura y
--    fotos. No se cambia ningún precio, costo, cantidad ni código.
-- ============================================================================
begin;

create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text not null default '',
  store_url   text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Un proveedor por nombre (sin distinguir mayúsculas): el formulario reutiliza
-- el existente en vez de duplicarlo.
create unique index if not exists suppliers_name_unique_idx on public.suppliers (lower(name));

create table if not exists public.purchase_invoices (
  id              uuid primary key default gen_random_uuid(),
  -- Número de la factura, si trae (vacío = sin número).
  invoice_number  text not null default '',
  file_url        text,
  total_usd       numeric(12,2) check (total_usd is null or total_usd >= 0),
  notes           text not null default '',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Una factura con número no se carga dos veces: se elige la que ya está.
create unique index if not exists purchase_invoices_number_unique_idx
  on public.purchase_invoices (lower(invoice_number)) where invoice_number <> '';

create table if not exists public.purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null,
  -- true = número heredado del "lote" viejo, todavía sin el número real.
  number_provisional  boolean not null default false,
  purchase_date       date not null,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  -- Varias órdenes pueden compartir la misma factura.
  invoice_id          uuid references public.purchase_invoices(id) on delete set null,
  package_photos      jsonb not null default '[]'::jsonb,
  notes               text not null default '',
  -- true = creada por esta migración a partir de compras que ya existían.
  legacy              boolean not null default false,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Si ya se había corrido la versión anterior de esta migración, la tabla
-- existe con la factura adentro (invoice_url / invoice_total_usd) y el
-- `create table if not exists` de arriba no la toca: se agrega invoice_id y
-- cada factura que hubiera se pasa a purchase_invoices. En una base sin la
-- versión anterior esto no hace nada.
alter table public.purchase_orders
  add column if not exists invoice_id uuid references public.purchase_invoices(id) on delete set null;

do $$
declare
  r record;
  new_id uuid;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchase_orders' and column_name = 'invoice_url'
  ) then
    for r in execute
      'select id, invoice_url, invoice_total_usd, created_by from public.purchase_orders
        where invoice_id is null and (invoice_url is not null or invoice_total_usd is not null)'
    loop
      insert into public.purchase_invoices (file_url, total_usd, created_by)
      values (r.invoice_url, r.invoice_total_usd, r.created_by)
      returning id into new_id;
      update public.purchase_orders set invoice_id = new_id where id = r.id;
    end loop;
    alter table public.purchase_orders drop column if exists invoice_url;
    alter table public.purchase_orders drop column if exists invoice_total_usd;
  end if;
end $$;

-- Una orden de Alibaba no se registra dos veces. Los números provisionales
-- quedan fuera: dos lotes viejos pueden llamarse igual en fechas distintas.
create unique index if not exists purchase_orders_number_unique_idx
  on public.purchase_orders (lower(order_number)) where not number_provisional;
create index if not exists purchase_orders_purchase_date_idx on public.purchase_orders (purchase_date desc);
create index if not exists purchase_orders_invoice_id_idx on public.purchase_orders (invoice_id);

alter table public.purchases
  add column if not exists order_id uuid references public.purchase_orders(id) on delete restrict;
alter table public.purchases
  add column if not exists quantity_ordered integer check (quantity_ordered is null or quantity_ordered >= 0);

create index if not exists purchases_order_id_idx on public.purchases (order_id);

-- updated_at automático, igual que el resto de tablas (función de 01_schema).
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists purchase_invoices_set_updated_at on public.purchase_invoices;
create trigger purchase_invoices_set_updated_at before update on public.purchase_invoices
  for each row execute function public.set_updated_at();
drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();

-- ── Compras existentes → órdenes provisionales ──
-- Mismo agrupamiento que mostraba la tabla de Compras: lote + fecha de compra.
insert into public.purchase_orders (order_number, number_provisional, purchase_date, legacy)
select distinct coalesce(nullif(upper(trim(p.lot)), ''), 'SIN ORDEN'), true, p.purchase_date, true
from public.purchases p
where p.order_id is null;

update public.purchases p
set order_id = o.id
from public.purchase_orders o
where p.order_id is null
  and o.legacy
  and o.order_number = coalesce(nullif(upper(trim(p.lot)), ''), 'SIN ORDEN')
  and o.purchase_date = p.purchase_date;

-- Solo el servidor (service role) toca estas tablas.
alter table public.suppliers enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_orders enable row level security;

notify pgrst, 'reload schema';

commit;

-- ── Verificación ──
-- select count(*) as sin_orden from public.purchases where order_id is null;   -- debe dar 0
-- select order_number, purchase_date, count(p.id) as lineas
--   from public.purchase_orders o left join public.purchases p on p.order_id = o.id
--   group by o.id order by o.purchase_date desc;
--
-- ── Vuelta atrás ──
-- begin;
-- alter table public.purchases drop column if exists quantity_ordered;
-- alter table public.purchases drop column if exists order_id;
-- drop table if exists public.purchase_orders;
-- drop table if exists public.purchase_invoices;
-- drop table if exists public.suppliers;
-- notify pgrst, 'reload schema';
-- commit;
