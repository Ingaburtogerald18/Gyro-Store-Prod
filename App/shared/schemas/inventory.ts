import { z } from 'zod';

// Contrato de entrada de inventory-routes.ts. Las salidas (Purchase, InventoryRow…) son interfaces
// en inventory.ts: las arma el servicio, no hay que validarlas en el borde.

// Solo los campos editables a mano. Estado, vendidas, reservadas y derivados los mueven
// la recepción, la reversión y el FIFO.
export const updatePurchaseInputSchema = z.object({
  purchaseDate: z.iso.date().optional(),
  lot: z.string().min(1).max(40).optional(),
  code: z.string().min(1).max(40).optional(),
  productName: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(80).optional(),
  quantity: z.number().int().positive().optional(),
  costUnit: z.number().min(0).optional(),
  taxUnit: z.number().min(0).optional(),
  shippingUnit: z.number().min(0).optional(),
  suggestedPrice: z.number().min(0).optional(),
  // null = desvincular del catálogo.
  catalogItemId: z.uuid().nullable().optional(),
  variantKey: z.string().max(200).optional(),
  // Vincular a una variante de plantilla: el servidor busca (o crea, sin
  // publicar) su producto. `catalogItemId` elige cuál en una plantilla vieja compartida.
  templateId: z.uuid().optional(),
});
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseInputSchema>;

export const arrivalInputSchema = z.object({
  arrivalDate: z.iso.date(),
  shippingUnit: z.number().min(0),
  // Precio de venta del lote (C$): es el único precio que usa la tienda.
  suggestedPrice: z.number().positive('Escribí el precio de venta.'),
  // Tasa C$/USD que se congela en el lote. Opcional: sin ella se usa la de
  // Configuración (el modal la precarga con esa misma).
  exchangeRate: z.number().positive().max(1000).optional(),
});
export type ArrivalInput = z.infer<typeof arrivalInputSchema>;

// ── Órdenes de compra ── Agrupan líneas (una por variante) con número de orden, proveedor, factura
// y fotos del empaque.

export const supplierInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del proveedor es obligatorio.').max(120),
  contact: z.string().trim().max(200).default(''),
  storeUrl: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(500).default(''),
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;

// Factura de Alibaba. Una misma factura puede cubrir varias órdenes: se carga
// una vez y las demás órdenes la eligen.
export const purchaseInvoiceInputSchema = z
  .object({
    invoiceNumber: z.string().trim().max(60).default(''),
    fileUrl: z.url().max(1000).nullable().default(null),
    totalUsd: z.number().min(0).max(10_000_000).nullable().default(null),
    notes: z.string().trim().max(500).default(''),
  })
  .refine((data) => Boolean(data.fileUrl) || data.totalUsd != null || data.invoiceNumber !== '', {
    message: 'Subí la factura o escribí su total.',
    path: ['fileUrl'],
  });
export type PurchaseInvoiceInput = z.infer<typeof purchaseInvoiceInputSchema>;

// Nombre del lote y categoría salen de la plantilla; `catalogItemId` solo hace falta si una
// plantilla vieja tiene varios productos.
export const purchaseOrderLineInputSchema = z.object({
  templateId: z.uuid('Elegí la plantilla.'),
  variantKey: z.string().max(200).default(''),
  catalogItemId: z.uuid().optional(),
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0.').max(1_000_000),
  costUnit: z.number().min(0).max(1_000_000),
});
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInputSchema>;

const purchaseOrderHeaderFields = {
  // 40 = el largo que acepta `purchases.lot`, donde se copia el número.
  orderNumber: z.string().trim().min(3, 'Escribí el número de orden de Alibaba.').max(40),
  purchaseDate: z.iso.date(),
  // Proveedor guardado (`supplierId`) o uno nuevo (`newSupplier`). `null` en la
  // edición = quitar el proveedor.
  supplierId: z.uuid().nullable().optional(),
  newSupplier: supplierInputSchema.optional(),
  // Factura ya cargada (`invoiceId`, quizás de otra orden de la misma compra)
  // o una nueva (`newInvoice`). `null` en la edición = quitar la factura.
  invoiceId: z.uuid().nullable().optional(),
  newInvoice: purchaseInvoiceInputSchema.optional(),
  packagePhotos: z.array(z.url().max(1000)).max(8).default([]),
  notes: z.string().trim().max(1000).default(''),
};

