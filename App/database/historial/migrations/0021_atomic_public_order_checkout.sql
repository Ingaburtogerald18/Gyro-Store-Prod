-- Ejecutar antes de desplegar el checkout actualizado. Incluye la columna de 0019.
-- Solo agrega columnas/una tabla/funciones. No modifica pedidos históricos.
begin;

alter table public.public_order_items
  add column if not exists variant_name text,
  add column if not exists product_name text,
  add column if not exists product_image text;

create table if not exists public.public_order_attempts (
  idempotency_key uuid primary key,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  public_order_id uuid references public.public_orders(id) on delete set null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.public_order_attempts enable row level security;
revoke all on public.public_order_attempts from public, anon, authenticated;
grant all on public.public_order_attempts to service_role;

-- Mismo bloqueo que el registro: una recuperación espera al commit en curso.
create or replace function public.recover_public_order_attempt(p_key uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_attempt public.public_order_attempts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public-order:' || p_key::text, 0));
  select * into v_attempt from public.public_order_attempts where idempotency_key = p_key;
  if not found then return null; end if;
  return jsonb_build_object('requestHash', v_attempt.request_hash, 'response', v_attempt.response);
end;
$$;

create or replace function public.register_public_order_attempt(
  p_key uuid, p_request_hash text, p_header jsonb, p_items jsonb, p_response jsonb
)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_attempt public.public_order_attempts%rowtype;
  v_id uuid := (p_header->>'id')::uuid;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_code text := nullif(p_header->>'discount_code', '');
  v_coupon public.discount_codes%rowtype;
  v_redeem record;
begin
  if p_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message = 'Intento inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public-order:' || p_key::text, 0));
  select * into v_attempt from public.public_order_attempts where idempotency_key = p_key;
  if found then
    if v_attempt.request_hash <> p_request_hash then
      raise sqlstate 'PT409' using message = 'Este intento corresponde a otro pedido.';
    end if;
    return jsonb_build_object('response', v_attempt.response, 'replayed', true);
  end if;
  if v_id is null or p_response->>'id' is distinct from v_id::text
     or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise sqlstate 'PT400' using message = 'Pedido inválido.';
  end if;
  select round(sum(quantity * precio_unit), 2) into v_subtotal
    from jsonb_to_recordset(p_items) as i(quantity integer, precio_unit numeric);
  if v_subtotal is null or v_subtotal < 0 then
    raise sqlstate 'PT400' using message = 'Importes inválidos.';
  end if;
  -- Verificar el cupón bajo bloqueo; el canje y el pedido se revierten juntos.
  if v_code is not null then
    select * into v_coupon from public.discount_codes where code = v_code for update;
    if not found then raise sqlstate 'PT400' using message = 'Código inválido.'; end if;
    v_discount := round(case when v_coupon.type::text = 'percent'
      then v_subtotal * v_coupon.value / 100
      else least(v_coupon.value, v_subtotal) end, 2);
    v_discount := greatest(0, least(v_discount, v_subtotal));
  end if;
  if (p_header->>'total')::numeric is distinct from v_subtotal - v_discount
     or (p_header->>'code_discount')::numeric is distinct from v_discount
     or (p_response->>'total')::numeric is distinct from v_subtotal - v_discount then
    raise sqlstate 'PT409' using message = 'Cambió el descuento del código. Revisalo antes de continuar.';
  end if;
  insert into public.public_orders (
    id, contact_id, phone, customer_name, delivery_method, address, location_url,
    note, total, status, discount_code, code_discount
  ) values (
    v_id, (p_header->>'contact_id')::uuid, p_header->>'phone', p_header->>'customer_name',
    p_header->>'delivery_method', p_header->>'address', p_header->>'location_url',
    p_header->>'note', v_subtotal - v_discount, 'new', v_code, v_discount
  );
  insert into public.public_order_items (
    public_order_id, sku, quantity, precio_unit, variant_name, product_name, product_image
  )
  select v_id, i.sku, i.quantity, i.precio_unit, i.variant_name, i.product_name, i.product_image
    from jsonb_to_recordset(p_items) as i(
      sku text, quantity integer, precio_unit numeric, variant_name text, product_name text, product_image text
    );
  if v_code is not null then
    select * into v_redeem from public.redeem_discount_code(
      v_code, 'checkout'::public.redemption_source, v_id, 'Pedido web',
      null::public.payment_method, v_discount, null::text
    );
    if not coalesce(v_redeem.ok, false) then
      raise sqlstate 'PT400' using message = coalesce(v_redeem.err, 'No se pudo canjear el código.');
    end if;
  end if;
  insert into public.public_order_attempts (idempotency_key, request_hash, public_order_id, response)
    values (p_key, p_request_hash, v_id, p_response);
  return jsonb_build_object('response', p_response, 'replayed', false);
end;
$$;

-- INVOKER: sin elevar permisos. Solo el backend service_role puede llamarlas.
revoke all on function public.recover_public_order_attempt(uuid) from public, anon, authenticated;
revoke all on function public.register_public_order_attempt(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.recover_public_order_attempt(uuid) to service_role;
grant execute on function public.register_public_order_attempt(uuid,text,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
