-- ============================================================================
-- 0025_ordenar_base.sql — Deja la base real igual a 01_schema.sql
-- ============================================================================
-- ⚠️ Correrla en el SQL Editor de Supabase solo con el OK del dueño.
--
-- Reemplaza a correr 0019…0024 una por una: completa lo que falte de cada una
-- y después ordena. Se puede correr más de una vez sin repetir nada. Va en una
-- sola transacción: si algo falla, la base queda exactamente como estaba.
--
-- No cambia ningún precio, costo, cantidad, venta ni pedido. Lo único que
-- toca en los datos es lo que ya hacían 0022 y 0024: vincular lotes a su
-- producto del catálogo y agrupar las compras viejas en órdenes provisionales.
--
--   1. Completa lo que falte de 0016, 0017, 0019, 0021, 0022, 0023 y 0024.
--   2. Archiva Caja y Bancos: accounts, account_movements y cash_closures
--      pasan al esquema `archivo` con sus datos. No se borra nada; para
--      volver: alter table archivo.accounts set schema public; (idem las otras).
--   3. Borra dos funciones de reportes que nadie llama (get_sales_trend,
--      get_expenses_by_pozo). Su código queda en historial/01_schema.sql.
--   4. Índices: agrega 7 para reportes y búsquedas y quita 4 repetidos.
--   5. Seguridad: la llave pública de Supabase (va en el navegador) deja de
--      poder llamar funciones y leer tablas. Hasta ahora podía pedir los
--      reportes de ventas con costos y clientes, porque esas funciones
--      saltean RLS. También se quita el permiso de subir/borrar archivos del
--      bucket public-assets a cualquier usuario con sesión (las fotos siguen
--      visibles; la app no sube nada ahí).
--   6. Al final muestra una verificación: "Todo en orden" o qué falta.
-- ============================================================================

begin;

-- ============================================================================
-- 1. Completar lo que falte de las migraciones anteriores
-- ============================================================================

-- ── 0015 / 0016: gastos en dólares y pozo salario ──
alter table public.expenses
  add column if not exists monto_usd numeric(12,2) default null,
  add column if not exists exchange_rate numeric(8,4) default null;
alter table public.expenses drop constraint if exists expenses_pozo_check;
alter table public.expenses add constraint expenses_pozo_check check (
  pozo in ('publicidad', 'mantenimiento', 'utiles', 'garantias', 'prestamos', 'suscripciones', 'servicios', 'salario')
);

