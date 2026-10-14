-- ============================================================================
-- 01_schema.sql — Esquema completo de Gyro Store (Supabase / Postgres)
-- ============================================================================
-- Estado FINAL de la base, ordenado por módulo y con cada tabla completa en un
-- solo `create table`. Reemplaza al esquema anterior (baseline + 0004…0014
-- concatenados) y a las migraciones 0015…0024: todo eso quedó en historial/
-- como registro de cómo se llegó acá.
--
-- ⚠️  SOLO PARA BASES NUEVAS. Los `create table` son pelados a propósito: si
--     algo ya existe, falla de entrada en vez de mezclar estados. La base de
--     producción NO se recrea con este archivo; llega a este mismo estado con
--     migrations/0025_ordenar_base.sql.
--
-- Orden de aplicación: 01_schema.sql → 02_seed.sql.
--
-- Módulos:
--    0. Utilidades      set_updated_at
--    1. Personal        profiles, pending_role_grants
--    2. Catálogo        categories, templates, catalog_items, combos,
--                       product_offers
--    3. Clientes        contacts, contact_activities, follow_ups, stock_notices
--    4. Compras         suppliers, purchase_invoices, purchase_orders, purchases
--    5. Ventas          orders, order_items, invoices, invoice_items,
--                       installments, payments, commission_payments,
--                       commission_adjustments, sale_returns, spo_outbox
--    6. Tienda web      public_orders, public_order_items, public_order_attempts,
--                       store_draft, store_versions
--    7. Stock           stock_reservations, stock_movements, losses
--    8. Descuentos      discount_codes, discount_code_redemptions
--    9. Finanzas        expenses, loan_payments, app_config
--   10. Sistema         audit_logs, analytics_events
--   11. Reportes        RPCs de reportería y vista de exportación
--   12. Tienda          canje de códigos y registro atómico de pedidos web
--   13. Seguridad       RLS, updated_at automático y permisos
--
-- Seguridad: RLS deny-all en todas las tablas, sin políticas. Solo el servidor
-- (service_role) lee y escribe. La llave pública (anon), que viaja en el
-- navegador para el login del personal, no puede leer tablas ni llamar
-- funciones. Ver sección 13.
-- ============================================================================


-- ============================================================================
-- 0. Utilidades
-- ============================================================================

-- Mantiene `updated_at` en cada update. La sección 13 la engancha a toda tabla
-- que tenga esa columna.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================================
-- 1. Personal
-- ============================================================================

-- global_admin = acceso total. cashier y logistics_* ya no se usan en el
-- panel, pero quedan en el tipo: quitar un valor de un enum en Postgres obliga
-- a recrearlo, y no hay ganancia.
create type app_role as enum (
  'global_admin',
  'admin',
  'seller',
  'cashier',
  'logistics_admin',
  'logistics_customer'
);

-- Perfil del personal, 1:1 con auth.users (Supabase Auth).
-- `bank_account` es jsonb porque son tres datos: { bank, currency, number }.
-- Es dato sensible: solo sale por endpoints de admin.
create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null unique,
  name            text,
  avatar_url      text,
  roles           app_role[] not null default '{}',
  status          text not null default 'active',   -- 'active' | 'disabled'
  deleted_at      timestamptz,                       -- papelera de 30 días
  phone           text,
  personal_email  text,
  bank_account    jsonb,
  last_login      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Roles reservados para alguien que todavía no inició sesión. El login real es
