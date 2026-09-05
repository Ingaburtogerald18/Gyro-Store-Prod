-- ============================================================================
-- 01_schema.sql — Esquema completo de Gyro Store v2 (Supabase / Postgres)
-- ============================================================================
-- ARCHIVO ÚNICO DE ESQUEMA. Consolida el baseline y las ocho migraciones
-- incrementales que se le aplicaron después (los antiguos 0004–0011), en el
-- mismo orden en que se ejecutaron. El SQL es el original: se concatenó, no se
-- reescribió, así que no hay riesgo de que una transcripción cambie una columna.
--
-- Cada bloque conserva su cabecera original, que explica QUÉ cambia y POR QUÉ.
-- Leído de arriba abajo, el archivo cuenta la evolución del esquema: primero las
-- tablas en su forma inicial, después los `alter table` que las completaron.
--
-- ⚠️  SOLO PARA INSTALACIONES NUEVAS.
--     No es idempotente (los `create table` son pelados, a propósito: si falla
--     es porque la base no estaba limpia, y conviene enterarse ahí y no a mitad
--     de camino). NO aplicarlo sobre una base con datos.
--
-- ── Orden de aplicación ──
--     1. 01_schema.sql   (este)
--     2. 02_seed.sql     (datos de arranque)
--
--     El seed va DESPUÉS: inserta en `accounts`, y la sección de Caja de más
--     abajo le agrega columnas a esa tabla. Sembrar antes dejaría filas con la
--     forma vieja.
--
-- ── Cambios futuros ──
--     Una vez que la base tiene datos, este baseline NO se edita ni se re-aplica.
--     Todo cambio posterior va en un archivo incremental nuevo (p. ej.
--     `migrations/0015_…`, creando esa carpeta el día que haga falta). Lo que ya
--     se ejecutó contra una base real no se reescribe. Ver README.md.
--
-- ============================================================================
-- (Sigue la cabecera original del baseline.)
-- ============================================================================
--
-- Orden del archivo: función de utilidad → enums → secuencias → tablas (en
-- orden de dependencia de FK) → Storage → RLS → triggers.
--
-- ── Principio de seguridad (doc 02/03) ──
-- RLS en DENY-ALL sobre TODAS las tablas de `public`, sin políticas: nadie con
-- la anon/authenticated key lee ni escribe. El backend usa la `service_role`,
-- que ignora RLS por diseño. La única excepción son las políticas de
-- `storage.objects`, y es deliberada: el bucket sirve las fotos del catálogo
-- público.
-- ============================================================================

-- ── Función: mantener updated_at ──
-- `search_path` fijo (mismo criterio que el bucle 0007 para las funciones
-- security definer): deja el Advisor de Supabase sin el aviso "Function Search
-- Path Mutable". El bucle 0007 no la cubre porque no es security definer.
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
-- Enums
-- ============================================================================
-- Un tipo es global a la base, así que van todos juntos en vez de repartidos
-- por el archivo.

-- Roles del sistema. global_admin = acceso total.
create type app_role as enum (
  'global_admin',
  'admin',
  'seller',
  'cashier',
  'logistics_admin',
  'logistics_customer'
);

create type purchase_status as enum ('china', 'pending', 'received');
create type order_status as enum ('pending_approval', 'approved', 'paid', 'rejected');

-- 'migrated' marca las ventas registradas como provenientes del histórico
-- viejo. El módulo de inventario migrado se eliminó, pero el valor se conserva:
-- hay órdenes cerradas que lo usan.
create type sale_origin as enum ('native', 'migrated');

-- 'void' = factura anulada. Borrar una factura emitida por error dejaría un
-- hueco en el correlativo, que es justo lo que un correlativo no puede tener:
-- el número se conserva y el documento queda marcado con quién y por qué.
create type invoice_status as enum ('unlinked', 'linked', 'void');

create type payment_method as enum ('efectivo', 'transferencia', 'tarjeta');
create type loss_category as enum ('robo', 'dano', 'devolucion', 'regalias');
create type contact_origin as enum ('fb_ads', 'organic', 'whatsapp_link', 'referral', 'other');
create type follow_up_status as enum ('pending', 'completed', 'cancelled');
create type cuenta_tipo as enum ('banco', 'efectivo');
create type movimiento_tipo as enum ('ingreso', 'egreso');
create type discount_type as enum ('percent', 'fixed');
create type redemption_source as enum ('checkout', 'invoice', 'sale');

-- ============================================================================
-- Secuencias
-- ============================================================================
-- Van antes de las tablas que las usan en su `default`.
--
-- Los dos correlativos son atómicos por diseño: dos requests concurrentes que
-- leyeran "el último número" para sumarle 1 podrían calcular el mismo.
-- `nextval()` no. Y ninguna se reinicia: un número descartado queda quemado,
-- que es lo correcto para algo que ya pudo haberse impreso o repartido.
create sequence invoice_number_seq;
create sequence discount_code_seq;

-- ============================================================================
-- Tabla: profiles
-- ============================================================================
-- Perfil de aplicación del staff, 1:1 con auth.users (Supabase Auth). Los roles
-- que no salen de la whitelist de env (ADMIN_EMAILS) viven acá (doc 03 §A.3).
--
-- `bank_account` es jsonb y no text porque son TRES datos, no uno:
--     { "bank": "lafise", "currency": "NIO", "number": "1234567890" }
-- Un string libre ("BAC 123456 córdobas") obliga a parsear con regex para saber
-- a qué banco transferir, y cada quien lo escribe distinto. Es dato sensible:
-- solo sale por endpoints `requireAdmin`.
--
-- `last_login` sirve para detectar cuentas inactivas antes de darlas de baja.
create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null unique,
  name            text,
  avatar_url      text,
  roles           app_role[] not null default '{}',
  status          text not null default 'active',   -- 'active' | 'disabled'
  deleted_at      timestamptz,                       -- soft-delete (papelera 30 días)
  phone           text,
  personal_email  text,
  bank_account    jsonb,
  last_login      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_email_idx on profiles (email);

-- ============================================================================
-- Tabla: categories
-- ============================================================================
create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  -- Emoji/ícono corto que el storefront muestra junto al nombre (plegado de 0013).
  icon        varchar(16) not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- Tabla: templates