-- ── 0017: pagos de préstamos ──
create table if not exists public.loan_payments (
  id             uuid primary key default gen_random_uuid(),
  monto_cs       numeric(12,2) not null check (monto_cs > 0),
  monto_usd      numeric(12,2) default null,
  exchange_rate  numeric(8,4) default null,
  fecha          date not null default current_date,
  nota           text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
-- La tabla puede venir de la primera versión de 0017, sin las columnas en dólares.
alter table public.loan_payments
  add column if not exists monto_usd numeric(12,2) default null,
  add column if not exists exchange_rate numeric(8,4) default null;
create index if not exists loan_payments_fecha_idx on public.loan_payments (fecha);

-- ── Columnas que se agregaron después del primer esquema ──
alter table public.categories add column if not exists icon varchar(16) not null default '';
alter table public.catalog_items add column if not exists spo_link text;
alter table public.invoices add column if not exists seller_uid uuid references public.profiles(id) on delete set null;
create index if not exists invoices_seller_uid_idx on public.invoices (seller_uid);
alter table public.analytics_events
  add column if not exists session_id text,
  add column if not exists path text;
alter table public.order_items add column if not exists variant_name text;

-- ── 0019 / 0021: pedido web guarda variante, nombre y foto; registro atómico ──
alter table public.public_order_items
  add column if not exists variant_name text,
  add column if not exists product_name text,
  add column if not exists product_image text;

create table if not exists public.public_order_attempts (
  idempotency_key  uuid primary key,
  request_hash     text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  public_order_id  uuid references public.public_orders(id) on delete set null,
  response         jsonb not null,
  created_at       timestamptz not null default now()
);

create or replace function public.recover_public_order_attempt(p_key uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_attempt public.public_order_attempts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public-order:' || p_key::text, 0));
  select * into v_attempt from public.public_order_attempts where idempotency_key = p_key;
  if not found then return null; end if;
  return jsonb_build_object('requestHash', v_attempt.request_hash, 'response', v_attempt.response);
end;
$$;

create or replace function public.register_public_order_attempt(
  p_key uuid, p_request_hash text, p_header jsonb, p_items jsonb, p_response jsonb
)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_attempt public.public_order_attempts%rowtype;
  v_id uuid := (p_header->>'id')::uuid;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_code text := nullif(p_header->>'discount_code', '');
  v_coupon public.discount_codes%rowtype;
  v_redeem record;
begin
  if p_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message = 'Intento inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public-order:' || p_key::text, 0));
  select * into v_attempt from public.public_order_attempts where idempotency_key = p_key;
  if found then
    if v_attempt.request_hash <> p_request_hash then
      raise sqlstate 'PT409' using message = 'Este intento corresponde a otro pedido.';
    end if;
    return jsonb_build_object('response', v_attempt.response, 'replayed', true);
  end if;
  if v_id is null or p_response->>'id' is distinct from v_id::text
     or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise sqlstate 'PT400' using message = 'Pedido inválido.';
  end if;
  select round(sum(quantity * precio_unit), 2) into v_subtotal
    from jsonb_to_recordset(p_items) as i(quantity integer, precio_unit numeric);
  if v_subtotal is null or v_subtotal < 0 then
    raise sqlstate 'PT400' using message = 'Importes inválidos.';
  end if;
  -- Verificar el cupón bajo bloqueo; el canje y el pedido se revierten juntos.
  if v_code is not null then
    select * into v_coupon from public.discount_codes where code = v_code for update;
    if not found then raise sqlstate 'PT400' using message = 'Código inválido.'; end if;
    v_discount := round(case when v_coupon.type::text = 'percent'
      then v_subtotal * v_coupon.value / 100
      else least(v_coupon.value, v_subtotal) end, 2);
    v_discount := greatest(0, least(v_discount, v_subtotal));
  end if;
  if (p_header->>'total')::numeric is distinct from v_subtotal - v_discount
     or (p_header->>'code_discount')::numeric is distinct from v_discount
     or (p_response->>'total')::numeric is distinct from v_subtotal - v_discount then
    raise sqlstate 'PT409' using message = 'Cambió el descuento del código. Revisalo antes de continuar.';
  end if;
  insert into public.public_orders (
    id, contact_id, phone, customer_name, delivery_method, address, location_url,
    note, total, status, discount_code, code_discount
  ) values (
    v_id, (p_header->>'contact_id')::uuid, p_header->>'phone', p_header->>'customer_name',
    p_header->>'delivery_method', p_header->>'address', p_header->>'location_url',
    p_header->>'note', v_subtotal - v_discount, 'new', v_code, v_discount
  );
  insert into public.public_order_items (
    public_order_id, sku, quantity, precio_unit, variant_name, product_name, product_image
  )
  select v_id, i.sku, i.quantity, i.precio_unit, i.variant_name, i.product_name, i.product_image
    from jsonb_to_recordset(p_items) as i(
      sku text, quantity integer, precio_unit numeric, variant_name text, product_name text, product_image text
    );
  if v_code is not null then
    select * into v_redeem from public.redeem_discount_code(
      v_code, 'checkout'::public.redemption_source, v_id, 'Pedido web',
      null::public.payment_method, v_discount, null::text
    );
    if not coalesce(v_redeem.ok, false) then
      raise sqlstate 'PT400' using message = coalesce(v_redeem.err, 'No se pudo canjear el código.');
    end if;
  end if;
  insert into public.public_order_attempts (idempotency_key, request_hash, public_order_id, response)
    values (p_key, p_request_hash, v_id, p_response);
  return jsonb_build_object('response', p_response, 'replayed', false);
