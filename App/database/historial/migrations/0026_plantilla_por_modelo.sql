-- ============================================================================
-- 0026_plantilla_por_modelo.sql — La plantilla separa lo que ve la tienda de la nota interna
-- ============================================================================
-- ⚠️ Correrla en el SQL Editor de Supabase solo con el OK del dueño. Va
-- después de 0025, en una sola transacción y se puede correr más de una vez.
--
-- Hasta ahora `templates.description` era la «Nota interna». Desde esta etapa
-- es la descripción que muestra la tienda, y la nota pasa a `internal_note`.
-- La primera vez que corre, mueve lo escrito en la descripción a la nota y
-- deja la descripción vacía, para que nada interno se publique. Si se vuelve
-- a correr no mueve nada (la columna ya existe).
-- ============================================================================

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'templates' and column_name = 'internal_note'
  ) then
    alter table public.templates add column internal_note text not null default '';
    update public.templates
       set internal_note = description,
           description = ''
     where coalesce(description, '') <> '';
  end if;
end $$;

comment on column public.templates.description is 'Descripción del modelo que muestra la tienda.';
comment on column public.templates.internal_note is 'Nota interna del modelo. No se publica.';

commit;

-- Verificación: "Todo en orden" o qué falta.
with problemas as (
  select 'Falta la columna' as problema, 'templates.internal_note' as detalle
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'templates' and column_name = 'internal_note'
  )
)
select problema, detalle from problemas
union all
select 'Todo en orden',
       (select count(*) from public.templates where internal_note <> '') || ' plantillas con nota interna; '
       || (select count(*) from public.templates where coalesce(description, '') <> '') || ' con descripción para la tienda.'
where not exists (select 1 from problemas);
