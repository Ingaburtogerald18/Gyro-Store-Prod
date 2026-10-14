import { z } from 'zod';

// El canje real, que gasta un uso, lo hace el servidor en una función atómica. `maxUses = 0` = ilimitado.
export const DISCOUNT_TYPES = ['percent', 'fixed'] as const;

// `code` no está en el input: lo genera la base con la secuencia `GS-DC-N`.
export const discountCodeSchema = z
  .object({
    type: z.enum(DISCOUNT_TYPES),
    value: z.number().positive('Debe ser mayor a 0'),
    maxUses: z.number().int().nonnegative().optional().default(1), // 0 = ilimitado
    expiresAt: z.string().optional().or(z.literal('')), // yyyy-mm-dd o vacío = sin vencimiento
    // En el panel se muestra como «Descripción»; la columna sigue siendo `note`.
    note: z.string().max(200).optional().default(''),
  })
  .refine((d) => d.type !== 'percent' || d.value <= 100, {
    message: 'Un descuento por porcentaje no puede superar 100%',
    path: ['value'],
  });
export type DiscountCodeInput = z.infer<typeof discountCodeSchema>;

// Preview público (no consume uso): solo se valida que el código exista/sirva.
export const validateDiscountCodeSchema = z.object({
  code: z.string().min(1, 'Código requerido').max(30),
});
export type ValidateDiscountCodeInput = z.infer<typeof validateDiscountCodeSchema>;