-- ============================================================================
-- El molde reutilizable. `category_id` filtra qué plantillas se ofrecen al
-- editar un producto de esa categoría.
create table templates (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  description  text,                              -- nota interna del molde
  category_id  uuid references categories(id) on delete set null,
  -- `axes` es un ARRAY ORDENADO: [{ key, label, options[], isColor }]. El orden
  -- importa porque define cómo se arma el nombre de la combinación ("Negro /
  -- Con micrófono"), y ese string es la LLAVE de `catalog_items.variant_mappings`.
  -- Un objeto jsonb no garantiza orden; un array sí. De ahí el default '[]'.
  axes         jsonb default '[]',
  specs        jsonb default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index templates_category_id_idx on templates (category_id);

-- ============================================================================
-- Tabla: catalog_items
-- ============================================================================
-- El producto que se vende.
create table catalog_items (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid references templates(id) on delete set null,
  base_price        numeric(12,2),
  price             numeric(12,2),
  precio_sugerido   numeric(12,2),
  precio_tentativo  numeric(12,2),
  variant_mappings  jsonb default '{}',
  axis_options      jsonb default '{}',
  images            jsonb default '[]',
  images_by_color   jsonb default '{}',
  published         boolean not null default false,
  is_promo          boolean not null default false,
  sort_order        integer not null default 0,
  -- Nombre y descripción PROPIOS del producto, independientes del molde: como
  -- las plantillas son reutilizables, dos productos que comparten molde
  -- compartirían el nombre. "Plantilla Audífonos KZ" y "KZ ZSN Pro X" son cosas
  -- distintas, así que cada una vive en su tabla.
  name              text,
  description       text,
  category_id       uuid references categories(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index catalog_items_published_sort_order_idx on catalog_items (published, sort_order);
create index catalog_items_category_id_idx on catalog_items (category_id);

-- ============================================================================
-- Tabla: combos
-- ============================================================================
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

-- ============================================================================
-- Tabla: contacts
-- ============================================================================
-- `phone` es la identidad natural del contacto (es el canal por el que se
-- cierra la venta), de ahí el UNIQUE.
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique,
  name        text,
  origin      contact_origin not null default 'other',
  stage       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- El unique ya implica índice sobre phone; `stage` es el otro campo de filtro.
create index contacts_stage_idx on contacts (stage);

-- ============================================================================
-- Tabla: contact_activities
-- ============================================================================
create table contact_activities (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  type        text,
  note        text,
  created_at  timestamptz not null default now()
);

create index contact_activities_contact_id_idx on contact_activities (contact_id);

-- ============================================================================
-- Tabla: follow_ups
-- ============================================================================
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

-- ============================================================================
-- Tabla: purchases
-- ============================================================================
-- El ledger REAL del FIFO: cada lote comprado en China con su costeo
-- (doc 11 §1-2). Es lo que se reserva y se descuenta al vender, no `products`.
--
-- `quantity_sold` y `quantity_reserved` se mueven contra `quantity`; el check
-- de tabla garantiza que nunca se comprometa más stock del que existe, aunque
-- dos requests concurrentes pasen la validación de TypeScript.
create table purchases (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  lot                 text,
  status              purchase_status not null default 'china',
  purchase_date       date not null,
  quantity            integer not null check (quantity >= 0),
  quantity_sold       integer not null default 0 check (quantity_sold >= 0),
  quantity_reserved   integer not null default 0 check (quantity_reserved >= 0),
  costo_china_usd     numeric(12,4),
  impuesto_unit_usd   numeric(12,4) default 0,
  envio_unit_usd      numeric(12,4) default 0,
  exchange_rate       numeric(8,4),
  costo_real_usd      numeric(12,4),
  costo_real_cs       numeric(12,2),
  product_name        text not null default 'No Name',
  category            text,
  arrival_date        date,
  suggested_price     numeric(12,2),
  costo_f_u           numeric(12,2),
  coste_final         numeric(12,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint purchases_stock_check check (quantity_sold + quantity_reserved <= quantity)
);

create index purchases_purchase_date_idx on purchases (purchase_date);
create index purchases_status_idx on purchases (status);

-- ============================================================================
-- Tabla: orders
-- ============================================================================
create table orders (
  id              uuid primary key default gen_random_uuid(),
  status          order_status not null default 'pending_approval',
  sale_origin     sale_origin not null default 'native',
  seller_uid      uuid references profiles(id) on delete set null,
  seller_email    text,
  week_of         text,
  contact_id      uuid references contacts(id) on delete set null,
  phone           text,
  total           numeric(12,2),
  payment_method  payment_method default 'efectivo',
  payment_receipt_url text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index orders_seller_uid_week_of_idx on orders (seller_uid, week_of);
create index orders_status_idx on orders (status);

-- ============================================================================
-- Tabla: order_items
-- ============================================================================
-- Las columnas financieras (coste_final_snap, utilidad_*, salary, comision,
-- ganancia_tienda, pozos) son un SNAPSHOT que llena el backend al APROBAR la
-- orden. Se congelan a propósito: si después cambia la tasa de cambio o la
-- escala de comisiones, una venta ya aprobada no puede recalcularse sola.
create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  sku               text,
  quantity          integer not null check (quantity > 0),
  precio_unit       numeric(12,2),
  coste_final_snap  numeric(12,2),
  utilidad_bruta    numeric(12,2),
  salary            numeric(12,2),
  utilidad_neta     numeric(12,2),
  comision          numeric(12,2),
  ganancia_tienda   numeric(12,2),
  pozos             jsonb,
  created_at        timestamptz not null default now()
);

-- Todo reporte se une por order_id; sin este índice cada KPI hace scan completo.
create index order_items_order_id_idx on order_items (order_id);

-- ============================================================================
-- Tabla: stock_reservations
-- ============================================================================
-- Reserva FIFO contra un lote concreto de `purchases`.
create table stock_reservations (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references orders(id) on delete cascade,
  purchase_id     uuid not null references purchases (id) on delete cascade,
  code            text,
  quantity        integer not null check (quantity > 0),
  unit_final_usd  numeric(12,4),
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);

create index stock_reservations_order_id_idx on stock_reservations (order_id);
create index stock_reservations_purchase_id_idx on stock_reservations (purchase_id);

-- ============================================================================
-- Tabla: invoices
-- ============================================================================
-- El correlativo de factura es un REQUISITO LEGAL: no puede duplicarse ni tener
-- huecos. El UNIQUE de `invoice_number` protege el correlativo en sí; el índice
-- único PARCIAL sobre `sale_id` impide que dos requests concurrentes emitan dos
-- facturas (dos números quemados) para la misma venta, sin bloquear las
-- facturas todavía sin vincular (`sale_id is null`, que pueden ser muchas).
-- La validación en TypeScript es check-then-insert y no es atómica; esto sí.
--
-- `invoice_code` es GENERADA: el código legible que se imprime y que el
-- vendedor tipea (`GS-PR-12`). El cast `::text` es obligatorio — sin él la
-- concatenación usa `anytextcat`, que es STABLE y no IMMUTABLE, y Postgres
-- rechaza la columna generada.
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid references orders(id) on delete set null,
  invoice_number  bigint default nextval('invoice_number_seq'),
  invoice_code    text generated always as ('GS-PR-' || invoice_number::text) stored,
  status          invoice_status not null default 'unlinked',
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

-- El listado del panel filtra por estado y ordena por número descendente.
create index invoices_status_number_idx on invoices (status, invoice_number desc);
create index invoices_invoice_code_idx on invoices (invoice_code);
create unique index invoices_sale_id_unique_idx on invoices (sale_id) where sale_id is not null;

-- ============================================================================
-- Tabla: invoice_items
-- ============================================================================
-- Las líneas de la factura, que existen ANTES de que haya una venta vinculada
-- (modelo inverso al POS: primero se emite el ticket, después se registra la
-- venta con ese número).
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

-- ============================================================================
-- Tabla: public_orders
-- ============================================================================
-- El pedido del checkout público. Guarda a dónde hay que despachar: el pedido
-- se cierra por WhatsApp, pero el panel necesita el destino sin depender de ese
-- mensaje. `discount_code` / `code_discount` dejan el rastro del canje.
create table public_orders (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid references contacts(id) on delete set null,
  phone            text,
  total            numeric(12,2),
  status           text not null default 'new',
  customer_name    text,
  delivery_method  text check (delivery_method in ('retiro', 'envio')),
  address          text,
  location_url     text,
  note             text,
  discount_code    text,
  code_discount    numeric(12,2) default 0,
  created_at       timestamptz not null default now()
);

-- Se listan por fecha descendente; el índice evita el sort completo al crecer.
create index public_orders_created_at_idx on public_orders (created_at desc);

-- ============================================================================
-- Tabla: public_order_items
-- ============================================================================
create table public_order_items (
  id                uuid primary key default gen_random_uuid(),
  public_order_id   uuid not null references public_orders(id) on delete cascade,
  sku               text,
  quantity          integer not null check (quantity > 0),
  precio_unit       numeric(12,2),
  created_at        timestamptz not null default now()
);

create index public_order_items_public_order_id_idx on public_order_items (public_order_id);

-- ============================================================================
-- Tabla: installments
-- ============================================================================
-- Plan de cuotas sobre una venta aprobada. El UNIQUE en `order_id` es la misma
-- defensa que el de invoices: impide dos planes para el mismo pedido cuando dos
-- requests concurrentes pasan el SELECT previo.
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

create index installments_order_id_idx on installments (order_id);

-- ============================================================================
-- Tabla: payments
-- ============================================================================
-- Pago de una CUOTA de un cliente. No confundir con `commission_payments`, que
-- es la tienda pagándole a un vendedor.
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

-- ============================================================================
-- Tabla: accounts
-- ============================================================================
-- Caja física y cuentas bancarias. `on delete restrict` en los movimientos:
-- una cuenta con historial no se borra.
create table accounts (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        cuenta_tipo not null,
  moneda      text not null default 'NIO',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- Tabla: commission_payments
-- ============================================================================
-- Lote de pago de comisiones a un vendedor. Es INMUTABLE: registra lo que
-- efectivamente se entregó. Si después se edita una venta ya pagada, su
-- comisión cambia y la diferencia NO se reescribe sobre el lote histórico —
-- se anota en `commission_adjustments` y se salda en el próximo corte.
--
-- Va en tabla propia y no en `payments` porque son entidades distintas: aquella
-- es la cuota de un cliente y su FK es `installment_id`. Compartir tabla
-- obligaría a dejar esa FK nula y distinguirlas por un flag.
create table commission_payments (
  id                  uuid primary key default gen_random_uuid(),
  seller_uid          uuid references profiles(id) on delete set null,
  -- El email se guarda ADEMÁS del uid: si el perfil se borra, el histórico de
  -- pagos tiene que seguir diciendo a quién se le pagó (la FK queda en null).
  seller_email        text not null,
  seller_name         text,

  -- Ventas cubiertas por este lote. Se guarda el arreglo en vez de una tabla
  -- puente porque el lote es inmutable: nunca se agregan ni quitan ventas
  -- después de emitido, así que no hay nada que mantener.
  order_ids           uuid[] not null default '{}',

  gross_comision      numeric(12,2) not null default 0,  -- suma de comisiones del lote
  saldo_aplicado      numeric(12,2) not null default 0,  -- ajustes arrastrados
  total_comision      numeric(12,2) not null default 0,  -- lo efectivamente entregado

  -- Liquidación de saldo suelta, sin ventas asociadas.
  is_settlement       boolean not null default false,

  payment_method      text not null default 'efectivo',
  receipt_url         text,
  -- Sin comprobante hay que justificar por qué: la ausencia queda explicada en
  -- el registro y no como un hueco silencioso.
  no_receipt_comment  text,

  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint commission_payments_receipt_check
    check (receipt_url is not null or no_receipt_comment is not null)
);

create index commission_payments_seller_email_idx
  on commission_payments (seller_email, created_at desc);

-- ============================================================================
-- Tabla: commission_adjustments
-- ============================================================================
-- La cuenta corriente con el vendedor:
--   amount > 0 → saldo A FAVOR del vendedor (la tienda le debe)
--   amount < 0 → saldo EN CONTRA (cobró de más; lo devuelve)
-- `settled` evita cobrar dos veces el mismo ajuste.
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

-- El saldo pendiente se consulta SIEMPRE filtrando por `settled = false`, que
-- es un subconjunto chico frente al histórico: índice parcial.
create index commission_adjustments_pending_idx
  on commission_adjustments (seller_email)
  where settled = false;

create index commission_adjustments_order_id_idx on commission_adjustments (order_id);

-- ============================================================================
-- Tabla: account_movements
-- ============================================================================
-- Libro diario de ingresos y egresos de las cuentas.
create table account_movements (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete restrict,
  tipo             movimiento_tipo not null,
  monto            numeric(12,2) not null check (monto > 0),
  categoria        text not null,
  descripcion      text,
  comprobante_url  text,
  ocurrio_at       timestamptz not null default now(),
  registrado_por   uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index account_movements_account_id_idx on account_movements (account_id);

-- ============================================================================
-- Tabla: app_config
-- ============================================================================
-- Parámetros del negocio editables desde la UI (tasa de cambio, pozos, escalas
-- de costeo/margen/comisión). Clave-valor jsonb para no migrar el esquema cada
-- vez que cambia una escala.
create table app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- Tabla: losses
-- ============================================================================
-- Mermas: robo, daño, devolución y regalías.
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
-- Tabla: audit_logs
-- ============================================================================
-- Rastro de cambios sensibles. `before`/`after` guardan el estado completo en
-- jsonb: la entidad auditada puede cambiar de forma y el histórico se conserva
-- tal como era en su momento.
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

-- ============================================================================
-- Tabla: analytics_events
-- ============================================================================
create table analytics_events (
  id          uuid primary key default gen_random_uuid(),
  type        text,
  payload     jsonb default '{}',
  created_at  timestamptz not null default now()
);

create index analytics_events_type_idx on analytics_events (type);

-- ============================================================================
-- Tabla: expenses
-- ============================================================================
-- Registra el dinero extraído/gastado de los 7 pozos de la tienda. El check
-- fija los pozos válidos: son los mismos que la clave `pozos` de `app_config`.
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  pozo        text not null check (pozo in ('publicidad', 'mantenimiento', 'utiles', 'garantias', 'prestamos', 'suscripciones', 'servicios')),
  monto_cs    numeric(12,2) not null check (monto_cs > 0),
  category    text,
  description text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index expenses_created_at_idx on expenses (created_at);

-- ============================================================================
-- Tabla: discount_codes
-- ============================================================================
-- El admin emite códigos (ej. incentivo por reseña en Google/Facebook) y el
-- cliente los aplica en el checkout público, en una factura POS o al registrar
-- una venta.
--
-- El código en MAYÚSCULAS es la PRIMARY KEY natural → unicidad sin query extra.
-- Lo genera la secuencia (`GS-DC-1`, `GS-DC-2`, …): un código correlativo y
-- legible se dicta por teléfono sin errores, cosa que un `GYRO-A7K2QX` aleatorio
-- no permite.
--
-- `max_uses = 0` significa usos ilimitados.
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

-- La lista del admin ordena por fecha descendente; el índice evita el sort.
create index discount_codes_created_at_idx on discount_codes (created_at desc);

-- ============================================================================
-- Tabla: discount_code_redemptions
-- ============================================================================
-- Rastro de CADA canje: en qué factura o pedido se aplicó, por cuánto y quién.
create table discount_code_redemptions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null references discount_codes(code) on delete cascade,
  source          redemption_source not null,
  reference_id    uuid,
  reference_label text,
  method          payment_method,
  amount          numeric(12,2) not null default 0,
  redeemed_by     text,
  redeemed_at     timestamptz not null default now()
);

create index discount_code_redemptions_code_idx on discount_code_redemptions (code);
create index discount_code_redemptions_redeemed_at_idx on discount_code_redemptions (redeemed_at desc);

-- ============================================================================
-- Storage: bucket de assets públicos
-- ============================================================================
-- `storage.objects` es una tabla de Supabase que ya trae RLS activo, y acá SÍ se
-- definen políticas: es la excepción al deny-all, a propósito — el bucket sirve
-- las fotos del catálogo público.
--
-- Este bloque es idempotente aunque el resto del archivo no lo sea: Postgres no
-- soporta `create policy if not exists`, así que va `drop ... if exists` antes
-- de cada `create`.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Access" on storage.objects;
create policy "Public Access" on storage.objects
  for select
  using (bucket_id = 'public-assets');

drop policy if exists "Authenticated users can upload" on storage.objects;
create policy "Authenticated users can upload" on storage.objects
  for insert
  with check (bucket_id = 'public-assets' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update" on storage.objects;
create policy "Authenticated users can update" on storage.objects
  for update
  using (bucket_id = 'public-assets' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete" on storage.objects;
create policy "Authenticated users can delete" on storage.objects
  for delete
  using (bucket_id = 'public-assets' and auth.role() = 'authenticated');

-- ============================================================================
-- RLS: deny-all sobre todo `public`
-- ============================================================================
-- En bucle en vez de un `alter table` por tabla: así una tabla nueva que se
-- olvide de activarlo queda igualmente protegida al re-correr el baseline, y no
-- hay 30 líneas idénticas que revisar una por una.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================================
-- Triggers de updated_at
-- ============================================================================
-- Las tablas que tienen la columna. En bucle por el mismo motivo que RLS.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'categories', 'templates', 'catalog_items', 'combos',
    'contacts', 'follow_ups', 'purchases', 'orders',
    'invoices', 'installments', 'app_config'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ============================================================================
-- Cierre de 0001_schema.sql
-- ============================================================================
-- ============================================================================
-- Gyro Store v2 · 0002 · Funciones, RPCs y vistas
-- ============================================================================
-- Todo lo que se ejecuta EN la base: los RPCs de reportería, la vista de
-- exportación y el canje atómico de códigos de descuento.
--
-- ── Por qué los reportes viven acá y no en el backend ──
-- Agregar decenas de miles de `order_items` en TypeScript obligaría a traerlos
-- todos a memoria. Postgres devuelve la fila ya sumada. Son `security definer`
-- porque leen tablas con RLS deny-all.
--
-- Todos son `create or replace`, así que este archivo SÍ es re-ejecutable.
--
-- El universo de "venta" es siempre el mismo: `orders` con status en
-- ('approved','paid'), fechado por `orders.created_at`. Las pendientes de
-- aprobación no son ventas todavía y las rechazadas nunca lo fueron.
-- ============================================================================

-- ============================================================================
-- RPC: get_financial_kpis
-- ============================================================================
-- KPIs del periodo MÁS los del periodo inmediatamente anterior de igual
-- duración. Un número sin contexto es un dato, no un reporte: "C$1.4M" no dice
-- si el mes fue bueno; "C$1.4M, +12,4 %" sí.
--
-- Las dos ventanas se resuelven en UN escaneo con `FILTER`. Dos queries
-- separadas serían dos round-trips y dos veces el mismo escaneo de `orders`.
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
  -- Periodo anterior. Ceros si el rango es abierto: sin fechas no hay
  -- "anterior" que calcular.
  total_ventas_prev bigint,
  total_unidades_prev bigint,
  total_vendido_prev numeric,
  coste_total_prev numeric,
  comision_total_prev numeric,
  ganancia_tienda_total_prev numeric
) language plpgsql security definer as $$
declare
  v_pozos_json jsonb;
  v_prev_start timestamptz;
  v_prev_end   timestamptz;
begin
  if p_start_date is not null and p_end_date is not null then
    v_prev_end   := p_start_date;
    v_prev_start := p_start_date - (p_end_date - p_start_date);
  end if;

  -- Pozos: solo del periodo actual. La tarjeta muestra proporción, no evolución.
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
  -- Marca cada orden como del periodo actual, del anterior, o de ninguno.
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
    -- Sin esto el escaneo traería TODO el histórico para descartarlo después.
    and (w.cur or w.prv);
end;
$$;

-- ============================================================================
-- RPC: get_sales_trend
-- ============================================================================
-- Serie temporal para el gráfico de tendencia. `p_bucket` viene de la UI según
-- el largo del rango (un año en barras diarias serían 365 barras ilegibles).
--
-- El `case` no es decorativo: `date_trunc` acepta cualquier texto y explota si
-- no reconoce el campo. Al reducir la entrada a tres valores conocidos, un
-- `p_bucket` basura degrada a 'month' en vez de romper.
--
-- `date_trunc` sobre timestamptz usa el TimeZone de la sesión (UTC en Supabase).
-- Para Nicaragua (UTC-6) eso mueve las ventas de las últimas 6 horas del mes al
-- siguiente — se acepta: es un reporte de tendencia, no contable.
create or replace function get_sales_trend(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_bucket text default 'month',
  p_seller_uid uuid default null
) returns table (
  bucket_start timestamptz,
  total_vendido numeric,
  ganancia numeric,
  comision numeric,
  num_ventas bigint
) language sql security definer as $$
  select
    date_trunc(
      case lower(coalesce(p_bucket, 'month'))
        when 'day'  then 'day'
        when 'week' then 'week'
        else 'month'
      end,
      o.created_at
    ) as bucket_start,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)), 0) as total_vendido,
    coalesce(sum(oi.ganancia_tienda), 0) as ganancia,
    coalesce(sum(oi.comision), 0) as comision,
    count(distinct o.id)::bigint as num_ventas
  from orders o
  left join order_items oi on oi.order_id = o.id
  where o.status in ('approved', 'paid')
    and (p_start_date is null or o.created_at >= p_start_date)
    and (p_end_date is null or o.created_at <= p_end_date)
    and (p_seller_uid is null or o.seller_uid = p_seller_uid)
  group by 1
  order by 1;
$$;

-- ============================================================================
-- RPC: get_seller_performance
-- ============================================================================
-- Ranking del equipo. NO recibe `p_seller_uid` a propósito: es un reporte
-- comparativo entre vendedores y no hay caso en que uno deba pedirlo "para sí
-- mismo". La ruta lo bloquea con 403 para los no-admin.
--
-- Se agrupa por (seller_uid, seller_email) y no solo por uid: las ventas viejas
-- pueden traer el correo sin el uid resuelto, y colapsarlas en un único grupo
-- `null` mezclaría gente distinta.
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
) language sql security definer as $$
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

-- ============================================================================
-- RPC: get_top_products
-- ============================================================================
-- Top por INGRESO, no por unidades: veinte accesorios baratos no valen más que
-- tres productos caros a la hora de decidir qué reponer.
create or replace function get_top_products(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_seller_uid uuid default null,
  p_limit integer default 10
) returns table (
  sku text,
  unidades bigint,
  ingreso numeric
) language sql security definer as $$
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

-- ============================================================================
-- RPC: get_sales_breakdown
-- ============================================================================
-- Los cinco cortes del periodo en UN solo jsonb. Cinco RPCs serían cinco
-- round-trips y cinco veces el mismo escaneo de `orders`; acá el CTE `base` se
-- recorre una vez.
--
-- El monto sale de `orders.total` y NO de sumar `order_items`: `total` refleja
-- lo realmente cobrado (incluye el descuento de factura prorrateado), y sumar
-- las líneas multiplicaría filas al cruzar con `invoices` e `installments`.
--
-- `orders` no tiene `discount_code` — el código vive en la factura. Por eso una
-- venta sin factura nunca cuenta como "con código", que es correcto: el canje
-- se registra al facturar.
create or replace function get_sales_breakdown(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_seller_uid uuid default null
) returns jsonb language sql security definer as $$
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
    -- Una factura anulada no cuenta como facturada: el papel se invalidó.
    left join invoices i on i.sale_id = o.id and i.status <> 'void'
    where o.status in ('approved', 'paid')
      and (p_start_date is null or o.created_at >= p_start_date)
      and (p_end_date is null or o.created_at <= p_end_date)
      and (p_seller_uid is null or o.seller_uid = p_seller_uid)
  )
  select jsonb_build_object(
    -- Solo sobre ventas facturadas: una venta sin factura no tiene método de pago.
    'by_method', (
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc),
        '[]'::jsonb
      )
      from (
        select method as key, count(*)::bigint as c, sum(total) as t
        from base where invoiced group by method
      ) q
    ),
    'by_origin', (
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc),
        '[]'::jsonb
      )
      from (
        select origin as key, count(*)::bigint as c, sum(total) as t
        from base group by origin
      ) q
    ),
    'by_invoiced', (
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc),
        '[]'::jsonb
      )
      from (
        select case when invoiced then 'con_factura' else 'sin_factura' end as key,
               count(*)::bigint as c, sum(total) as t
        from base group by 1
      ) q
    ),
    'by_discount', (
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc),
        '[]'::jsonb
      )
      from (
        select case when has_discount then 'con_codigo' else 'sin_codigo' end as key,
               count(*)::bigint as c, sum(total) as t
        from base group by 1
      ) q
    ),
    'by_installment', (
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', c, 'total', t) order by t desc),
        '[]'::jsonb
      )
      from (
        select case when is_installment then 'a_cuotas' else 'contado' end as key,
               count(*)::bigint as c, sum(total) as t
        from base group by 1
      ) q
    )
  );
