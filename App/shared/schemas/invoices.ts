import { z } from 'zod';

// La factura numera una venta y su correlativo lo asigna la base, nunca el cliente.
export const invoiceItemInputSchema = z.object({
  productName: z.string().min(1, 'El producto es obligatorio.').max(160),
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0.'),
  unitPrice: z.number().min(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const createInvoiceInputSchema = z.object({
  customerName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  deliveryFee: z.number().min(0).optional(),
  deliveryName: z.string().max(100).optional(),
  discount: z.number().min(0).optional(),
  // Código de descuento opcional: el servidor lo canjea y suma su monto al
  // descuento manual (topado al subtotal). Ver server/modules/discount-codes/discount-codes.ts.
  discountCode: z.string().max(30).optional(),
  // Vendedor al que Caja asigna la factura (opcional): así la ve en «Mis Facturas» antes de la venta.
  sellerUid: z.string().uuid().optional(),
  issuedAt: z.string().datetime().optional(),
  items: z.array(invoiceItemInputSchema).min(1, 'La factura necesita al menos un producto.'),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;

// Anular exige motivo: una factura anulada sin explicación es un hueco en la
// auditoría. El correlativo conserva el número — no se borra nunca.
export const voidInvoiceInputSchema = z.object({
  reason: z.string().min(1, 'El motivo de anulación es obligatorio.').max(500),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceInputSchema>;

// Corrige una factura huérfana con sus líneas; una ligada ya alimentó el snapshot de su venta.
// El código de descuento no se cambia: ya se canjeó y reaplicarlo gastaría otro uso.
export const updateInvoiceInputSchema = z.object({
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']).optional(),
  deliveryFee: z.number().min(0).max(9_999_999).optional(),
  customerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  deliveryName: z.string().trim().max(120).optional(),
  issuedAt: z.string().datetime().optional(),
  items: z
    .array(
      z.object({
        productName: z.string().trim().min(1).max(200),
        quantity: z.number().int().positive().max(100_000),
        unitPrice: z.number().min(0).max(9_999_999),
      }),
    )
    .min(1)
    .optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceInputSchema>;
