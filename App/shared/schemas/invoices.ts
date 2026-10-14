import { z } from 'zod';

// Modelo delgado: la factura numera una venta YA aprobada
// (server/modules/sales/sales.ts) — no tiene líneas propias, esas viven en
// order_items. `invoiceNumber` nunca lo manda el cliente: lo asigna el
// `nextval()` de la secuencia en server/modules/invoices/invoices.ts.
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
  // Vendedor al que Caja le asigna esta factura (opcional: un ticket de
  // mostrador puede no tener uno). Es lo que después le permite a ESE
  // vendedor verla en "Mis Facturas" antes de que exista una venta vinculada.
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

// Corrección de datos de cobro. `orderId` no se puede cambiar: reasignar una
// factura a otra venta rompería la trazabilidad del correlativo.
// Corregir una factura huérfana con el MISMO formulario con que se emitió,
// líneas incluidas. Solo aplica a facturas `unlinked`: una vez ligada a una
// venta, el snapshot financiero ya se calculó sobre estos números.
//
// El CÓDIGO de descuento no se puede cambiar acá: ya se canjeó al emitir, y
// volver a aplicarlo consumiría otro uso. El monto `discount` se conserva.
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