end;
$$;

-- ── 0022: cada lote sabe a qué producto y variante pertenece ──
alter table public.purchases
  add column if not exists catalog_item_id uuid references public.catalog_items(id) on delete set null,
  add column if not exists variant_key text;
create index if not exists purchases_catalog_variant_idx on public.purchases (catalog_item_id, variant_key);

alter table public.stock_reservations
  add column if not exists public_order_id uuid references public.public_orders(id) on delete cascade;
create index if not exists stock_reservations_public_order_id_idx on public.stock_reservations (public_order_id);

-- Vincula los lotes que hoy están vinculados en el editor de Catálogo. Solo
-- códigos que aparecen en UNA variante, y solo lotes todavía sin vincular.
with links as (
  select ci.id as item_id, m.key as variant_key, c.code
  from public.catalog_items ci
  cross join lateral jsonb_each(coalesce(ci.variant_mappings, '{}'::jsonb)) as m(key, value)
  cross join lateral (
    select jsonb_array_elements_text(
      case when jsonb_typeof(m.value -> 'codes') = 'array' then m.value -> 'codes' else '[]'::jsonb end
    ) as code
    union
    select jsonb_array_elements_text(
      case when jsonb_typeof(m.value -> 'skus') = 'array' then m.value -> 'skus' else '[]'::jsonb end
    )
    union
    select m.value ->> 'sku' where coalesce(m.value ->> 'sku', '') <> ''
  ) c
  where jsonb_typeof(m.value) = 'object'
),
unique_links as (
  select code, (array_agg(item_id))[1] as item_id, (array_agg(variant_key))[1] as variant_key
  from links
  group by code
  having count(distinct (item_id, variant_key)) = 1
)
update public.purchases p
set catalog_item_id = u.item_id, variant_key = u.variant_key
from unique_links u
where p.code = u.code and p.catalog_item_id is null;

-- ── 0023: pedido web → venta, devoluciones y movimientos de stock ──
alter table public.public_orders
  add column if not exists sale_id uuid references public.orders(id) on delete set null;
create unique index if not exists public_orders_sale_id_unique_idx
  on public.public_orders (sale_id) where sale_id is not null;

create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid references public.purchases(id) on delete cascade,
  code          text,
  kind          text not null check (kind in ('return_to_stock', 'write_off', 'adjust_in', 'adjust_out')),
  quantity      integer not null check (quantity > 0),
  unit_cost_cs  numeric(12,2),
  reason        text not null,
  order_id      uuid references public.orders(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists stock_movements_purchase_id_idx on public.stock_movements (purchase_id, created_at desc);
create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at desc);

