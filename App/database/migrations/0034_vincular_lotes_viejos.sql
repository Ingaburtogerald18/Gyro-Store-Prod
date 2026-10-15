-- 0034_vincular_lotes_viejos.sql
--
-- Vincula a su plantilla y variante los lotes viejos que la tienda no ve (sin catalog_item_id ni
-- código en variant_mappings). La plantilla y la variante se leen del nombre del lote,
-- «Modelo | opción | opción», y solo se vincula cuando no hay dudas: plantilla del mismo modelo,
-- una opción por cada eje y como mucho un producto. Si la plantilla no tiene producto, se crea sin
-- publicar, como al cargar una orden.
--
-- No cambia product_name: Ventas busca el lote por ese nombre para descontar y devolver.
-- Solo datos, sin cambios de esquema. Necesita el OK del dueño. Se puede correr más de una vez: la
-- segunda vuelta solo toma los lotes que sigan sueltos. Al final lista qué vinculó y qué quedó.

begin;

drop table if exists vinculo_0034;
create temp table vinculo_0034 on commit preserve rows as
with
ejes_crudos as (
  select t.id as template_id, e.ord as pos, coalesce(e.val->>'key', '') as axis_key,
         coalesce(e.val->>'label', e.val->>'key') as label,
         coalesce((select array_agg(o order by oi)
                   from jsonb_array_elements_text(case when jsonb_typeof(e.val->'options') = 'array' then e.val->'options' else '[]'::jsonb end)
                        with ordinality as x(o, oi)), '{}') as options
  from templates t
  cross join lateral jsonb_array_elements(case when jsonb_typeof(t.axes) = 'array' then t.axes else '[]'::jsonb end)
       with ordinality as e(val, ord)
  where jsonb_typeof(e.val) = 'object' and coalesce(e.val->>'key', '') <> ''
  union all
  select t.id, e.ord, e.k, e.k,
         coalesce((select array_agg(o order by oi)
                   from jsonb_array_elements_text(case when jsonb_typeof(e.val) = 'array' then e.val else '[]'::jsonb end)
                        with ordinality as x(o, oi)), '{}')
  from templates t
  cross join lateral jsonb_each(case when jsonb_typeof(t.axes) = 'object' then t.axes else '{}'::jsonb end)
       with ordinality as e(k, val, ord)
),
ejes as (
  select template_id, row_number() over (partition by template_id order by pos) as pos, axis_key, label, options
  from ejes_crudos
),
mapeados as (
  select distinct c.code
  from catalog_items ci
  cross join lateral jsonb_each(case when jsonb_typeof(ci.variant_mappings) = 'object' then ci.variant_mappings else '{}'::jsonb end) m
  cross join lateral (
    select jsonb_array_elements_text(case when jsonb_typeof(m.value->'codes') = 'array' then m.value->'codes' else '[]'::jsonb end)
    union
    select jsonb_array_elements_text(case when jsonb_typeof(m.value->'skus') = 'array' then m.value->'skus' else '[]'::jsonb end)
    union
    select m.value->>'sku' where coalesce(m.value->>'sku', '') <> ''
  ) c(code)
  where jsonb_typeof(m.value) = 'object'
),
sueltos as (
  select p.id, p.code, p.product_name,
         (select array_agg(trim(x) order by i) from unnest(string_to_array(p.product_name, '|')) with ordinality as u(x, i)) as partes
  from purchases p
  where p.catalog_item_id is null and not exists (select 1 from mapeados m where m.code = p.code)
),
clave_t as (
  select t.id, t.name, t.category_id, lower(regexp_replace(coalesce(t.name, ''), '[[:space:]_–—-]+', '', 'g')) as k
  from templates t
),
exacta as (
  select s.id as lote_id, c.id as template_id, c.name, c.category_id,
         count(*) over (partition by s.id) as n_plantillas
  from sueltos s
  join clave_t c on c.k <> '' and c.k = lower(regexp_replace(s.partes[1], '[[:space:]_–—-]+', '', 'g'))
),
opcion_por_eje as (
  select x.lote_id, e.pos, e.axis_key, e.label,
         (select array_agg(o) from unnest(e.options) o
           where lower(regexp_replace(o, '[[:space:]]+', '', 'g')) in
                 (select lower(regexp_replace(pt, '[[:space:]]+', '', 'g')) from unnest(s.partes[2:]) pt)) as hallados
  from exacta x
  join sueltos s on s.id = x.lote_id
  join ejes e on e.template_id = x.template_id
),
variante as (
  select x.lote_id,
         count(e.pos) as n_ejes,
         count(*) filter (where cardinality(e.hallados) = 1) as ejes_resueltos,
         coalesce(string_agg(e.hallados[1], ' / ' order by e.pos) filter (where cardinality(e.hallados) = 1), '') as variant_key,
         coalesce(jsonb_object_agg(e.axis_key, e.hallados[1]) filter (where cardinality(e.hallados) = 1), '{}'::jsonb) as elegidas,
         string_agg(e.label || case when e.hallados is null then ' sin opción' else ' ambiguo' end, ', ' order by e.pos)
           filter (where e.pos is not null and coalesce(cardinality(e.hallados), 0) <> 1) as faltan
  from exacta x
  left join opcion_por_eje e on e.lote_id = x.lote_id
  group by x.lote_id
),
productos as (
  select ci.template_id, count(*) as n, (array_agg(ci.id))[1] as unico_id
  from catalog_items ci where ci.template_id is not null
  group by ci.template_id
)
select s.id as purchase_id, s.code, s.product_name,
       x.template_id, x.name as plantilla, x.category_id,
       v.variant_key, v.elegidas,
       case when coalesce(pr.n, 0) = 1 then pr.unico_id end as catalog_item_id,
       case
         when x.template_id is null then 'No hay plantilla de este modelo'
         when x.n_plantillas > 1 then 'Hay varias plantillas de este modelo'
         when v.ejes_resueltos < v.n_ejes then 'Elegir a mano: ' || v.faltan
         when coalesce(pr.n, 0) > 1 then 'La plantilla tiene varios productos'
         when coalesce(pr.n, 0) = 0 and x.category_id is null then 'La plantilla no tiene categoría'
         else null
       end as pendiente
