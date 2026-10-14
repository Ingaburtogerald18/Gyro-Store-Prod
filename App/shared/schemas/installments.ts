import { z } from 'zod';

// Mismo modelo delgado que facturación: el plan de cuotas envuelve una venta
// YA aprobada (server/modules/sales/sales.ts) — no repite FIFO ni comisión, solo
// agenda el cobro. `total` sale de `orders.total`, no lo manda el cliente.
export const createInstallmentPlanInputSchema = z.object({
  orderId: z.uuid(),
  numCuotas: z.number().int().min(2, 'Mínimo 2 cuotas.').max(36),
  firstDue: z.iso.date(),
});
export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanInputSchema>;

export const registerInstallmentPaymentInputSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0.'),
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']).optional(),
  note: z.string().max(300).optional(),
});
export type RegisterInstallmentPaymentInput = z.infer<typeof registerInstallmentPaymentInputSchema>;