create table if not exists public.sale_returns (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  sku              text not null,
  quantity         integer not null check (quantity > 0),
  destination      text not null check (destination in ('stock', 'merma')),
  refund_amount    numeric(12,2) not null default 0 check (refund_amount >= 0),
  comision_before  numeric(12,2),
  comision_after   numeric(12,2),
  reason           text not null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists sale_returns_order_id_idx on public.sale_returns (order_id);

-- ── 0024: órdenes de Alibaba, proveedores y facturas ──
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text not null default '',
  store_url   text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists suppliers_name_unique_idx on public.suppliers (lower(name));

create table if not exists public.purchase_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null default '',
  file_url        text,
  total_usd       numeric(12,2) check (total_usd is null or total_usd >= 0),
  notes           text not null default '',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists purchase_invoices_number_unique_idx
  on public.purchase_invoices (lower(invoice_number)) where invoice_number <> '';

create table if not exists public.purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null,
  number_provisional  boolean not null default false,
  purchase_date       date not null,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  invoice_id          uuid references public.purchase_invoices(id) on delete set null,
  package_photos      jsonb not null default '[]'::jsonb,
  notes               text not null default '',
  legacy              boolean not null default false,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Si quedó aplicada la primera versión de 0024 (la factura adentro de la
-- orden), cada factura pasa a purchase_invoices y se quitan esas columnas.
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

create unique index if not exists purchase_orders_number_unique_idx
  on public.purchase_orders (lower(order_number)) where not number_provisional;
create index if not exists purchase_orders_purchase_date_idx on public.purchase_orders (purchase_date desc);
create index if not exists purchase_orders_invoice_id_idx on public.purchase_orders (invoice_id);

alter table public.purchases
  add column if not exists order_id uuid references public.purchase_orders(id) on delete restrict;
alter table public.purchases
  add column if not exists quantity_ordered integer check (quantity_ordered is null or quantity_ordered >= 0);
create index if not exists purchases_order_id_idx on public.purchases (order_id);

-- Compras sin orden → orden provisional por lote + fecha de compra (lo mismo
-- que mostraba la tabla de Compras). El panel las marca "Datos por completar".
insert into public.purchase_orders (order_number, number_provisional, purchase_date, legacy)
select distinct coalesce(nullif(upper(trim(p.lot)), ''), 'SIN ORDEN'), true, p.purchase_date, true
from public.purchases p
where p.order_id is null
  and not exists (
    select 1 from public.purchase_orders o
    where o.legacy
      and o.order_number = coalesce(nullif(upper(trim(p.lot)), ''), 'SIN ORDEN')
      and o.purchase_date = p.purchase_date
  );

update public.purchases p
set order_id = o.id
from public.purchase_orders o
where p.order_id is null
  and o.legacy
  and o.order_number = coalesce(nullif(upper(trim(p.lot)), ''), 'SIN ORDEN')
  and o.purchase_date = p.purchase_date;


-- ============================================================================
-- 2. Archivar Caja y Bancos
-- ============================================================================
create schema if not exists archivo;
comment on schema archivo is
  'Tablas que la app ya no usa, con sus datos. Para devolver una: alter table archivo.<tabla> set schema public;';
revoke all on schema archivo from public;

do $$
begin
  if to_regclass('public.cash_closures') is not null then
    alter table public.cash_closures set schema archivo;
  end if;
  if to_regclass('public.account_movements') is not null then
    alter table public.account_movements set schema archivo;
  end if;
  if to_regclass('public.accounts') is not null then
    alter table public.accounts set schema archivo;
  end if;
  if to_regtype('public.cuenta_tipo') is not null then
    alter type public.cuenta_tipo set schema archivo;
  end if;
  if to_regtype('public.movimiento_tipo') is not null then
    alter type public.movimiento_tipo set schema archivo;
  end if;
end $$;


-- ============================================================================
-- 3. Funciones que nadie llama
-- ============================================================================
drop function if exists public.get_sales_trend(timestamptz, timestamptz, text, uuid);
drop function if exists public.get_expenses_by_pozo(timestamptz, timestamptz);


-- ============================================================================
-- 4. Índices
-- ============================================================================
-- Nuevos: los reportes filtran ventas por estado + fecha; "Buscar mi pedido"
-- busca por teléfono; Ventas reserva stock por nombre de producto; el resto
-- son vínculos que no tenían índice.
create index if not exists orders_status_created_at_idx on public.orders (status, created_at desc);
create index if not exists orders_contact_id_idx on public.orders (contact_id);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create index if not exists public_orders_phone_idx on public.public_orders (phone);
create index if not exists public_orders_contact_id_idx on public.public_orders (contact_id);
create index if not exists purchases_product_name_idx on public.purchases (product_name);
create index if not exists catalog_items_template_id_idx on public.catalog_items (template_id);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx on public.analytics_events (type, created_at desc);
create index if not exists analytics_events_session_id_idx on public.analytics_events (session_id);

-- Repetidos: cada uno tiene otro índice que ya hace su trabajo. Solo se quita
-- si ese otro existe.
do $$
declare r record;
begin
  for r in select * from (values
    ('profiles_email_idx',        'profiles_email_key'),
    ('installments_order_id_idx', 'installments_order_id_unique'),
    ('analytics_events_type_idx', 'analytics_events_type_created_idx'),
    ('orders_status_idx',         'orders_status_created_at_idx')
  ) as v(repetido, cubre)
  loop
    if to_regclass('public.' || r.cubre) is not null then
      execute format('drop index if exists public.%I', r.repetido);
    end if;
  end loop;
end $$;


-- ============================================================================
-- 5. Seguridad
-- ============================================================================

-- La vista de exportación respeta RLS (corre con los permisos de quien consulta).
do $$
begin
  if to_regclass('public.sales_export_view') is not null then
    alter view public.sales_export_view set (security_invoker = on);
  end if;
end $$;

-- RLS deny-all en todas las tablas.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tableowner = current_user loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- updated_at automático en toda tabla que tenga la columna.
do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join pg_tables pt on pt.schemaname = c.table_schema and pt.tablename = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and pt.tableowner = current_user
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- search_path fijo en las funciones propias que no lo tienen (aviso del
-- Advisor de Supabase). Las que ya fijan uno se dejan como están.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proowner = current_user::regrole
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- Solo el servidor (service_role) usa tablas y funciones. La llave pública
-- viaja en el navegador para el login del personal; con ella, hasta hoy se
-- podían llamar los reportes de ventas.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Lo mismo para lo que se cree más adelante desde el SQL Editor.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- Bucket public-assets: las fotos siguen siendo públicas, pero ya no cualquier
-- usuario con sesión puede subir, cambiar o borrar archivos. La app no sube
-- nada ahí (las fotos nuevas van a R2). Si Supabase no deja tocar esas
-- políticas, se avisa y se sigue: la verificación de abajo lo muestra.
do $$
begin
  if to_regclass('storage.objects') is not null then
    begin
      drop policy if exists "Authenticated users can upload" on storage.objects;
      drop policy if exists "Authenticated users can update" on storage.objects;
      drop policy if exists "Authenticated users can delete" on storage.objects;
    exception when insufficient_privilege then
      raise notice 'No se pudieron quitar las políticas de escritura de public-assets: %', sqlerrm;
    end;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';


-- ============================================================================
-- 6. Verificación (solo lectura)
-- ============================================================================
-- Compara la base con 01_schema.sql. Una sola fila "Todo en orden" = listo.
with esperado(tabla, columnas) as (values
    ('profiles',                  'id email name avatar_url roles status deleted_at phone personal_email bank_account last_login created_at updated_at'),
    ('pending_role_grants',       'email name roles created_by created_at'),
    ('categories',                'id name slug icon created_at updated_at'),
    ('templates',                 'id name description category_id axes specs created_at updated_at'),
    ('catalog_items',             'id template_id name description category_id price base_price precio_sugerido precio_tentativo variant_mappings axis_options images images_by_color published is_promo sort_order spo_link created_at updated_at'),
    ('combos',                    'id name price items images published sort_order created_at updated_at'),
    ('contacts',                  'id phone name origin stage created_at updated_at'),
    ('contact_activities',        'id contact_id type note created_at'),
    ('follow_ups',                'id contact_id scheduled_date reason status created_by created_at updated_at'),
    ('suppliers',                 'id name contact store_url notes created_at updated_at'),
    ('purchase_invoices',         'id invoice_number file_url total_usd notes created_by created_at updated_at'),
    ('purchase_orders',           'id order_number number_provisional purchase_date supplier_id invoice_id package_photos notes legacy created_by created_at updated_at'),
    ('purchases',                 'id code order_id lot status purchase_date arrival_date product_name category catalog_item_id variant_key quantity_ordered quantity quantity_sold quantity_reserved costo_china_usd impuesto_unit_usd envio_unit_usd exchange_rate costo_real_usd costo_real_cs costo_f_u coste_final suggested_price created_at updated_at'),
    ('orders',                    'id status sale_origin seller_uid seller_email week_of contact_id phone total created_at updated_at'),
    ('order_items',               'id order_id sku quantity precio_unit variant_name coste_final_snap utilidad_bruta salary utilidad_neta comision ganancia_tienda pozos created_at'),
    ('invoices',                  'id sale_id invoice_number invoice_code status seller_uid method customer_name phone subtotal discount discount_code delivery_fee delivery_name total voided_at voided_by void_reason created_at updated_at'),
    ('invoice_items',             'id invoice_id sku quantity unit_price line_total created_at'),
    ('installments',              'id order_id total num_cuotas first_due status created_at updated_at'),
    ('payments',                  'id installment_id amount method paid_at note created_at'),
    ('commission_payments',       'id seller_uid seller_email seller_name order_ids gross_comision saldo_aplicado total_comision is_settlement payment_method receipt_url no_receipt_comment created_by created_at'),
    ('commission_adjustments',    'id seller_uid order_id amount reason seller_email seller_name comision_vieja comision_nueva settled settled_payment_id settled_at created_by created_at'),
    ('sale_returns',              'id order_id sku quantity destination refund_amount comision_before comision_after reason created_by created_at'),
    ('spo_outbox',                'id order_id status attempts last_error comprobante_url created_at synced_at'),
    ('public_orders',             'id contact_id phone customer_name total status delivery_method address location_url note discount_code code_discount sale_id created_at'),
    ('public_order_items',        'id public_order_id sku quantity precio_unit variant_name product_name product_image created_at'),
    ('public_order_attempts',     'idempotency_key request_hash public_order_id response created_at'),
    ('stock_reservations',        'id order_id public_order_id purchase_id code quantity unit_final_usd status created_at'),
    ('stock_movements',           'id purchase_id code kind quantity unit_cost_cs reason order_id created_by created_at'),
    ('losses',                    'id category sku quantity costo_cs reason created_by created_at'),
    ('discount_codes',            'code type value max_uses used_count active expires_at note created_by created_at'),
    ('discount_code_redemptions', 'id code source reference_id reference_label method amount redeemed_by redeemed_at'),
    ('expenses',                  'id pozo monto_cs monto_usd exchange_rate category description created_by created_at'),
    ('loan_payments',             'id monto_cs monto_usd exchange_rate fecha nota created_by created_at'),
    ('app_config',                'key value updated_at'),
    ('audit_logs',                'id entity entity_id action reason author_uid before after created_at'),
    ('analytics_events',          'id type session_id path payload created_at')
),
columnas_esperadas as (
  select tabla, unnest(string_to_array(columnas, ' ')) as columna from esperado
),
indices_esperados as (
  select unnest(string_to_array(regexp_replace('
    analytics_events_created_at_idx analytics_events_pkey analytics_events_session_id_idx
    analytics_events_type_created_idx app_config_pkey audit_logs_entity_id_idx
    audit_logs_pkey catalog_items_category_id_idx catalog_items_pkey
    catalog_items_published_sort_order_idx catalog_items_template_id_idx categories_pkey
    categories_slug_key combos_pkey commission_adjustments_order_id_idx
    commission_adjustments_pending_idx commission_adjustments_pkey
    commission_adjustments_seller_uid_idx commission_payments_pkey
    commission_payments_seller_email_idx contact_activities_contact_id_idx
    contact_activities_pkey contacts_phone_key contacts_pkey contacts_stage_idx
    discount_code_redemptions_code_idx discount_code_redemptions_pkey
    discount_code_redemptions_redeemed_at_idx discount_codes_created_at_idx
    discount_codes_pkey expenses_created_at_idx expenses_pkey follow_ups_contact_id_idx
    follow_ups_pkey follow_ups_status_idx installments_order_id_unique installments_pkey
    invoice_items_invoice_id_idx invoice_items_pkey invoices_created_at_idx
    invoices_invoice_code_idx invoices_invoice_number_unique invoices_pkey
    invoices_sale_id_unique_idx invoices_seller_uid_idx invoices_status_number_idx
    loan_payments_fecha_idx loan_payments_pkey losses_pkey losses_sku_idx
    order_items_order_id_idx order_items_pkey orders_contact_id_idx orders_pkey
    orders_seller_uid_week_of_idx orders_status_created_at_idx payments_installment_id_idx
    payments_pkey pending_role_grants_pkey profiles_email_key profiles_pkey
    public_order_attempts_pkey public_order_items_pkey
    public_order_items_public_order_id_idx public_orders_contact_id_idx
    public_orders_created_at_idx public_orders_phone_idx public_orders_pkey
    public_orders_sale_id_unique_idx purchase_invoices_number_unique_idx
    purchase_invoices_pkey purchase_orders_invoice_id_idx
    purchase_orders_number_unique_idx purchase_orders_pkey
    purchase_orders_purchase_date_idx purchases_catalog_variant_idx purchases_code_key
    purchases_order_id_idx purchases_pkey purchases_product_name_idx
    purchases_purchase_date_idx purchases_status_idx sale_returns_order_id_idx
    sale_returns_pkey spo_outbox_order_id_key spo_outbox_pending_idx spo_outbox_pkey
    stock_movements_created_at_idx stock_movements_pkey stock_movements_purchase_id_idx
    stock_reservations_order_id_idx stock_reservations_pkey
    stock_reservations_public_order_id_idx stock_reservations_purchase_id_idx
    suppliers_name_unique_idx suppliers_pkey templates_category_id_idx templates_pkey
  ', '\s+', ' ', 'g'), ' ')) as indice
),
funciones_esperadas as (
  select unnest(string_to_array('get_delivery_invoices get_delivery_summary get_financial_kpis get_sales_breakdown get_sales_ledger get_seller_performance get_top_products recover_public_order_attempt redeem_discount_code register_public_order_attempt set_updated_at', ' ')) as funcion
),
problemas as (
  select 'Falta la tabla' as problema, tabla as detalle
  from esperado where to_regclass('public.' || tabla) is null
  union all
  select 'Falta la columna', e.tabla || '.' || e.columna
  from columnas_esperadas e
  where to_regclass('public.' || e.tabla) is not null
    and not exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = e.tabla and c.column_name = e.columna)
  union all
  select 'Falta el índice', indice
  from indices_esperados where indice <> '' and to_regclass('public.' || indice) is null
  union all
  select 'Falta la función', funcion
  from funciones_esperadas f
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = f.funcion)
  union all
  select 'Sobra la tabla (revisar)', tablename
  from pg_tables where schemaname = 'public' and tablename not in (select tabla from esperado)
  union all
  select 'Sobra la columna (revisar)', c.table_name || '.' || c.column_name
  from information_schema.columns c
  join esperado e on e.tabla = c.table_name
  where c.table_schema = 'public'
    and not exists (select 1 from columnas_esperadas x where x.tabla = c.table_name and x.columna = c.column_name)
  union all
  select 'Sobra el índice (revisar)', indexname
  from pg_indexes where schemaname = 'public' and indexname not in (select indice from indices_esperados)
  union all
  select 'Sobra la función (revisar)', p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname not in (select funcion from funciones_esperadas)
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    -- rls_auto_enable la crea Supabase al activar "RLS automático en tablas
    -- nuevas": activa RLS en cada tabla que se crea. Va en la misma línea que
    -- este esquema, así que se deja.
    and p.proname <> 'rls_auto_enable'
  union all
  select 'Tabla sin RLS', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all
  select 'Función abierta a la llave pública', p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  union all
  select 'Tabla abierta a la llave pública', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v') and has_table_privilege('anon', c.oid, 'SELECT')
  union all
  select 'Escritura abierta en public-assets', policyname
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and coalesce(qual, '') || coalesce(with_check, '') like '%public-assets%'
)
select problema, detalle from problemas
union all
select 'Todo en orden', 'La base quedó igual a 01_schema.sql.'
where not exists (select 1 from problemas)
order by 1, 2;