-- por Microsoft, que crea su propia identidad en Auth: por eso el rol se guarda
-- por correo (sin FK a auth.users) y el middleware lo copia al perfil y borra
-- la fila la primera vez que la persona entra.
create table pending_role_grants (
  email       text primary key,
  name        text,                                   -- solo para reconocerlo en Personal
  roles       app_role[] not null default '{}',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- 2. Catálogo
-- ============================================================================
-- Este módulo cambia en la próxima fase (variantes con id propio). Por ahora se
-- conserva tal cual, incluidas las columnas viejas de precio que el código
-- todavía lee.

create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  icon        varchar(16) not null default '',        -- emoji que muestra la tienda
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Una plantilla por modelo (KZ EDX Pro): nombre, descripción y categoría son
-- los que muestra la tienda. `axes` es un ARRAY ORDENADO [{ key, label,
-- options[], isColor }]: el orden arma el nombre de la combinación ("Negro /
-- Con micrófono"), que es la llave de `catalog_items.variant_mappings`.
create table templates (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  description    text,                       -- la muestra la tienda
  internal_note  text not null default '',   -- no se publica
  category_id    uuid references categories(id) on delete set null,
  axes           jsonb default '[]',
  specs          jsonb default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index templates_category_id_idx on templates (category_id);

create or replace function public.template_model_key(model_name text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(model_name, ''), '[[:space:]_–—-]+', '', 'g')), '');
$$;

create index templates_model_key_idx on templates (public.template_model_key(name));

create or replace function public.check_template_model_name()
returns trigger language plpgsql set search_path = public as $$
declare
  model_key text := public.template_model_key(new.name);
begin
  if model_key is null then return new; end if;
  if tg_op = 'UPDATE' then
    if model_key is not distinct from public.template_model_key(old.name) then return new; end if;
  end if;
  -- Serializa las escrituras del mismo modelo, incluso entre administradores.
  perform pg_advisory_xact_lock(hashtextextended('templates:' || model_key, 0));
  if exists (
    select 1 from public.templates
    where public.template_model_key(name) = model_key and id <> new.id
  ) then
    raise exception using errcode = '23505',
      message = 'Ya existe una plantilla para este modelo.',
      constraint = 'templates_model_name_unique';
  end if;
  return new;
end;
$$;

create trigger templates_model_name_unique
  before insert or update of name on templates
  for each row execute function public.check_template_model_name();

-- El producto que se vende. `name`/`description` son propios del producto,
-- independientes del molde. `spo_link`: carpeta de SharePoint con fotos y
-- videos, solo para el personal (no sale en la tienda).
create table catalog_items (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid references templates(id) on delete set null,
  name              text,
  description       text,
  category_id       uuid references categories(id) on delete set null,
  price             numeric(12,2),
  base_price        numeric(12,2),
  precio_sugerido   numeric(12,2),
  precio_tentativo  numeric(12,2),
  variant_mappings  jsonb default '{}',
  axis_options      jsonb default '{}',
  images            jsonb default '[]',
  images_by_color   jsonb default '{}',
  published         boolean not null default false,
  is_promo          boolean not null default false,
  sort_order        integer not null default 0,
  spo_link          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index catalog_items_published_sort_order_idx on catalog_items (published, sort_order);
create index catalog_items_category_id_idx on catalog_items (category_id);
create index catalog_items_template_id_idx on catalog_items (template_id);

create table combos (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  price       numeric(12,2),
  items       jsonb default '[]',
  images      jsonb default '[]',
  published   boolean not null default false,
  sort_order  integer default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Oferta de un color de un producto (todos sus códigos): precio fijo menor al
-- normal, con vencimiento en hora de Nicaragua. Solo la usa la tienda. `color`
-- es '' en los productos sin colores. Una por producto y color.
create table product_offers (
  id               uuid primary key default gen_random_uuid(),
  catalog_item_id  uuid not null references catalog_items(id) on delete cascade,
  color            text not null default '',
  price            numeric(12,2) not null check (price > 0),
  ends_at          timestamptz not null,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (catalog_item_id, color)
);

create index product_offers_ends_at_idx on product_offers (ends_at);


-- ============================================================================
-- 3. Clientes
-- ============================================================================

-- 'store' = pidió «Avisame cuando haya» en la tienda.
create type contact_origin as enum ('fb_ads', 'organic', 'whatsapp_link', 'referral', 'store', 'other');
create type follow_up_status as enum ('pending', 'completed', 'cancelled');

-- `phone` es la identidad del cliente (es por donde se cierra la venta).
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique,
  name        text,
  origin      contact_origin not null default 'other',
  stage       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contacts_stage_idx on contacts (stage);

create table contact_activities (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  type        text,
  note        text,
  created_at  timestamptz not null default now()
);

create index contact_activities_contact_id_idx on contact_activities (contact_id);

create table follow_ups (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references contacts(id) on delete cascade,
  scheduled_date  date,
  reason          text,
  status          follow_up_status not null default 'pending',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index follow_ups_contact_id_idx on follow_ups (contact_id);
create index follow_ups_status_idx on follow_ups (status);

-- «Avisame cuando haya»: liga el seguimiento «Avisar cuando llegue» a la
-- variante que el cliente espera. Cuando tiene stock, el CRM lo marca «Ya
-- llegó, avisar». Un aviso abierto (seguimiento pendiente) por teléfono y variante.
create table stock_notices (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references contacts(id) on delete cascade,
  follow_up_id     uuid not null references follow_ups(id) on delete cascade,
  catalog_item_id  uuid not null references catalog_items(id) on delete cascade,
  variant_name     text not null default '',
  label            text not null,
  created_at       timestamptz not null default now()
);

create index stock_notices_contact_id_idx on stock_notices (contact_id);
create index stock_notices_follow_up_id_idx on stock_notices (follow_up_id);
create index stock_notices_catalog_item_id_idx on stock_notices (catalog_item_id);


-- ============================================================================
-- 4. Compras
-- ============================================================================
-- Una compra es una ORDEN DE ALIBABA con su número, proveedor, factura y fotos
-- del empaque. Cada línea de la orden es una fila de `purchases` (una
-- variante), que además es el lote del FIFO.

create type purchase_status as enum ('china', 'pending', 'received');

-- Proveedor reutilizable: uno por nombre, sin distinguir mayúsculas.
create table suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text not null default '',
  store_url   text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index suppliers_name_unique_idx on suppliers (lower(name));

-- La factura vive aparte porque Alibaba puede partir un pago en varias órdenes
-- con UNA sola factura: cada orden apunta a la suya y el total se compara
-- contra la suma de todas las órdenes que cubre.
create table purchase_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null default '',          -- vacío = sin número
  file_url        text,
  total_usd       numeric(12,2) check (total_usd is null or total_usd >= 0),
  notes           text not null default '',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Una factura con número no se carga dos veces.
create unique index purchase_invoices_number_unique_idx
  on purchase_invoices (lower(invoice_number)) where invoice_number <> '';

create table purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null,
  -- true = número heredado del "lote" viejo (LT1…), falta el número real.
  number_provisional  boolean not null default false,
  purchase_date       date not null,
  supplier_id         uuid references suppliers(id) on delete set null,
  invoice_id          uuid references purchase_invoices(id) on delete set null,
  package_photos      jsonb not null default '[]'::jsonb,
  notes               text not null default '',
  -- true = creada al pasar los lotes viejos a órdenes.
  legacy              boolean not null default false,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Una orden de Alibaba no se registra dos veces. Los números provisionales
-- quedan fuera: dos lotes viejos pueden llamarse igual en fechas distintas.
create unique index purchase_orders_number_unique_idx
  on purchase_orders (lower(order_number)) where not number_provisional;
create index purchase_orders_purchase_date_idx on purchase_orders (purchase_date desc);
create index purchase_orders_invoice_id_idx on purchase_orders (invoice_id);

-- Línea de compra = lote del FIFO. `quantity_sold` y `quantity_reserved` se
-- mueven contra `quantity`; el check garantiza que nunca se comprometa más
-- stock del que existe, aunque dos requests pasen la validación a la vez.
-- `catalog_item_id` + `variant_key` dicen qué variante del catálogo es
-- (`variant_key` = llave de variant_mappings, '' si no tiene variantes).
create table purchases (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,           -- GS-IN-…
  order_id            uuid references purchase_orders(id) on delete restrict,
  lot                 text,
  status              purchase_status not null default 'china',
  purchase_date       date not null,
  arrival_date        date,
  product_name        text not null default 'No Name',
  category            text,
  catalog_item_id     uuid references catalog_items(id) on delete set null,
  variant_key         text,
  quantity_ordered    integer check (quantity_ordered is null or quantity_ordered >= 0),
  quantity            integer not null check (quantity >= 0),
  quantity_sold       integer not null default 0 check (quantity_sold >= 0),
  quantity_reserved   integer not null default 0 check (quantity_reserved >= 0),
  costo_china_usd     numeric(12,4),
  impuesto_unit_usd   numeric(12,4) default 0,
  envio_unit_usd      numeric(12,4) default 0,
  exchange_rate       numeric(8,4),
  costo_real_usd      numeric(12,4),
  costo_real_cs       numeric(12,2),
  costo_f_u           numeric(12,2),
  coste_final         numeric(12,2),
  suggested_price     numeric(12,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint purchases_stock_check check (quantity_sold + quantity_reserved <= quantity)
);

create index purchases_order_id_idx on purchases (order_id);
create index purchases_purchase_date_idx on purchases (purchase_date);
create index purchases_status_idx on purchases (status);
create index purchases_catalog_variant_idx on purchases (catalog_item_id, variant_key);
-- Ventas reserva por nombre de producto (FIFO).
create index purchases_product_name_idx on purchases (product_name);


-- ============================================================================
-- 5. Ventas
-- ============================================================================

create type order_status as enum ('pending_approval', 'approved', 'paid', 'rejected');
-- 'migrated' = venta del sistema viejo. Hay ventas cerradas que lo usan.
create type sale_origin as enum ('native', 'migrated');
-- Método de pago de la factura y de las cuotas. 'tarjeta' ya no se ofrece,
-- pero hay facturas viejas con ese valor.
create type payment_method as enum ('efectivo', 'transferencia', 'tarjeta');
-- 'void' = anulada. Una factura no se borra: dejaría un hueco en el correlativo.
create type invoice_status as enum ('unlinked', 'linked', 'void');

-- Correlativo de facturas (GS-PR-n). `nextval` es atómico y nunca se reinicia:
-- un número descartado queda quemado, como debe ser con algo ya impreso.
create sequence invoice_number_seq;

create table orders (
  id                   uuid primary key default gen_random_uuid(),
  status               order_status not null default 'pending_approval',
  sale_origin          sale_origin not null default 'native',
  seller_uid           uuid references profiles(id) on delete set null,
  seller_email         text,
  week_of              text,
  contact_id           uuid references contacts(id) on delete set null,
  phone                text,
  total                numeric(12,2),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index orders_seller_uid_week_of_idx on orders (seller_uid, week_of);
-- Todos los reportes filtran por estado (approved/paid) y rango de fechas.
create index orders_status_created_at_idx on orders (status, created_at desc);
create index orders_contact_id_idx on orders (contact_id);

-- Las columnas financieras son un SNAPSHOT que se congela al APROBAR: si
-- después cambia la tasa o la escala de comisiones, una venta aprobada no se
-- recalcula sola.
create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  sku               text,
  quantity          integer not null check (quantity > 0),
  precio_unit       numeric(12,2),
  variant_name      text,                             -- "Negro / Con micrófono"
  coste_final_snap  numeric(12,2),
  utilidad_bruta    numeric(12,2),
  salary            numeric(12,2),
  utilidad_neta     numeric(12,2),
  comision          numeric(12,2),
  ganancia_tienda   numeric(12,2),
  pozos             jsonb,
  created_at        timestamptz not null default now()
);

create index order_items_order_id_idx on order_items (order_id);

-- Factura POS. Se emite ANTES de registrar la venta y después se vincula.
-- El correlativo es requisito legal: el unique protege el número y el índice
-- único parcial sobre `sale_id` impide dos facturas para la misma venta.
-- `invoice_code` es generada; el `::text` es obligatorio para que sea IMMUTABLE.
-- `seller_uid`: vendedor para quien se emitió (lo ve en "Mis facturas").
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid references orders(id) on delete set null,
  invoice_number  bigint default nextval('invoice_number_seq'),
  invoice_code    text generated always as ('GS-PR-' || invoice_number::text) stored,
  status          invoice_status not null default 'unlinked',
  seller_uid      uuid references profiles(id) on delete set null,
  method          payment_method,
  customer_name   text,
  phone           text,
  subtotal        numeric(12,2),
  discount        numeric(12,2) default 0,
  discount_code   text,
  delivery_fee    numeric(12,2) default 0,
  delivery_name   text,
  total           numeric(12,2),
  voided_at       timestamptz,
  voided_by       uuid references profiles(id) on delete set null,
  void_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint invoices_invoice_number_unique unique (invoice_number)
);

create index invoices_status_number_idx on invoices (status, invoice_number desc);
create index invoices_invoice_code_idx on invoices (invoice_code);
create unique index invoices_sale_id_unique_idx on invoices (sale_id) where sale_id is not null;
create index invoices_seller_uid_idx on invoices (seller_uid);
-- Los reportes de delivery filtran facturas por fecha.
create index invoices_created_at_idx on invoices (created_at desc);

create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  sku         text,
  quantity    int not null check (quantity > 0),
  unit_price  numeric(12,2),
  line_total  numeric(12,2),
  created_at  timestamptz not null default now()
);

create index invoice_items_invoice_id_idx on invoice_items (invoice_id);

-- Plan de cuotas de una venta. Uno por venta (el unique ya sirve de índice).
create table installments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  total       numeric(12,2),
  num_cuotas  integer,
  first_due   date,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint installments_order_id_unique unique (order_id)
);

-- Pago de una CUOTA de un cliente (no confundir con commission_payments).
create table payments (
  id              uuid primary key default gen_random_uuid(),
  installment_id  uuid not null references installments(id) on delete cascade,
  amount          numeric(12,2),
  method          payment_method,
  paid_at         timestamptz,
  note            text,
  created_at      timestamptz not null default now()
);

create index payments_installment_id_idx on payments (installment_id);

-- Pago de comisiones a un vendedor. INMUTABLE: si después cambia una venta ya
-- pagada, la diferencia va a commission_adjustments y se salda en el próximo
-- pago. El correo se guarda además del uid para que el historial siga diciendo
-- a quién se le pagó aunque se borre el perfil.
create table commission_payments (
  id                  uuid primary key default gen_random_uuid(),
  seller_uid          uuid references profiles(id) on delete set null,
  seller_email        text not null,
  seller_name         text,
  order_ids           uuid[] not null default '{}',   -- ventas cubiertas (el lote no cambia)
  gross_comision      numeric(12,2) not null default 0,
  saldo_aplicado      numeric(12,2) not null default 0,
  total_comision      numeric(12,2) not null default 0,
  is_settlement       boolean not null default false, -- liquidación de saldo sin ventas
  payment_method      text not null default 'efectivo',
  receipt_url         text,
  no_receipt_comment  text,                           -- por qué no hay comprobante
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint commission_payments_receipt_check
    check (receipt_url is not null or no_receipt_comment is not null)
);

create index commission_payments_seller_email_idx
  on commission_payments (seller_email, created_at desc);

-- Cuenta corriente con el vendedor: amount > 0 la tienda le debe, < 0 cobró de
-- más. `settled` evita saldar dos veces el mismo ajuste.
create table commission_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  seller_uid          uuid references profiles(id) on delete set null,
  order_id            uuid references orders(id) on delete cascade,
  amount              numeric(12,2),
  reason              text,
  seller_email        text,
  seller_name         text,
  comision_vieja      numeric(12,2),
  comision_nueva      numeric(12,2),
  settled             boolean not null default false,
  settled_payment_id  uuid references commission_payments(id) on delete set null,
  settled_at          timestamptz,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index commission_adjustments_seller_uid_idx on commission_adjustments (seller_uid);
create index commission_adjustments_order_id_idx on commission_adjustments (order_id);
create index commission_adjustments_pending_idx
  on commission_adjustments (seller_email) where settled = false;

-- Devolución de una línea de venta (garantía o cambio): a dónde fue la unidad
-- y cuánto se le devolvió al cliente.
create table sale_returns (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  sku              text not null,
  quantity         integer not null check (quantity > 0),
  destination      text not null check (destination in ('stock', 'merma')),
  refund_amount    numeric(12,2) not null default 0 check (refund_amount >= 0),
  comision_before  numeric(12,2),
  comision_after   numeric(12,2),
  reason           text not null,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index sale_returns_order_id_idx on sale_returns (order_id);

-- Cola de comprobantes PDF para SharePoint (patrón outbox): aprobar una venta
-- solo escribe acá y un proceso aparte sube el PDF. Si Microsoft falla, la fila
-- espera. `order_id` único = re-aprobar no encola dos veces.
create table spo_outbox (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references orders(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'synced', 'error')),
  attempts         int not null default 0,
  last_error       text,
  comprobante_url  text,
  created_at       timestamptz not null default now(),
  synced_at        timestamptz
);

create index spo_outbox_pending_idx on spo_outbox (created_at) where status = 'pending';


-- ============================================================================
-- 6. Tienda web
-- ============================================================================

-- Pedido del checkout público. Se cierra por WhatsApp, pero el panel guarda el
-- destino. `sale_id`: la venta en que se convirtió (evita convertirlo dos veces).
-- Entrega: 'managua', 'cargo_trans' o 'retiro'; 'envio' es de los pedidos anteriores a la 0032.
-- Pago del producto, pago del transporte y recepción son datos separados que registra el panel:
-- ninguno se deduce de otro ni del estado.
create table public_orders (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid references contacts(id) on delete set null,
  phone            text,
  customer_name    text,
  total            numeric(12,2),
  status           text not null default 'new',
  delivery_method  text constraint public_orders_delivery_method_check
                   check (delivery_method in ('retiro', 'envio', 'managua', 'cargo_trans')),
  address          text,
  location_url     text,
  note             text,
  discount_code    text,
  code_discount    numeric(12,2) default 0,
  sale_id          uuid references orders(id) on delete set null,
  shipping_quote     numeric(12,2) check (shipping_quote is null or shipping_quote >= 0),
  product_paid_date  date,
  shipping_paid_date date,
  carrier_reference  text,
  received_date      date,
  created_at       timestamptz not null default now()
);

create index public_orders_created_at_idx on public_orders (created_at desc);
create unique index public_orders_sale_id_unique_idx on public_orders (sale_id) where sale_id is not null;
-- "Buscar mi pedido" busca por teléfono.
create index public_orders_phone_idx on public_orders (phone);
create index public_orders_contact_id_idx on public_orders (contact_id);

-- `sku` = id del catalog_item (o `combo:<id>`). Nombre, foto y variante se
-- guardan como estaban al comprar: si el producto cambia, el pedido no.
create table public_order_items (
  id               uuid primary key default gen_random_uuid(),
  public_order_id  uuid not null references public_orders(id) on delete cascade,
  sku              text,
  quantity         integer not null check (quantity > 0),
  precio_unit      numeric(12,2),
  variant_name     text,
  product_name     text,
  product_image    text,
  created_at       timestamptz not null default now()
);

create index public_order_items_public_order_id_idx on public_order_items (public_order_id);

-- Registro de cada intento de checkout por su clave de idempotencia: un doble
-- clic o un reintento devuelve el mismo pedido en vez de crear otro.
create table public_order_attempts (
  idempotency_key  uuid primary key,
  request_hash     text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  public_order_id  uuid references public_orders(id) on delete set null,
  response         jsonb not null,
  created_at       timestamptz not null default now()
);

-- Borrador compartido del modo edición (portada y cambios de productos) y su
-- bloqueo: un admin a la vez. Una sola fila; el servidor libera el bloqueo a
-- los 15 minutos sin actividad o cuando el navegador deja de mandar el latido.
create table store_draft (
  id                 text primary key default 'tienda' check (id = 'tienda'),
  landing            jsonb,
  products           jsonb not null default '{}',
  changed_at         timestamptz,
  changed_by         uuid references profiles(id) on delete set null,
  lock_holder        uuid references profiles(id) on delete set null,
  lock_session       uuid,
  lock_acquired_at   timestamptz,
  lock_heartbeat_at  timestamptz,
  lock_activity_at   timestamptz,
  updated_at         timestamptz not null default now()
);

insert into store_draft (id) values ('tienda');

-- Cada «Publicar» del modo edición: portada y presentación de los productos
-- (fotos, «Mostrar en la tienda», orden), con quién, cuándo y qué cambió.
-- Precio, stock y datos de la plantilla no se guardan. El servidor guarda 5.
create table store_versions (
  id            uuid primary key default gen_random_uuid(),
  landing       jsonb not null,
  products      jsonb not null default '{}',
  summary       jsonb not null default '[]',
  published_by  uuid references profiles(id) on delete set null,
  published_at  timestamptz not null default now()
);

create index store_versions_published_at_idx on store_versions (published_at desc);


-- ============================================================================
-- 7. Stock
-- ============================================================================

-- Unidades apartadas de un lote, para una venta del panel (`order_id`) o para
-- un pedido web en preparación (`public_order_id`).
create table stock_reservations (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid references orders(id) on delete cascade,
  public_order_id  uuid references public_orders(id) on delete cascade,
  purchase_id      uuid not null references purchases(id) on delete cascade,
  code             text,
  quantity         integer not null check (quantity > 0),
  unit_final_usd   numeric(12,4),
  status           text not null default 'active',
  created_at       timestamptz not null default now()
);

create index stock_reservations_order_id_idx on stock_reservations (order_id);
create index stock_reservations_public_order_id_idx on stock_reservations (public_order_id);
create index stock_reservations_purchase_id_idx on stock_reservations (purchase_id);

-- Toda entrada o salida de stock que no es una venta normal:
--   return_to_stock  devolución que vuelve a bodega
--   write_off        merma (defecto, rotura, pérdida)
--   adjust_in/out    corrección manual de conteo
-- `unit_cost_cs`: costo por unidad al momento del movimiento (la merma es plata).
create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid references purchases(id) on delete cascade,
  code          text,
  kind          text not null check (kind in ('return_to_stock', 'write_off', 'adjust_in', 'adjust_out')),
  quantity      integer not null check (quantity > 0),
  unit_cost_cs  numeric(12,2),
  reason        text not null,
  order_id      uuid references orders(id) on delete set null,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index stock_movements_purchase_id_idx on stock_movements (purchase_id, created_at desc);
create index stock_movements_created_at_idx on stock_movements (created_at desc);

-- Mermas del sistema anterior (robo, daño, devolución, regalías). Reportería
-- todavía las lista; las nuevas van a stock_movements.
create type loss_category as enum ('robo', 'dano', 'devolucion', 'regalias');

create table losses (
  id          uuid primary key default gen_random_uuid(),
  category    loss_category,
  sku         text,
  quantity    integer,
  costo_cs    numeric(12,2),
  reason      text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index losses_sku_idx on losses (sku);


-- ============================================================================
-- 8. Descuentos
-- ============================================================================

create type discount_type as enum ('percent', 'fixed');
create type redemption_source as enum ('checkout', 'invoice', 'sale');

create sequence discount_code_seq;

-- El código es la llave (GS-DC-1, GS-DC-2…): correlativo y fácil de dictar por
-- teléfono. `max_uses = 0` = ilimitado.
create table discount_codes (
  code         text primary key default ('GS-DC-' || nextval('discount_code_seq')),
  type         discount_type not null,
  value        numeric(12,2) not null check (value > 0),
  max_uses     integer not null default 1 check (max_uses >= 0),
  used_count   integer not null default 0 check (used_count >= 0),
  active       boolean not null default true,
  expires_at   date,
  note         text default '',
  created_by   text default '',
  created_at   timestamptz not null default now()
);

create index discount_codes_created_at_idx on discount_codes (created_at desc);

-- Cada canje: dónde se aplicó, por cuánto y quién.
create table discount_code_redemptions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null references discount_codes(code) on delete cascade,
  source           redemption_source not null,
  reference_id     uuid,
  reference_label  text,
  method           payment_method,
  amount           numeric(12,2) not null default 0,
  redeemed_by      text,
  redeemed_at      timestamptz not null default now()
);

create index discount_code_redemptions_code_idx on discount_code_redemptions (code);
create index discount_code_redemptions_redeemed_at_idx on discount_code_redemptions (redeemed_at desc);


-- ============================================================================
-- 9. Finanzas
-- ============================================================================

-- Gastos por pozo. Los pozos son los de `app_config.pozos` más 'salario'.
-- Si se cargó en dólares, `monto_usd` y `exchange_rate` guardan el original.
create table expenses (
  id             uuid primary key default gen_random_uuid(),
  pozo           text not null check (pozo in ('publicidad', 'mantenimiento', 'utiles', 'garantias', 'prestamos', 'suscripciones', 'servicios', 'salario')),
  monto_cs       numeric(12,2) not null check (monto_cs > 0),
  monto_usd      numeric(12,2) default null,
  exchange_rate  numeric(8,4) default null,
  category       text,
  description    text,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index expenses_created_at_idx on expenses (created_at);

-- Pagos de préstamos del registro anterior. Los nuevos se cargan como gasto del
-- pozo Préstamos; Reportería todavía lee esta tabla.
create table loan_payments (
  id             uuid primary key default gen_random_uuid(),
  monto_cs       numeric(12,2) not null check (monto_cs > 0),
  monto_usd      numeric(12,2) default null,
  exchange_rate  numeric(8,4) default null,
  fecha          date not null default current_date,
  nota           text,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index loan_payments_fecha_idx on loan_payments (fecha);

-- Parámetros del negocio editables desde el panel (tasa, pozos, márgenes,
-- comisiones). Clave-valor para no tocar el esquema cada vez que cambia una
-- escala. Los valores iniciales están en 02_seed.sql.
create table app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);


-- ============================================================================
-- 10. Sistema
-- ============================================================================

-- Rastro de cambios sensibles con el estado antes y después.
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  entity      text,
  entity_id   uuid,
  action      text,
  reason      text,
  author_uid  uuid references profiles(id) on delete set null,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_id_idx on audit_logs (entity_id);

-- Analítica propia de la tienda. Un tipo fuera de la lista no entra.
create table analytics_events (
  id          uuid primary key default gen_random_uuid(),
  type        text,
  session_id  text,
  path        text,
  payload     jsonb default '{}',
  created_at  timestamptz not null default now(),
  constraint analytics_events_type_check
    check (type in ('page_view', 'product_view', 'search', 'checkout_start', 'order_created', 'add_to_cart', 'whatsapp_open'))
);

create index analytics_events_created_at_idx on analytics_events (created_at desc);
create index analytics_events_type_created_idx on analytics_events (type, created_at desc);
create index analytics_events_session_id_idx on analytics_events (session_id);


-- ============================================================================
-- 11. Reportes
-- ============================================================================
-- Viven en la base para no traer miles de líneas al servidor: Postgres
-- devuelve la fila ya sumada. Son `security definer` porque leen tablas con RLS
-- deny-all; por eso mismo solo el servidor puede llamarlas (sección 13).
--
-- "Venta" es siempre lo mismo: `orders` en ('approved','paid'), fechada por
-- `orders.created_at`.

-- KPIs del periodo y del periodo anterior de igual duración, en un solo escaneo.
create or replace function get_financial_kpis(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_seller_uid uuid default null
) returns table (
  total_ventas bigint,
  total_unidades bigint,
  total_vendido numeric,
  coste_total numeric,
  comision_total numeric,
  ganancia_tienda_total numeric,
  salary_acumulado numeric,
  pozos_recogidos jsonb,
  total_ventas_prev bigint,
  total_unidades_prev bigint,
  total_vendido_prev numeric,
  coste_total_prev numeric,
  comision_total_prev numeric,
  ganancia_tienda_total_prev numeric
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pozos_json jsonb;
  v_prev_start timestamptz;
  v_prev_end   timestamptz;
begin
  if p_start_date is not null and p_end_date is not null then
    v_prev_end   := p_start_date;
    v_prev_start := p_start_date - (p_end_date - p_start_date);
  end if;

  -- Pozos: solo del periodo actual.
  select jsonb_object_agg(p.key, p.total_monto)
  into v_pozos_json
  from (
    select pozo.key, sum((pozo.value)::numeric) as total_monto
    from orders o
    join order_items oi on o.id = oi.order_id
    cross join lateral jsonb_each_text(oi.pozos) as pozo
    where o.status in ('approved','paid')
      and (p_start_date is null or o.created_at >= p_start_date)
      and (p_end_date is null or o.created_at <= p_end_date)
      and (p_seller_uid is null or o.seller_uid = p_seller_uid)
      and oi.pozos is not null
    group by pozo.key
  ) p;

  return query
  select
    count(distinct o.id) filter (where w.cur)::bigint,
    coalesce(sum(oi.quantity) filter (where w.cur), 0)::bigint,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)) filter (where w.cur), 0),
    coalesce(sum(oi.quantity * coalesce(oi.coste_final_snap, 0)) filter (where w.cur), 0),
    coalesce(sum(oi.comision) filter (where w.cur), 0),
    coalesce(sum(oi.ganancia_tienda) filter (where w.cur), 0),
    coalesce(sum(oi.salary) filter (where w.cur), 0),
    coalesce(v_pozos_json, '{}'::jsonb),

    count(distinct o.id) filter (where w.prv)::bigint,
    coalesce(sum(oi.quantity) filter (where w.prv), 0)::bigint,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)) filter (where w.prv), 0),
    coalesce(sum(oi.quantity * coalesce(oi.coste_final_snap, 0)) filter (where w.prv), 0),
    coalesce(sum(oi.comision) filter (where w.prv), 0),
    coalesce(sum(oi.ganancia_tienda) filter (where w.prv), 0)
  from orders o
  left join order_items oi on o.id = oi.order_id
  cross join lateral (
    select
      ((p_start_date is null or o.created_at >= p_start_date)
        and (p_end_date is null or o.created_at <= p_end_date)) as cur,
      (v_prev_start is not null
        and o.created_at >= v_prev_start
        and o.created_at < v_prev_end) as prv
  ) w
  where o.status in ('approved','paid')
    and (p_seller_uid is null or o.seller_uid = p_seller_uid)
    and (w.cur or w.prv);
