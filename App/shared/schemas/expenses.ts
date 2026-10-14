import { z } from 'zod';

// ── GASTOS OPERATIVOS Y POZOS (Reportería y Presupuestos) ──
export const POZOS_CON_SALARIO = [
  'publicidad',
  'mantenimiento',
  'utiles',
  'garantias',
  'prestamos',
  'suscripciones',
  'servicios',
  'salario',
] as const;
export type PozoConSalario = (typeof POZOS_CON_SALARIO)[number];

export const createExpenseInputSchema = z.object({
  pozo: z.enum([
    'publicidad',
    'mantenimiento',
    'utiles',
    'garantias',
    'prestamos',
    'suscripciones',
    'servicios',
    'salario',
  ]),
  monto: z.number().positive('El monto debe ser mayor a 0.'),
  moneda: z.enum(['COR', 'USD']).default('COR'),
  fecha: z.string().datetime().optional(),
  category: z.string().trim().min(1, 'La categoría es obligatoria.').max(60, 'Máximo 60 caracteres.'),
  description: z.string().trim().max(200, 'Máximo 200 caracteres.').optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;

// ── PAGOS DE PRÉSTAMOS (Deducciones directas de Ganancia Real) ──
export const loanPaymentSchema = z.object({
  id: z.string().uuid(),
  monto_cs: z.number().positive(),
  monto_usd: z.number().nullable().optional(),
  exchange_rate: z.number().nullable().optional(),
  fecha: z.string(),
  nota: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
});
export type LoanPayment = z.infer<typeof loanPaymentSchema>;
