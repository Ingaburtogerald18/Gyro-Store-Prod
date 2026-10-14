-- 0033_texto_de_categorias_y_marca.sql
--
-- Texto propio de cada categoría (se muestra debajo del título de /categoria/<slug> y es su descripción
-- para los buscadores) y la marca de cada plantilla (ficha técnica y datos estructurados del producto).
--
-- Solo agrega columnas con valor por defecto: el código anterior sigue funcionando con la base migrada,
-- así que se corre ANTES de publicar el código que la usa. Se puede correr dos veces.

alter table public.categories
  add column if not exists description text not null default '';

alter table public.templates
  add column if not exists brand text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_description_length') then
    alter table public.categories
      add constraint categories_description_length check (char_length(description) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'templates_brand_length') then
    alter table public.templates
      add constraint templates_brand_length check (char_length(brand) <= 60);
  end if;
end $$;