$$;

-- ============================================================================
-- RPC: get_delivery_summary
-- ============================================================================
-- Cuánto dinero se movió en envíos y por manos de quién. `delivery_fee` es lo
-- que se le cobró al cliente en la factura, que en la práctica es el monto que
-- termina yendo al repartidor. NO es un costo registrado de forma
-- independiente: si algún día se le paga algo distinto de lo cobrado, hay que
-- registrarlo aparte y este reporte deja de alcanzar.
--
-- Entran TODAS las facturas, incluidas las anuladas: anular el papel no
-- devuelve la plata del envío que ya salió. Excluirlas subestimaría justo lo
-- que se quiere monitorear. Igual viajan aparte para que el número sea
-- auditable.
create or replace function get_delivery_summary(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
) returns table (
  total_delivery numeric,
  num_deliveries bigint,
  total_anulado numeric,
  num_anuladas bigint,
  by_repartidor jsonb
) language sql security definer as $$
  with base as (
    select
      coalesce(i.delivery_fee, 0) as fee,
      (i.status = 'void') as anulada,
      coalesce(nullif(btrim(i.delivery_name), ''), 'Sin asignar') as repartidor
    from invoices i
    -- Único filtro: una factura con envío en 0 no tuvo delivery, y contarla
    -- inflaría el número de entregas sin sumar un peso.
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
      select jsonb_agg(
        jsonb_build_object('repartidor', repartidor, 'total', t, 'count', c)
        order by t desc
      )
      from (
        select repartidor, sum(fee) as t, count(*)::bigint as c
        from base group by repartidor
      ) q
    ), '[]'::jsonb) as by_repartidor;