from sueltos s
left join exacta x on x.lote_id = s.id
left join variante v on v.lote_id = s.id
left join productos pr on pr.template_id = x.template_id;

do $$
declare
  r record;
  item_id uuid;
  opciones jsonb;
  eje record;
  actual jsonb;
  elegida text;
begin
  for r in select * from vinculo_0034 where pendiente is null order by template_id, code loop
    item_id := r.catalog_item_id;

    -- El producto que se creó para otro lote de la misma plantilla en esta vuelta.
    if item_id is null then
      select id into item_id from catalog_items where template_id = r.template_id limit 1;
    end if;
    if item_id is null then
      insert into catalog_items (template_id, name, category_id, published, sort_order)
      values (r.template_id, coalesce(nullif(trim(r.plantilla), ''), 'Sin nombre'), r.category_id, false,
              coalesce((select max(sort_order) from catalog_items), 0) + 1)
      returning id into item_id;
    end if;

    -- Si el producto recorta opciones, se suma la del lote para que la tienda la muestre.
    select coalesce(axis_options, '{}'::jsonb) into opciones from catalog_items where id = item_id;
    if jsonb_typeof(opciones) <> 'object' then opciones := '{}'::jsonb; end if;
    for eje in
      select e.val->>'key' as axis_key, e.val->'options' as options
      from templates t, jsonb_array_elements(case when jsonb_typeof(t.axes) = 'array' then t.axes else '[]'::jsonb end) e(val)
      where t.id = r.template_id and jsonb_typeof(e.val) = 'object'
      union all
      select e.key, e.value
      from templates t, jsonb_each(case when jsonb_typeof(t.axes) = 'object' then t.axes else '{}'::jsonb end) e
      where t.id = r.template_id
    loop
      elegida := r.elegidas->>eje.axis_key;
      actual := opciones->eje.axis_key;
      if elegida is null or actual is null or jsonb_typeof(actual) <> 'array'
         or jsonb_array_length(actual) = 0 or actual ? elegida then
        continue;
      end if;
      opciones := jsonb_set(opciones, array[eje.axis_key],
        (select coalesce(jsonb_agg(o), '[]'::jsonb)
         from jsonb_array_elements_text(case when jsonb_typeof(eje.options) = 'array' then eje.options else '[]'::jsonb end) o
          where actual ? o or o = elegida));
    end loop;
    update catalog_items set axis_options = opciones
     where id = item_id and coalesce(axis_options, '{}'::jsonb) is distinct from opciones;

    update purchases set catalog_item_id = item_id, variant_key = r.variant_key
     where id = r.purchase_id and catalog_item_id is null;

    insert into audit_logs (entity, entity_id, action, reason, before, after)
    values ('purchases', r.purchase_id, 'link', 'Migración 0034: lote viejo vinculado a su plantilla',
            jsonb_build_object('catalog_item_id', null, 'variant_key', null),
            jsonb_build_object('catalog_item_id', item_id, 'variant_key', r.variant_key, 'template_id', r.template_id));
  end loop;
end $$;

commit;

-- Resultado: qué se vinculó y qué queda para hacer a mano.
select v.code as lote, v.product_name as nombre_del_lote,
       case when v.pendiente is null then 'Vinculado' else 'Sin vincular' end as resultado,
       v.plantilla, nullif(v.variant_key, '') as variante,
       ci.name || case when ci.published then '' else ' (sin publicar)' end as producto,
       v.pendiente as que_falta
from vinculo_0034 v
left join purchases p on p.id = v.purchase_id
left join catalog_items ci on ci.id = p.catalog_item_id
order by (v.pendiente is null), v.product_name, v.code;
