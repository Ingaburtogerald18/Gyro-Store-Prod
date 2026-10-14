-- ============================================================================
-- 0029_borrador_y_bloqueo.sql — Borrador compartido del modo edición y bloqueo
-- ============================================================================
-- ⚠️ Correrla en el SQL Editor de Supabase solo con el OK del dueño. Va
-- después de 0028, en una sola transacción y se puede correr más de una vez.
--
-- El borrador de la tienda deja de vivir en el navegador: una sola fila guarda
-- la portada (banners, navegación, secciones, carrito) y los cambios de
-- productos (fotos, «Mostrar en la tienda», orden), compartidos entre admins.
-- La misma fila lleva el bloqueo: un admin a la vez. Se libera al salir, a los
-- 15 minutos sin actividad o cuando el navegador deja de mandar el latido.
-- ============================================================================

begin;

create table if not exists public.store_draft (
  id                 text primary key default 'tienda' check (id = 'tienda'),
  landing            jsonb,
  products           jsonb not null default '{}',
  changed_at         timestamptz,
  changed_by         uuid references public.profiles(id) on delete set null,
  lock_holder        uuid references public.profiles(id) on delete set null,
  lock_session       uuid,
  lock_acquired_at   timestamptz,
  lock_heartbeat_at  timestamptz,
  lock_activity_at   timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.store_draft is 'Borrador compartido del modo edición (portada y productos) y quién lo está editando. Una sola fila.';

insert into public.store_draft (id) values ('tienda') on conflict (id) do nothing;

-- Mismo trato que el resto de las tablas (01_schema.sql, sección 13).
alter table public.store_draft enable row level security;
revoke all on public.store_draft from anon, authenticated;
grant all on public.store_draft to service_role;

drop trigger if exists store_draft_set_updated_at on public.store_draft;
create trigger store_draft_set_updated_at
  before update on public.store_draft
  for each row execute function public.set_updated_at();

commit;

notify pgrst, 'reload schema';

-- Verificación: "Todo en orden" o qué falta.
with problemas as (
  select 'Falta la tabla' as problema, 'store_draft' as detalle
  where to_regclass('public.store_draft') is null
  union all
  select 'Falta la fila', 'store_draft: tienda'
  where to_regclass('public.store_draft') is not null
    and not exists (select 1 from public.store_draft where id = 'tienda')
  union all
  select 'Falta RLS', 'store_draft'
  where exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'store_draft' and not rowsecurity
  )
)
select problema, detalle from problemas
union all
select 'Todo en orden', 'Borrador compartido y bloqueo del modo edición listos.'
where not exists (select 1 from problemas);
