-- Agrega columnas opcionales para registrar gastos en USD con conversión automática.
-- monto_usd: monto original en dólares (NULL si fue registrado en córdobas)
-- exchange_rate: tasa de cambio usada para la conversión (NULL si fue en córdobas)

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS monto_usd     numeric(12,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate  numeric(8,4)   DEFAULT NULL;