// El impuesto por unidad es el mismo para toda la orden; se guarda en cada línea.
const taxUnitSchema = z.number().min(0, 'Revisá el impuesto.').max(1_000_000);

export const newPurchaseOrderInputSchema = z
  .object({
    ...purchaseOrderHeaderFields,
    taxUnit: taxUnitSchema,
    lines: z.array(purchaseOrderLineInputSchema).min(1, 'Agregá al menos un producto.').max(100),
  })
  .refine((data) => Boolean(data.supplierId || data.newSupplier), {
    message: 'Elegí el proveedor o cargá uno nuevo.',
    path: ['supplierId'],
  });
export type NewPurchaseOrderInput = z.infer<typeof newPurchaseOrderInputSchema>;

// Completar o corregir la orden (también las viejas, que nacen sin proveedor,
// factura ni fotos). No toca las líneas: esas se editan una por una.
export const updatePurchaseOrderInputSchema = z.object({
  ...purchaseOrderHeaderFields,
  // Sin default: un campo que no viene se conserva, no se vacía.
  packagePhotos: z.array(z.url().max(1000)).max(8).optional(),
  notes: z.string().trim().max(1000).optional(),
  // Se aplica a todas sus líneas y recalcula el costo de las que ya llegaron.
  taxUnit: taxUnitSchema.optional(),
});
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderInputSchema>;

export const addPurchaseOrderLinesInputSchema = z.object({
  // Solo para una orden sin líneas; si ya tiene, se usa el impuesto de la orden.
  taxUnit: taxUnitSchema.optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1, 'Agregá al menos un producto.').max(100),
});
export type AddPurchaseOrderLinesInput = z.infer<typeof addPurchaseOrderLinesInputSchema>;

// El envío se escribe total y se reparte por unidades recibidas, entre todas las órdenes de la llegada
// (`extraOrderIds`). Las líneas que no se mandan siguen en tránsito: se recibe por partes.
const receiptLineFields = {
  purchaseId: z.uuid(),
  receivedQuantity: z.number().int().positive('Lo recibido debe ser mayor a 0.').max(1_000_000),
};
const receiptLines = <T extends z.ZodType>(salePrice: T) =>
  z
    .array(z.object({ ...receiptLineFields, salePrice }))
    .min(1, 'Elegí al menos un producto recibido.')
    .max(100);

export const receivePurchaseOrderInputSchema = z.object({
  arrivalDate: z.iso.date(),
  extraOrderIds: z.array(z.uuid()).max(30).optional(),
  exchangeRate: z.number().positive().max(1000).optional(),
  shippingTotalUsd: z.number().min(0).max(10_000_000),
  // Precio de venta del lote (C$): es el único precio que usa la tienda.
  lines: receiptLines(z.number().positive('Escribí el precio de venta.').max(10_000_000)),
});
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderInputSchema>;

// La simulación calcula el precio sugerido, así que todavía no lo pide.
export const simulatePurchaseOrderReceiptInputSchema = receivePurchaseOrderInputSchema
  .omit({ arrivalDate: true, lines: true })
  .extend({ lines: receiptLines(z.number().min(0).max(10_000_000).optional()) });
export type SimulatePurchaseOrderReceiptInput = z.infer<typeof simulatePurchaseOrderReceiptInputSchema>;

// ── Ofertas por color ── Una por producto y color ('' si no tiene colores). Solo la ve la tienda.
export const colorOfferInputSchema = z.object({
  catalogItemId: z.uuid(),
  color: z.string().max(200),
  price: z.number().positive('Escribí el precio de oferta.').max(10_000_000),
  endsAt: z.iso.datetime({ offset: true, error: 'Elegí cuándo vence la oferta.' }),
});
export type ColorOfferInput = z.infer<typeof colorOfferInputSchema>;
