-- ============================================================================
-- Migración 0015: Permitir 'salario' como pozo en la tabla expenses
-- ============================================================================
-- El salary (salario del vendedor) ya se calcula por venta en el sistema de
-- comisiones. Se incluye como un 8vo "pozo" virtual en la vista de gastos,
-- permitiendo asentar manualmente los pagos de salario en expenses.

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_pozo_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_pozo_check 
  CHECK (pozo IN ('publicidad','mantenimiento','utiles','garantias','prestamos','suscripciones','servicios','salario'));
