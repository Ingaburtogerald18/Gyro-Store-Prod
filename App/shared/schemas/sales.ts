import { z } from 'zod';

// Cotizar, registrar, aprobar, rechazar y
// listar. Sin fotos de recibo, sin venta vía ticket de factura, sin edición
// post-aprobación ni pago de comisiones por lotes — ver Docs/03-Finanzas.md §4-5 para la
// cadena financiera que server/modules/sales/ arma con estos datos.

export const saleLineInputSchema = z.object({
  // Mismo límite que inventario: sin un catalog_item_id real
  // en purchases todavía, el producto se identifica por nombre, no por SKU.
  productName: z.string().min(1, 'El producto es obligatorio.').max(160),
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0.'),
  salePrice: z.number().min(0),
  // Mayoreo es herramienta del cotizador (Docs/03-Finanzas.md §5), no automático: default
  // true a nivel de servicio, pero el vendedor lo puede desactivar por línea.
  applyWholesale: z.boolean().optional(),
});
export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

export const quoteInputSchema = z.object({
  items: z.array(saleLineInputSchema).min(1, 'Selecciona al menos un producto.').max(50),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const registerSaleInputSchema = z.object({
  // Código de la factura tal como se imprime (`GS-PR-12`). Se acepta string
  // porque es lo que el vendedor copia del ticket; `parseInvoiceCode` en
  // modules/invoices/invoices.ts lo resuelve al correlativo numérico (y tolera "12").
  invoiceNumber: z.union([z.string().trim().max(20), z.number().int().positive()]).optional(),
  customerName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  overrideSellerId: z.string().uuid().optional(),
  overrideSellerName: z.string().max(100).optional(),
  soldAt: z.string().datetime().optional(),
  items: z
    .array(saleLineInputSchema)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.productName)).size === items.length, {
      message: 'No repitas el mismo producto en dos líneas: sumá la cantidad en una sola.',
    }),
}).refine((data) => data.invoiceNumber || (data.items && data.items.length > 0), {
  message: 'La venta necesita al menos un producto o un número de factura.',
  path: ['items'],
});
export type RegisterSaleInput = z.infer<typeof registerSaleInputSchema>;

export const updateSaleInputSchema = z.object({
  customerName: z.string().max(100).optional(),
  phone: z.string().optional(),
  overrideSellerId: z.string().uuid().optional(),
  overrideSellerName: z.string().max(100).optional(),
  soldAt: z.string().datetime().optional(),
  items: z.array(saleLineInputSchema).min(1, 'Selecciona al menos un producto.').max(50),
  reason: z.string().optional(),
});
export type UpdateSaleInput = z.infer<typeof updateSaleInputSchema>;

export const rejectSaleInputSchema = z.object({
  reason: z.string().min(1, 'El motivo de rechazo es obligatorio.').max(500),
});
export type RejectSaleInput = z.infer<typeof rejectSaleInputSchema>;

// ── Pago de comisiones (Docs/03-Finanzas.md §4) ──
// El comprobante viaja como URL ya subida a `POST /api/upload`, no como
// multipart: v2 centraliza las subidas ahí y así esta ruta queda siendo JSON.
//
// El `refine` es la regla de auditoría: un pago sin comprobante Y sin
// justificación es un movimiento de dinero sin rastro. La base lo repite como
// CHECK constraint — el borde valida para dar un mensaje útil, la tabla para
// que no entre por ninguna otra puerta.
const payoutProofSchema = {
  paymentMethod: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  receiptUrl: z.string().max(2048).optional(),
  noReceiptComment: z.string().max(500).optional(),
};

const hasProof = (d: { receiptUrl?: string; noReceiptComment?: string }) =>
  Boolean(d.receiptUrl?.trim() || d.noReceiptComment?.trim());
const proofMessage = {
  message: 'Subí el comprobante o justificá por qué no lo hay.',
  path: ['receiptUrl'],
};

export const payCommissionInputSchema = z
  .object({
    // No `.email()`: en vendedores esporádicos `seller_email` guarda el nombre.
    sellerEmail: z.string().trim().min(1, 'Vendedor inválido.').max(200),
    orderIds: z
      .array(z.uuid())
      .min(1, 'Elegí al menos una venta para pagar.')
      .max(200, 'Máximo 200 ventas por lote.'),
    ...payoutProofSchema,
  })
  .refine(hasProof, proofMessage);
export type PayCommissionInput = z.infer<typeof payCommissionInputSchema>;

export const settleBalanceInputSchema = z
  .object({
    sellerEmail: z.string().trim().min(1, 'Vendedor inválido.').max(200),
    ...payoutProofSchema,
  })
  .refine(hasProof, proofMessage);
export type SettleBalanceInput = z.infer<typeof settleBalanceInputSchema>;