end;
$$;

-- Ranking del equipo. Agrupa por uid y correo: ventas viejas pueden traer el
-- correo sin uid y no deben mezclarse en un solo grupo vacío.
create or replace function get_seller_performance(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
) returns table (
  seller_uid uuid,
  seller_email text,
  seller_name text,
  total_vendido numeric,
  comision numeric,
  num_ventas bigint,
  unidades bigint
) language sql security definer set search_path = public, pg_temp as $$
  select
    o.seller_uid,
    coalesce(o.seller_email, '') as seller_email,
    coalesce(max(p.name), '') as seller_name,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)), 0) as total_vendido,
    coalesce(sum(oi.comision), 0) as comision,
    count(distinct o.id)::bigint as num_ventas,
    coalesce(sum(oi.quantity), 0)::bigint as unidades
  from orders o
  left join order_items oi on oi.order_id = o.id
  left join profiles p on p.id = o.seller_uid
  where o.status in ('approved', 'paid')
    and (p_start_date is null or o.created_at >= p_start_date)
    and (p_end_date is null or o.created_at <= p_end_date)
  group by o.seller_uid, o.seller_email
  order by 4 desc;
$$;

-- Top por INGRESO, no por unidades.
create or replace function get_top_products(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_seller_uid uuid default null,
  p_limit integer default 10
) returns table (
  sku text,
  unidades bigint,
  ingreso numeric
) language sql security definer set search_path = public, pg_temp as $$
  select
    oi.sku,
    coalesce(sum(oi.quantity), 0)::bigint as unidades,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)), 0) as ingreso
  from orders o
  join order_items oi on oi.order_id = o.id
  where o.status in ('approved', 'paid')
    and oi.sku is not null
    and (p_start_date is null or o.created_at >= p_start_date)
    and (p_end_date is null or o.created_at <= p_end_date)
    and (p_seller_uid is null or o.seller_uid = p_seller_uid)
  group by oi.sku
  order by 3 desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

