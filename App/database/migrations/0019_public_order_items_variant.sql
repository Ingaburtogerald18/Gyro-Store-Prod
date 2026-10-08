-- ============================================================================
-- 0019_public_order_items_variant.sql
-- ⚠️ Preparada, NO aplicada. Correrla en el SQL Editor de Supabase cuando el
-- dueño lo apruebe (primero en un proyecto de prueba si existe).
--
-- Guarda en cada línea del pedido web QUÉ combinación eligió el cliente
-- ("Negro / Con micrófono"). Hasta ahora la variante solo viajaba en el mensaje
-- de WhatsApp: el panel y el seguimiento no podían mostrarla.
--
-- Compatible hacia atrás y hacia adelante:
--   · Columna nullable: los pedidos históricos quedan con NULL y se leen igual.
--   · `sku` NO cambia: sigue siendo el id del catalog_item (o `combo:<id>`),
--     que es como lo interpretan el panel y el seguimiento.
--   · Las lecturas históricas toleran que la columna falte. Para registrar
--     pedidos nuevos, el servidor requiere 0021_atomic_public_order_checkout.sql,
--     que incluye esta columna y evita perder la variante al guardar.
--
-- El precio aplicado ya se guardaba en `precio_unit`.
-- ============================================================================

alter table public_order_items
  add column if not exists variant_name text;

comment on column public_order_items.variant_name is
  'Combinación elegida (opciones unidas con " / ", misma llave que catalog_items.variant_mappings). NULL en pedidos previos a 0019 y en combos.';

-- PostgREST cachea el esquema: sin esto el primer insert con la columna nueva
-- puede responder "Could not find the 'variant_name' column".
notify pgrst, 'reload schema';

-- Verificación (solo lectura):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'public_order_items' and column_name = 'variant_name';
--
-- Reversión (si hiciera falta): alter table public_order_items drop column variant_name;
