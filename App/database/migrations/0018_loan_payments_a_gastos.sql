-- ============================================================================
-- 0018_loan_payments_a_gastos.sql
-- ⚠️ NO CORRER sin la aprobación del dueño. Ver Docs/03-Finanzas.md §13.
--
-- Mueve cada pago de `loan_payments` a `expenses` como gasto del pozo
-- Préstamos. No borra `loan_payments`: eso va en un paso aparte, cuando el
-- código ya no la lea.
-- ============================================================================

-- 0) Vista previa (solo lectura): qué se movería.
-- select id, monto_cs, monto_usd, exchange_rate, fecha, nota, created_at
-- from loan_payments
-- where not exists (
--   select 1 from expenses e where e.description like '%[loan_payment:' || loan_payments.id || ']%'
-- )
-- order by fecha;

begin;

insert into expenses (pozo, monto_cs, monto_usd, exchange_rate, category, description, created_by, created_at)
select
  'prestamos',
  lp.monto_cs,
  lp.monto_usd,
  lp.exchange_rate,
  'Pago de préstamo',
  btrim(coalesce(lp.nota, '') || ' [loan_payment:' || lp.id || ']'),
  lp.created_by,
  -- 12:00 de Nicaragua (UTC−6) del día del pago: no cambia de mes por zona horaria.
  (lp.fecha::timestamp + interval '12 hours') at time zone 'America/Managua'
from loan_payments lp
where not exists (
  select 1 from expenses e where e.description like '%[loan_payment:' || lp.id || ']%'
);

-- Chequeo: lo migrado tiene que sumar lo mismo que loan_payments.
do $$
declare
  v_origen numeric;
  v_migrado numeric;
begin
  select coalesce(sum(monto_cs), 0) into v_origen from loan_payments;
  select coalesce(sum(monto_cs), 0) into v_migrado from expenses where description like '%[loan_payment:%]%';
  if v_origen <> v_migrado then
    raise exception 'Totales no coinciden: loan_payments % vs migrado %', v_origen, v_migrado;
  end if;
end $$;

commit;
