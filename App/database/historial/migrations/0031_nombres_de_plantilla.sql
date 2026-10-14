-- Evita nuevos nombres duplicados sin fusionar las plantillas antiguas.
-- Aplicar después de 0030; el control del formulario y del servidor funciona sin esta migración.
begin;

create or replace function public.template_model_key(model_name text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(model_name, ''), '[[:space:]_–—-]+', '', 'g')), '');
$$;

create index if not exists templates_model_key_idx
  on public.templates (public.template_model_key(name));

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

drop trigger if exists templates_model_name_unique on public.templates;
create trigger templates_model_name_unique
  before insert or update of name on public.templates
  for each row execute function public.check_template_model_name();

revoke execute on function public.template_model_key(text) from public, anon, authenticated;
revoke execute on function public.check_template_model_name() from public, anon, authenticated;
grant execute on function public.template_model_key(text) to service_role;
grant execute on function public.check_template_model_name() to service_role;

commit;
notify pgrst, 'reload schema';
