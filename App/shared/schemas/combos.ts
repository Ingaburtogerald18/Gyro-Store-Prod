import { z } from 'zod';

// `name` es una copia para mostrar el contenido sin pedir el catálogo. El precio del combo es plano.
export const comboItemSchema = z.object({
  catalogItemId: z.string().uuid('Elegí el producto.'),
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(999),
});
export type ComboItem = z.infer<typeof comboItemSchema>;

export const comboSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  price: z.number().nullable(),
  // Contenido del combo: productos del catálogo con su cantidad.
  items: z.array(comboItemSchema),
  images: z.array(z.string()),
  published: z.boolean(),
  sort_order: z.number().int(),
});

// ── Combos (admin) ── El precio es el del paquete; fotos y visibilidad van en el modo edición.
export const adminComboInputSchema = z.object({
  name: z.string().trim().min(2, 'Escribí el nombre del combo.').max(120),
  price: z.number().positive('Escribí el precio del combo.').max(9_999_999),
  items: z.array(comboItemSchema).min(1, 'Agregá al menos un producto.').max(30, 'Máximo 30 productos por combo.'),
});
export type AdminComboInput = z.infer<typeof adminComboInputSchema>;

export const adminComboSchema = adminComboInputSchema.extend({
  id: z.uuid(),
  images: z.array(z.string()),
  published: z.boolean(),
  sortOrder: z.number().int(),
  updatedAt: z.string(),
});
export type AdminCombo = z.infer<typeof adminComboSchema>;
export type Combo = z.infer<typeof comboSchema>;