$$;

-- ============================================================================
-- RPC: get_sales_ledger
-- ============================================================================
-- Las FILAS detrás de los KPIs: una por venta, con vendido, coste, comisión y
-- ganancia en la MISMA fila. Los pop-ups de Total Vendido, Coste y Ganancia
-- miran este mismo dataset y solo cambian la columna que imprimen.
--
-- Una fila por ORDEN, no por línea: el agregado de `order_items` se hace acá
-- adentro o el join multiplicaría filas y el total del pie no cuadraría con el
-- KPI de arriba.
--
-- SENSIBLE: `coste` y `ganancia` son la estructura de costos de la tienda. La
-- ruta que lo expone es `requireAdmin`.
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
) language sql security definer as $$
  select
    o.id as order_id,
    o.created_at,
    coalesce(nullif(btrim(c.name), ''), nullif(btrim(o.phone), '')) as cliente,
    -- El código impreso (`GS-PR-12`) es lo que el usuario ve en el papel.
    coalesce(i.invoice_code, i.invoice_number::text) as invoice_number,
    coalesce(sum(oi.quantity * coalesce(oi.precio_unit, 0)), 0) as total_vendido,
    coalesce(sum(oi.quantity * coalesce(oi.coste_final_snap, 0)), 0) as coste,
    coalesce(sum(oi.comision), 0) as comision,
    coalesce(sum(oi.ganancia_tienda), 0) as ganancia
  from orders o
  left join order_items oi on oi.order_id = o.id
  left join contacts c on c.id = o.contact_id
  -- Una factura anulada no aporta su número: la venta sigue existiendo, el
  -- papel no.
  left join invoices i on i.sale_id = o.id and i.status <> 'void'
  where o.status in ('approved', 'paid')
    and (p_start_date is null or o.created_at >= p_start_date)
    and (p_end_date is null or o.created_at <= p_end_date)
    and (p_seller_uid is null or o.seller_uid = p_seller_uid)
  group by o.id, o.created_at, c.name, o.phone, i.invoice_code, i.invoice_number
  order by o.created_at desc;