-- Cinco cortes del periodo en un solo jsonb. El monto sale de `orders.total`
-- (lo cobrado, con descuento) y no de sumar líneas.
create or replace function get_sales_breakdown(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_seller_uid uuid default null
) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  with base as (
    select
      o.id,
      coalesce(o.total, 0) as total,
      o.sale_origin::text as origin,
      (i.id is not null) as invoiced,
      coalesce(i.method::text, 'sin_metodo') as method,
      (i.discount_code is not null and btrim(i.discount_code) <> '') as has_discount,
      exists (select 1 from installments ins where ins.order_id = o.id) as is_installment
    from orders o
    -- Una factura anulada no cuenta como facturada.
    left join invoices i on i.sale_id = o.id and i.status <> 'void'
    where o.status in ('approved', 'paid')
      and (p_start_date is null or o.created_at >= p_start_date)
      and (p_end_date is null or o.created_at <= p_end_date)
      and (p_seller_uid is null or o.seller_uid = p_seller_uid)
  )
  select jsonb_build_object(
    -- Solo ventas facturadas: sin factura no hay método de pago.
    'by_method', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc), '[]'::jsonb)
      from (select method as key, count(*)::bigint as c, sum(total) as t from base where invoiced group by method) q
    ),
    'by_origin', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc), '[]'::jsonb)
      from (select origin as key, count(*)::bigint as c, sum(total) as t from base group by origin) q
    ),
    'by_invoiced', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc), '[]'::jsonb)
      from (
        select case when invoiced then 'con_factura' else 'sin_factura' end as key,
               count(*)::bigint as c, sum(total) as t
        from base group by 1
      ) q
    ),
    'by_discount', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc), '[]'::jsonb)
      from (
        select case when has_discount then 'con_codigo' else 'sin_codigo' end as key,
               count(*)::bigint as c, sum(total) as t
        from base group by 1
      ) q
    ),
    'by_installment', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc), '[]'::jsonb)
      from (
        select case when is_installment then 'a_cuotas' else 'contado' end as key,
               count(*)::bigint as c, sum(total) as t
        from base group by 1
      ) q
    )
  );
