-- 0032_entregas_y_pagos_de_pedidos.sql
--
-- Pedidos web: entrega en Managua, por Cargo Trans o retiro; pago del producto y del transporte por
-- separado; referencia de Cargo Trans y fecha real de recepción (inicio de la garantía). Analítica:
-- los clics en «Agregar al carrito» y la apertura de WhatsApp.
--
-- Solo agrega valores y columnas opcionales: el código anterior sigue funcionando con la base migrada,
-- así que se corre ANTES de publicar el código que la usa. Se puede correr dos veces.

-- 1. Modalidad de entrega. 'envio' queda para los pedidos anteriores, que no distinguían Managua del
--    resto del país. La restricción vieja no tiene nombre propio: se busca por su definición.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.public_orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%delivery_method%'
  loop
    execute format('alter table public.public_orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.public_orders
  add constraint public_orders_delivery_method_check
  check (delivery_method in ('retiro', 'envio', 'managua', 'cargo_trans'));

-- 2. Operación del pedido, solo para el panel. El pago del producto no implica el del transporte, y
--    ninguna fecha se deduce de otra: cada una la registra el personal (con rastro en audit_logs).
alter table public.public_orders
  add column if not exists shipping_quote     numeric(12,2) check (shipping_quote is null or shipping_quote >= 0),
  add column if not exists product_paid_date  date,
  add column if not exists shipping_paid_date date,
  add column if not exists carrier_reference  text,
  add column if not exists received_date      date;

-- 3. Analítica: abrir WhatsApp no es enviar el mensaje ni un pedido; se cuenta aparte.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.analytics_events'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%page_view%'
  loop
    execute format('alter table public.analytics_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.analytics_events
  add constraint analytics_events_type_check
  check (type in ('page_view', 'product_view', 'search', 'checkout_start', 'order_created', 'add_to_cart', 'whatsapp_open'));