$$;

-- ============================================================================
-- RPC: get_delivery_invoices
-- ============================================================================
-- Las facturas con envío del periodo, una por fila. Mismo criterio que
-- `get_delivery_summary`: entran todas, anuladas incluidas.
create or replace function get_delivery_invoices(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
) returns table (
  invoice_number text,
  delivery_fee numeric,
  delivery_name text,
  created_at timestamptz
) language sql security definer as $$
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

-- ============================================================================
-- RPC: get_expenses_by_pozo
-- ============================================================================
-- Suma `expenses.monto_cs` agrupado por pozo en un rango de fechas.
create or replace function get_expenses_by_pozo(
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
) returns table (
  pozo text,
  total_gastado numeric
) language sql security definer as $$
  select
    pozo,
    sum(monto_cs) as total_gastado
  from expenses
  where (p_start_date is null or created_at >= p_start_date)
    and (p_end_date is null or created_at <= p_end_date)
  group by pozo;
$$;

-- ============================================================================
-- Vista: sales_export_view
-- ============================================================================
-- Join plano de ventas para exportación (orders + order_items + invoices).
create or replace view sales_export_view as
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
-- RPC: redeem_discount_code
-- ============================================================================
-- Canje ATÓMICO: revalida todo, incrementa `used_count` y deja el rastro en
-- `discount_code_redemptions`, en una sola transacción implícita. El
-- `for update` serializa el acceso a la fila, así que dos pedidos concurrentes
-- nunca agotan de más un código de N usos.
--
-- Devuelve una fila `{ ok, err, r_* }` en vez de `raise exception` para que el
-- borde pueda dar un error de usuario limpio en lugar de un 500.
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
-- `search_path` fijo por la misma razón que set_updated_at: el bucle 0007 no la
-- alcanza (no es security definer) y sin esto el Advisor la marca como mutable.
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

  -- 1. Incrementar contador
  update discount_codes set used_count = used_count + 1 where code = v_code;

  -- 2. Registrar el canje
  insert into discount_code_redemptions (
    code, source, reference_id, reference_label, method, amount, redeemed_by
  ) values (
    v_row.code, p_source, p_reference_id, p_reference_label, p_method, p_amount, p_redeemed_by
  );

  return query select true, null::text, v_row.code, v_row.type, v_row.value;