$$;

-- Plata movida en envíos y por quién. Entran también las facturas anuladas:
-- anular el papel no devuelve el envío que ya salió (viajan aparte).
create or replace function get_delivery_summary(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
) returns table (
  total_delivery numeric,
  num_deliveries bigint,
  total_anulado numeric,
  num_anuladas bigint,
  by_repartidor jsonb
) language sql security definer set search_path = public, pg_temp as $$
  with base as (
    select
      coalesce(i.delivery_fee, 0) as fee,
      (i.status = 'void') as anulada,
      coalesce(nullif(btrim(i.delivery_name), ''), 'Sin asignar') as repartidor
    from invoices i
    where coalesce(i.delivery_fee, 0) > 0
      and (p_start_date is null or i.created_at >= p_start_date)
      and (p_end_date is null or i.created_at <= p_end_date)
  )
  select
    coalesce((select sum(fee) from base), 0) as total_delivery,
    coalesce((select count(*) from base), 0)::bigint as num_deliveries,
    coalesce((select sum(fee) from base where anulada), 0) as total_anulado,
    coalesce((select count(*) from base where anulada), 0)::bigint as num_anuladas,
    coalesce((
      select jsonb_agg(jsonb_build_object('repartidor', repartidor, 'total', t, 'count', c) order by t desc)
      from (select repartidor, sum(fee) as t, count(*)::bigint as c from base group by repartidor) q
    ), '[]'::jsonb) as by_repartidor;
