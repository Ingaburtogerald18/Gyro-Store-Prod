-- ============================================================================
-- 0015_expenses_salario_pozo.sql
-- Permite registrar gastos operativos contra el pozo virtual de salario
-- ============================================================================

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_pozo_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_pozo_check CHECK (
  pozo IN (
    'publicidad',
    'mantenimiento',
    'utiles',
    'garantias',
    'prestamos',
    'suscripciones',
    'servicios',
    'salario'
  )
);