end;
$$;

-- PostgREST cachea la firma de las funciones: sin esto el primer `db.rpc()`
-- responde "Could not find the function … in the schema cache".
notify pgrst, 'reload schema';

-- ============================================================================
-- Cierre de 0002_functions.sql
-- ============================================================================
-- ============================================================================
-- 0004 — sales_export_view: SECURITY INVOKER
-- ============================================================================
-- Fix de seguridad (Supabase Advisor: "Security Definer View", CRÍTICO).
--
-- En Postgres 15+ una vista corre, por defecto, con los permisos de su DUEÑO
-- (el rol `postgres`), que salta RLS. Eso significa que `sales_export_view`
-- expondría ventas/utilidades a cualquier rol con acceso a la vista (p. ej. un
-- JWT `authenticated` vía PostgREST), sin pasar por las políticas RLS de
-- `orders` / `order_items` / `invoices`.
--
-- `security_invoker = on` hace que la vista corra con los permisos de QUIEN la
-- consulta, respetando RLS. El backend usa la `service_role key` (ver
-- server/supabase.ts), que ignora RLS de todos modos, así que la exportación de
-- CSV sigue funcionando igual; lo que cambia es que un usuario normal ya no
-- puede leer la vista por fuera.
--
-- Idempotente: `alter view ... set` se puede reaplicar sin efecto.

alter view public.sales_export_view set (security_invoker = on);

-- Recargar el esquema de PostgREST para que tome el cambio.
notify pgrst, 'reload schema';
-- ============================================================================
-- 0005_analytics.sql — Telemetría propia del storefront
-- ============================================================================
-- Extiende el scaffold `analytics_events` (creado VACÍO en 0001) para soportar el
-- embudo completo: page_view · product_view · search · checkout_start ·
-- order_created. Se agregan columnas de PRIMERA CLASE (`session_id`, `path`) para
-- poder armar embudos por sesión y filtrar por ruta sin escarbar el jsonb en cada
-- query, más un CHECK que acota los tipos válidos (un evento con type fuera de la
-- lista es basura o un cliente viejo, y no debe entrar).
--
-- Idempotente a propósito (IF NOT EXISTS + DO-block para la constraint): puede
-- re-aplicarse sin romper. RLS ya quedó en deny-all desde el bucle de 0001, así
-- que la tabla sigue cerrada al cliente; solo el backend con service_role escribe.
--
-- NOTA de retención: los eventos crudos crecen sin techo. A la escala de la
-- tienda no es urgente, pero cuando lo sea, la purga va en un archivo nuevo
-- (p. ej. `delete from analytics_events where created_at < now() - interval '12 months'`)
-- o un rollup nocturno a una tabla agregada. Hoy los reportes consultan por rango
-- de fechas acotado, cubierto por los índices de abajo.