$$;

-- Una fila por venta con vendido, coste, comisión y ganancia. SENSIBLE: es la
-- estructura de costos; la ruta que lo usa es solo de admin.
create or replace function get_sales_ledger(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_seller_uid uuid default null
) returns table (
  order_id uuid,
  created_at timestamptz,
  cliente text,
  invoice_number text,
  total_vendido numeric,
  coste numeric,
  comision numeric,
  ganancia numeric
) language sql security definer set search_path = public, pg_temp as $$
  select
    o.id as order_id,
    o.created_at,
    coalesce(nullif(btrim(c.name), ''), nullif(btrim(o.phone), '')) as cliente,
    coalesce(i.invoice_code, i.invoice_number::text) as invoice_number,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)), 0) as total_vendido,
    coalesce(sum(oi.quantity * coalesce(oi.coste_final_snap, 0)), 0) as coste,
    coalesce(sum(oi.comision), 0) as comision,
    coalesce(sum(oi.ganancia_tienda), 0) as ganancia
  from orders o
  left join order_items oi on oi.order_id = o.id
  left join contacts c on c.id = o.contact_id
  left join invoices i on i.sale_id = o.id and i.status <> 'void'
  where o.status in ('approved', 'paid')
    and (p_start_date is null or o.created_at >= p_start_date)
    and (p_end_date is null or o.created_at <= p_end_date)
    and (p_seller_uid is null or o.seller_uid = p_seller_uid)
  group by o.id, o.created_at, c.name, o.phone, i.invoice_code, i.invoice_number
  order by o.created_at desc;
