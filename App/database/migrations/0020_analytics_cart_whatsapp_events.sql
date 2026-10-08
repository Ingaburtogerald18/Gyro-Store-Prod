-- ============================================================================
-- 0020_analytics_cart_whatsapp_events.sql
-- ⚠️ Preparada, NO aplicada. Opcional: solo si se quiere medir «agregar al
-- carrito» y «abrir WhatsApp» con la analítica propia.
--
-- Hoy `analytics_events_type_check` acepta solo page_view, product_view,
-- search, checkout_start y order_created. Un evento de otro tipo haría fallar la
-- inserción del lote entero, así que el código NO emite eventos nuevos hasta que
-- esta migración esté aplicada y se agreguen los tipos en
-- App/shared/analytics.ts (ANALYTICS_EVENT_TYPES).
--
-- Semántica propuesta (datos mínimos, sin datos personales):
--   · add_to_cart   → { catalogItemId, quantity, source: 'ficha' | 'quick_add' | 'card' }
--   · whatsapp_open → { context: 'order' | 'consult' }  (abrir WhatsApp NO es
--                     mensaje enviado ni venta confirmada)
-- `order_created` sigue significando «pedido registrado».
-- ============================================================================

begin;

alter table analytics_events drop constraint if exists analytics_events_type_check;
alter table analytics_events
  add constraint analytics_events_type_check
  check (type in ('page_view', 'product_view', 'search', 'checkout_start', 'order_created', 'add_to_cart', 'whatsapp_open'));

commit;

-- Reversión: volver a la lista anterior (borrar antes los eventos nuevos si existen).
-- delete from analytics_events where type in ('add_to_cart', 'whatsapp_open');
-- alter table analytics_events drop constraint analytics_events_type_check;
-- alter table analytics_events add constraint analytics_events_type_check
--   check (type in ('page_view', 'product_view', 'search', 'checkout_start', 'order_created'));