alter table analytics_events add column if not exists session_id text;
alter table analytics_events add column if not exists path text;

-- Tipos permitidos = el embudo completo. Fuera de esta lista no se persiste.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'analytics_events_type_check'
  ) then
    alter table analytics_events
      add constraint analytics_events_type_check
      check (type in ('page_view', 'product_view', 'search', 'checkout_start', 'order_created'));
  end if;
end $$;

-- Los reportes filtran por type + rango de fechas; el embudo agrupa por sesión.
-- El índice de (type) suelto ya existe de 0001; estos cubren los otros patrones.
create index if not exists analytics_events_created_at_idx on analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx on analytics_events (type, created_at desc);
create index if not exists analytics_events_session_id_idx on analytics_events (session_id);
-- ============================================================================
-- 0006_caja_extended.sql — Caja y Bancos: saldo inicial, traspasos y cierres
-- ============================================================================
-- Extiende el módulo de Caja para operar un negocio real:
--
--   1. `accounts.saldo_inicial` — el dinero con el que ARRANCA cada cuenta, para
--      que el saldo refleje la realidad sin inventar un movimiento "de apertura".
--
--   2. `account_movements.transfer_id` — liga las DOS patas de un traspaso entre
--      cuentas (egreso de una + ingreso de otra). Sin este vínculo, mover
--      efectivo al banco eran dos movimientos sueltos y si faltaba uno, los
--      saldos mentían.
--
--   3. `cash_closures` — el arqueo/cierre del día PERSISTIDO: lo que el sistema
--      esperaba vs lo que se contó físicamente, con la diferencia. El cuadre en
--      vivo no dejaba rastro; esto sí, para poder revisar cierres pasados.
--
-- Idempotente a propósito (IF NOT EXISTS): puede re-aplicarse sin romper. RLS de
-- las tablas de caja sigue en deny-all desde 0001; solo el backend con
-- service_role escribe.

-- ── 1. Saldo inicial por cuenta ──
alter table accounts
  add column if not exists saldo_inicial numeric(12,2) not null default 0;

-- ── 2. Vínculo de traspaso entre las dos patas del movimiento ──
alter table account_movements
  add column if not exists transfer_id uuid;

create index if not exists account_movements_transfer_id_idx
  on account_movements (transfer_id)
  where transfer_id is not null;

-- ── 3. Cierres de caja (arqueo) ──
-- `saldo_esperado` es una FOTO del saldo calculado al momento del cierre; se
-- guarda y no se recalcula, porque los movimientos posteriores no deben cambiar
-- lo que se contó esa noche. `diferencia = contado - esperado` (positiva =
-- sobrante, negativa = faltante). El backend, al cerrar, registra un movimiento
-- de ajuste por esa diferencia para que el saldo del libro quede igual al conteo
-- (el conteo físico manda); ese ajuste vive en account_movements, no acá.
create table if not exists cash_closures (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete restrict,
  fecha           date not null default (now() at time zone 'utc')::date,
  saldo_esperado  numeric(12,2) not null,
  saldo_contado   numeric(12,2) not null,
  diferencia      numeric(12,2) not null,
  notas           text,
  cerrado_por     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- Un cierre por cuenta y día: re-cerrar el mismo día SOBREESCRIBE (upsert),
  -- no acumula arqueos duplicados.
  unique (account_id, fecha)
);

create index if not exists cash_closures_fecha_idx on cash_closures (fecha desc);

-- RLS deny-all, igual que el resto de tablas internas (el bucle de 0001 solo
-- cubrió las tablas que existían entonces; esta es nueva y hay que cerrarla acá).
alter table cash_closures enable row level security;

-- Cierre de 0006_caja_extended.sql
-- ============================================================================
-- Gyro Store v2 · 0007 · search_path fijo en funciones SECURITY DEFINER
-- ============================================================================
-- Las 9 funciones de reportería en 0002_functions.sql son `security definer`
-- a propósito (leen tablas con RLS deny-all), pero ninguna fijaba `search_path`.
-- Es el hallazgo #1 que el Advisor de Supabase marca como "Function Search
-- Path Mutable": sin un search_path fijo, una función SECURITY DEFINER
-- resuelve nombres sin schema (tablas, funciones) con el search_path de quien
-- LLAMA, no de quien la creó. Un rol con permiso de crear objetos en algún
-- schema del search_path podría sombrear un nombre y hacer que la función
-- ejecute código ajeno con los privilegios del dueño de la función.
--
-- En bucle y no una `alter function` por firma (mismo criterio que el bloque
-- de RLS/triggers de 0001): recorre TODAS las funciones `security definer` de
-- `public` por sistema, así una función de reportería nueva que se olvide de
-- fijar su search_path queda igual protegida al re-correr este archivo.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, pg_temp',
      r.proname, r.args
    );
  end loop;
end $$;
-- ============================================================================
-- 0008_invoice_seller.sql — Vendedor asignado a la factura
-- ============================================================================
-- Hasta acá una factura `unlinked` no tenía dueño: nacía anónima en Caja y
-- recién se sabía "de quién era" cuando alguien la vinculaba a una venta
-- (orders.seller_uid). Eso rompe el flujo real: Caja emite el ticket PARA un
-- vendedor específico, y ese vendedor necesita poder ver SUS facturas (para
-- copiar el número y registrar la venta) antes de que exista ningún vínculo.
--
-- `seller_uid` lo elige Caja al emitir (INVOICE-EDITOR, selector "Vendedor").
-- Nullable a propósito: una factura sin vendedor asignado sigue siendo válida
-- (ticket genérico de mostrador), solo que nadie la verá en su "Mis Facturas".
--
-- Idempotente (IF NOT EXISTS): puede re-aplicarse sin romper. RLS ya queda en
-- deny-all desde el bucle de 0001.
-- ============================================================================

alter table invoices
  add column if not exists seller_uid uuid references profiles(id) on delete set null;