$$;

-- Facturas con envío del periodo, una por fila (mismo criterio que el resumen).
create or replace function get_delivery_invoices(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
) returns table (
  invoice_number text,
  delivery_fee numeric,
  delivery_name text,
  created_at timestamptz
) language sql security definer set search_path = public, pg_temp as $$
  select
    coalesce(i.invoice_code, i.invoice_number::text) as invoice_number,
    coalesce(i.delivery_fee, 0) as delivery_fee,
    nullif(btrim(i.delivery_name), '') as delivery_name,
    i.created_at
  from invoices i
  where coalesce(i.delivery_fee, 0) > 0
    and (p_start_date is null or i.created_at >= p_start_date)
    and (p_end_date is null or i.created_at <= p_end_date)
  order by i.created_at desc;
$$;

-- Ventas aplanadas para exportar a CSV. `security_invoker`: corre con los
-- permisos de quien consulta, así respeta RLS.
create or replace view sales_export_view with (security_invoker = on) as
select
  o.id as order_id,
  o.status as order_status,
  o.created_at as created_at,
  o.seller_email as seller_email,
  o.phone as customer_phone,
  i.invoice_number as invoice_number,
  i.status as invoice_status,
  i.method as payment_method,
  oi.sku as item_sku,
  oi.quantity as item_quantity,
  oi.precio_unit as item_price,
  oi.coste_final_snap as item_cost,
  oi.utilidad_bruta as item_utilidad_bruta,
  oi.salary as item_salary,
  oi.utilidad_neta as item_utilidad_neta,
  oi.comision as item_comision,
  oi.ganancia_tienda as item_ganancia_tienda
