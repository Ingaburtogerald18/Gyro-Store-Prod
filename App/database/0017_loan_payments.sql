-- ============================================================================
-- 0017_loan_payments.sql
-- Tabla para registrar pagos manuales de préstamos y deducirlos de la ganancia real
-- Soporta registro tanto en Córdobas (C$) como en Dólares (USD con tasa de cambio)
-- ============================================================================

CREATE TABLE IF NOT EXISTS loan_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monto_cs       numeric(12,2) NOT NULL CHECK (monto_cs > 0),
  monto_usd      numeric(12,2) DEFAULT NULL,
  exchange_rate  numeric(8,4)  DEFAULT NULL,
  fecha          date NOT NULL DEFAULT CURRENT_DATE,
  nota           text,
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Asegura que las columnas existan si la tabla ya había sido creada
ALTER TABLE loan_payments
  ADD COLUMN IF NOT EXISTS monto_usd     numeric(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(8,4)  DEFAULT NULL;

CREATE INDEX IF NOT EXISTS loan_payments_fecha_idx ON loan_payments (fecha);

-- Tabla administrativa: solo el backend con service_role escribe y lee
ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
