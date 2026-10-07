-- ============================================================================
-- 0022_inventory_catalog_link.sql
-- ⚠️ Preparada, NO aplicada. Correrla en el SQL Editor de Supabase cuando el
-- dueño lo apruebe. El servidor funciona igual sin ella (lee como antes); con
-- ella se activa lo nuevo.
--
-- 1) Cada lote de compra sabe a qué producto y variante del catálogo
--    pertenece (catalog_item_id + variant_key). Hasta ahora el único vínculo
--    era la lista de códigos que se cargaba a mano en el editor de Catálogo, y
--    cada recompra quedaba invisible en la tienda hasta vincularla.
--    `variant_key` es la misma llave que `catalog_items.variant_mappings`
--    ("Negro / Con micrófono"); '' en productos sin variantes.
-- 2) Las reservas de stock pueden ser de un pedido web (public_order_id), no
--    solo de una venta del panel (order_id): un pedido web confirmado aparta
--    sus unidades hasta que se entrega o se cancela.
--
-- Solo agrega columnas e índices y completa el vínculo de los lotes que ya
-- estaban vinculados en Catálogo. No borra ni cambia nada más.
-- ============================================================================
begin;

alter table public.purchases
  add column if not exists catalog_item_id uuid references public.catalog_items(id) on delete set null,
  add column if not exists variant_key text;

create index if not exists purchases_catalog_variant_idx
  on public.purchases (catalog_item_id, variant_key);

alter table public.stock_reservations
  add column if not exists public_order_id uuid references public.public_orders(id) on delete cascade;

create index if not exists stock_reservations_public_order_id_idx
  on public.stock_reservations (public_order_id);

-- Backfill: cada código vinculado hoy en el editor de Catálogo pasa a su lote.
-- Solo los códigos vinculados a UNA sola variante; los que aparecen en dos se
-- dejan como están y salen en la consulta de verificación de abajo.
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

commit;

-- PostgREST cachea el esquema: sin esto el primer uso de las columnas nuevas
-- puede responder "Could not find the column".
notify pgrst, 'reload schema';

-- Verificación (solo lectura):
-- 1. Lotes vinculados después del backfill:
--    select count(*) filter (where catalog_item_id is not null) as vinculados, count(*) as total from purchases;
-- 2. Códigos vinculados a más de una variante (quedaron sin vincular, revisarlos a mano):
--    select c.code, count(*) from (
--      select jsonb_array_elements_text(m.value -> 'codes') as code
--      from catalog_items ci, jsonb_each(ci.variant_mappings) m
--      where jsonb_typeof(m.value -> 'codes') = 'array'
--    ) c group by c.code having count(*) > 1;
--
-- Reversión (si hiciera falta):
--   alter table stock_reservations drop column public_order_id;
--   alter table purchases drop column variant_key, drop column catalog_item_id;