from orders o
join order_items oi on o.id = oi.order_id
left join invoices i on o.id = i.sale_id
where o.status in ('approved','paid');


-- ============================================================================
-- 12. Tienda: canje de códigos y registro de pedidos web
-- ============================================================================

-- Canje ATÓMICO: revalida, suma el uso y deja el rastro en una transacción.
-- El `for update` serializa la fila: dos pedidos a la vez no agotan de más un
-- código. Devuelve { ok, err, … } para que el servidor muestre un error claro.
create or replace function redeem_discount_code(
  p_code text,
  p_source redemption_source,
  p_reference_id uuid,
  p_reference_label text,
  p_method payment_method,
  p_amount numeric,
  p_redeemed_by text
)
returns table (ok boolean, err text, r_code text, r_type discount_type, r_value numeric)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_row  discount_codes%rowtype;
begin
  if v_code = '' then
    return query select false, 'Código inválido.', null::text, null::discount_type, null::numeric; return;
  end if;

  select * into v_row from discount_codes where code = v_code for update;

  if not found then
    return query select false, 'Código inválido.', null::text, null::discount_type, null::numeric; return;
  end if;
  if not v_row.active then
    return query select false, 'Este código ya no está activo.', null::text, null::discount_type, null::numeric; return;
  end if;
  if v_row.expires_at is not null and v_row.expires_at < current_date then
    return query select false, 'Este código venció.', null::text, null::discount_type, null::numeric; return;
  end if;
  if v_row.max_uses > 0 and v_row.used_count >= v_row.max_uses then
    return query select false, 'Este código ya fue canjeado.', null::text, null::discount_type, null::numeric; return;
  end if;

  update discount_codes set used_count = used_count + 1 where code = v_code;

  insert into discount_code_redemptions (
    code, source, reference_id, reference_label, method, amount, redeemed_by
  ) values (
    v_row.code, p_source, p_reference_id, p_reference_label, p_method, p_amount, p_redeemed_by
  );

  return query select true, null::text, v_row.code, v_row.type, v_row.value;
end;
$$;

-- Recupera un intento de checkout ya registrado. Toma el mismo bloqueo que el
-- registro: si hay uno en curso con esa clave, espera a que termine.
create or replace function recover_public_order_attempt(p_key uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_attempt public.public_order_attempts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public-order:' || p_key::text, 0));
  select * into v_attempt from public.public_order_attempts where idempotency_key = p_key;
  if not found then return null; end if;
  return jsonb_build_object('requestHash', v_attempt.request_hash, 'response', v_attempt.response);
end;
$$;

-- Registra el pedido web completo en UNA transacción: cabecera, líneas, canje
-- del código y el intento. Si algo falla, no queda nada a medias (tampoco el
-- canje). Recalcula subtotal y descuento: si no coinciden con lo que vio el
-- cliente, rechaza en vez de guardar otro total.
create or replace function register_public_order_attempt(
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


-- ============================================================================
-- 13. Seguridad
-- ============================================================================
-- En bucles y no tabla por tabla: una tabla o función nueva queda cubierta sin
-- tener que acordarse. migrations/0025_ordenar_base.sql corre estos mismos
-- bucles sobre la base real.

-- RLS deny-all: activo y sin políticas en todas las tablas.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
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
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- Permisos. La llave pública (anon) viaja en el navegador para el login del
-- personal, así que cualquiera la puede usar contra la API de Supabase. RLS ya
-- bloquea las tablas, pero las funciones `security definer` de reportes lo
-- saltean: sin este revoke, cualquiera podría pedir el libro de ventas con
-- costos. Solo el servidor (service_role) usa tablas y funciones.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Lo mismo para lo que se cree más adelante desde el SQL Editor (rol postgres).
-- La primera línea es global porque Postgres le da EXECUTE a PUBLIC en toda
-- función nueva y ese permiso no se puede quitar por esquema.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- PostgREST cachea el esquema: sin esto el primer request contra algo nuevo
-- responde "Could not find … in the schema cache".
notify pgrst, 'reload schema';