create index if not exists invoices_seller_uid_idx on invoices (seller_uid);
-- ============================================================================
-- 0009_pending_role_grants.sql — Roles reservados para gente que aún no inició sesión
-- ============================================================================
-- El bug de fondo: "Personal → Agregar usuario" creaba una identidad de
-- Supabase Auth con email+contraseña random (`auth.admin.createUser`) para
-- poder tener una fila en `profiles` de inmediato. Pero el login real del
-- staff SIEMPRE es por Microsoft/Azure (doc 03), y Azure —al ser un proveedor
-- distinto— genera SU PROPIA identidad de Auth, con otro `id`, aunque el
-- correo sea el mismo. Cuando esa persona entraba por primera vez, el
-- auto-registro de `middleware/auth.ts` intentaba insertar OTRA fila en
-- `profiles` con ese correo, chocaba contra el `unique` de `profiles.email` (ya
-- ocupado por la identidad fantasma), fallaba, y la persona quedaba sin
-- perfil → sin roles → "Esta cuenta no tiene permisos asignados." para
-- siempre, aunque un admin ya le hubiera asignado un rol.
--
-- La corrección: dejar de pre-crear una identidad de Auth. En su lugar, el
-- rol elegido se reserva ACÁ, por correo (sin FK a `auth.users`, porque esa
-- fila todavía no existe). Cuando la persona entra de verdad por primera vez,
-- `middleware/auth.ts` consume esta fila (le copia los roles a su perfil
-- recién creado) y la borra — mismo criterio que un código de invitación de
-- un solo uso.
-- ============================================================================

create table if not exists pending_role_grants (
  email       text primary key,
  -- Nombre tipeado por el admin al reservar el rol: solo para reconocerlo en
  -- la lista de Personal antes de que la persona haya iniciado sesión (su
  -- nombre REAL, el de `user_metadata` de Azure, lo pisa en cuanto entra).
  name        text,
  roles       app_role[] not null default '{}',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Tabla nueva por fuera del baseline: el bucle de RLS de 0001 solo corre en
-- una instalación limpia, así que acá se activa a mano, deny-all igual que el
-- resto de `public`.
alter table pending_role_grants enable row level security;
-- ============================================================================
-- 0010_spo_outbox.sql — Archivo de comprobantes en SharePoint Online (outbox)
-- ============================================================================
-- Cada venta APROBADA genera un comprobante PDF que se archiva en una biblioteca
-- de SharePoint, en la carpeta de su semana ISO de aprobación (la misma clave que
-- `orders.week_of` usa para agrupar pagos de comisión).
--
-- SharePoint guarda DOCUMENTOS, no datos: los datos de la venta ya viven en
-- Postgres, que es la fuente de verdad, y nada crítico se lee de allá. La columna
-- `comprobante_url` de esta tabla es el único vínculo entre los dos lados — para
-- llegar al comprobante de una venta se consulta acá por `order_id`.
--
-- ── Por qué una tabla y no un fetch dentro de approveSale ──
-- Aprobar una venta consume reservas de stock y congela el snapshot financiero
-- de cada línea (doc 11 §4). Colgar de esa transacción una llamada HTTP a
-- Microsoft Graph significa que un token vencido, un 429 o un corte de red
-- dejarían la aprobación a medias — o peor: aprobada en Postgres y explotando en
-- la cara del vendedor. Con el patrón OUTBOX, `approveSale` solo escribe una fila
-- acá (barata, local, en la misma base) y un worker en segundo plano la drena
-- contra Graph. Si Graph está caído, la fila espera; cuando vuelve, se sincroniza
-- sola. Cero pérdida.
--
-- ── Backfill gratis ──
-- Mientras Microsoft no esté configurado (falta el app registration, el secreto o
-- los ids del sitio), el worker es un no-op y las filas se acumulan en `pending`.
-- El día que se carguen las credenciales, el backlog entero se sincroniza solo:
-- no hay que salir a recuperar las ventas de los días anteriores a mano.
-- ============================================================================

create table if not exists spo_outbox (
  id               uuid primary key default gen_random_uuid(),

  -- UNIQUE = idempotencia. Una venta se puede re-aprobar (editar una venta ya
  -- aprobada la vuelve a pasar por `approveSale`, ver services/sales.ts), y sin
  -- esta restricción cada re-aprobación encolaría otra fila. El encolado usa
  -- ON CONFLICT DO NOTHING.
  order_id         uuid not null unique references orders(id) on delete cascade,

  -- pending → el worker todavía no subió el comprobante (o falló y reintentará)
  -- synced  → el PDF está en la biblioteca (`comprobante_url` lo prueba)
  -- error   → se agotaron los reintentos; queda para revisión manual
  status           text not null default 'pending'
                     check (status in ('pending', 'synced', 'error')),

  attempts         int not null default 0,
  last_error       text,

  -- URL (webUrl) del PDF en la biblioteca. Es el resultado del trabajo Y la
  -- defensa contra repetirlo: si una fila volviera a `pending` por un error
  -- posterior, el worker ve que ya hay URL y no vuelve a generar ni subir nada.
  -- Es también el enlace que se usa para abrir el comprobante de una venta.
  comprobante_url  text,

  created_at       timestamptz not null default now(),
  synced_at        timestamptz
);

-- El worker pide siempre lo mismo: pendientes, más viejas primero. El índice es
-- parcial porque las filas ya sincronizadas —que con el tiempo son casi todas—
-- no se consultan nunca por este camino y solo engordarían el índice.
create index if not exists spo_outbox_pending_idx
  on spo_outbox (created_at)
  where status = 'pending';

-- Tabla interna: solo el backend con service_role escribe y lee. RLS deny-all
-- explícito porque el bucle de 0001 solo cubrió las tablas que existían entonces
-- (mismo criterio que 0006 y 0009).
alter table spo_outbox enable row level security;
-- Link de SharePoint por producto
--
-- Cada producto puede apuntar a una biblioteca de SharePoint Online con las
-- fotos y videos del artículo. Lo edita el admin y lo abre el vendedor desde el
-- catálogo en modo lectura; NO se expone en el storefront público.
alter table catalog_items
  add column if not exists spo_link text;


-- ============================================================================
-- Cierre: recarga del caché de PostgREST
-- ============================================================================
-- Va acá, al FINAL de todo. Hay otros dos `notify` más arriba (heredados de
-- cuando esto eran archivos sueltos, cada uno con el suyo), pero al consolidar
-- quedaron a mitad de camino: todo lo que se crea después de ellos —las tablas
-- de caja, `pending_role_grants`, `spo_outbox`, `catalog_items.spo_link`— no
-- entraría en ese caché. PostgREST termina enterándose solo, pero mientras tanto
-- el primer request contra esas tablas responde "Could not find the table in the
-- schema cache", que es un error desconcertante en una instalación recién hecha.
notify pgrst, 'reload schema';
