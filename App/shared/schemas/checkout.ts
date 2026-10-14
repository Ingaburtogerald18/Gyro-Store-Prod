import { z } from 'zod';
import { PHONE_RE } from './staff';

// ── Checkout público (Docs/02-Arquitectura.md §4: server SIEMPRE recalcula el
// precio, nunca confía en lo que manda el cliente) ──

// Una línea es un producto o un combo, nunca ambos: el superRefine exige exactamente un id.
export const publicOrderItemInputSchema = z
  .object({
    catalogItemId: z.uuid().optional(),
    // Paquete publicado (tabla `combos`). Igual que con `catalogItemId`, el
    // precio lo resuelve el servidor: el cliente solo dice CUÁL combo quiere.
    comboId: z.uuid().optional(),
    // Techo por línea: sin él, un `quantity` absurdo (1e9) infla el total y puede
    // desbordar los cálculos financieros. El mayoreo real se cotiza con un vendedor.
    quantity: z.number().int().positive().max(999, 'Máximo 999 unidades por producto.'),
    // La variante elegida ("Negro / Con micrófono"): una que no coincide con ninguna se rechaza.
    variantName: z.string().max(200).optional(),
    // Precio unitario que el cliente vio. NO fija el precio: si difiere del que
    // calcula el servidor, el pedido no se crea y se pide revisar el cambio.
    unitPrice: z.number().min(0).max(9_999_999).optional(),
  })
  // Sin esto una línea sin id pasaba y se descartaba en silencio (el combo desaparecía del pedido).
  .superRefine((item, ctx) => {
    if (Boolean(item.catalogItemId) === Boolean(item.comboId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['catalogItemId'],
        message: 'Cada línea debe referenciar un producto o un combo, no ambos ni ninguno.',
      });
    }
  });

// Entrega de un pedido nuevo. 'envio' es de los pedidos anteriores a la 0032 (no distinguían Managua
// del resto del país): se sigue leyendo y se acepta al reintentar un pedido guardado en el navegador.
export const DELIVERY_METHODS = ['managua', 'cargo_trans', 'retiro'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export const STORED_DELIVERY_METHODS = [...DELIVERY_METHODS, 'envio'] as const;
export type StoredDeliveryMethod = (typeof STORED_DELIVERY_METHODS)[number];

export const DELIVERY_LABELS: Record<StoredDeliveryMethod, string> = {
  managua: 'Delivery en Managua',
  cargo_trans: 'Envío por Cargo Trans',
  retiro: 'Retiro',
  envio: 'Envío',
};

// Lo que llena la persona, sin los ítems: el formulario del checkout deriva de acá.
export const publicOrderFieldsSchema = z.object({
  phone: z
    .string()
    .min(1, 'El teléfono es obligatorio.')
    .max(20, 'El teléfono es demasiado largo.')
    .regex(PHONE_RE, 'Ingresá un teléfono válido: 8 a 15 dígitos, con + opcional.'),

  // ── Contacto y entrega ── Se guardan en `public_orders` y arman el mensaje de WhatsApp.
  customerName: z.string().min(2, 'Ingresá tu nombre.').max(80),
  deliveryMethod: z.enum(DELIVERY_METHODS, { message: 'Elegí cómo lo recibís.' }),
  address: z.string().max(200).optional(),
  // Link de Google Maps con el pin del cliente (opcional, lo llena el botón GPS).
  locationUrl: z.string().max(300).optional(),
  note: z.string().max(500).optional(),
  // Código de descuento opcional (incentivo por reseña). El servidor lo canjea
  // atómicamente y recalcula el total: nunca se confía en el monto del cliente.
  discountCode: z.string().max(30).optional(),
});

// Toda entrega que no sea retiro necesita dirección o ubicación; sin ninguna no es despachable. La usan
// el endpoint y el formulario.
export const hasDeliveryDestination = (d: {
  deliveryMethod: StoredDeliveryMethod;
  address?: string;
  locationUrl?: string;
}) =>
  d.deliveryMethod === 'retiro' || (d.address ?? '').trim().length > 4 || Boolean(d.locationUrl);

export const DELIVERY_DESTINATION_MESSAGE =
  'Agregá tu dirección o compartí tu ubicación para el envío.';

export const publicOrderInputSchema = publicOrderFieldsSchema
  .extend({
    deliveryMethod: z.enum(STORED_DELIVERY_METHODS, { message: 'Elegí cómo lo recibís.' }),
    // Techo de líneas por pedido: acota el trabajo que un request anónimo puede
    // pedirle a la DB (el service consulta y luego inserta una fila por ítem).
    items: z
      .array(publicOrderItemInputSchema)
      .min(1, 'El pedido necesita al menos un ítem.')
      .max(50, 'El pedido no puede tener más de 50 productos distintos.'),
    // Sesión anónima de analítica para enlazar el pedido con el embudo. No influye en nada del pedido.
    sessionId: z.string().max(64).optional(),
    // Clave de este intento: un doble clic o reintento con la misma clave devuelve el mismo pedido.
    idempotencyKey: z.uuid().optional(),
  })
  .refine(hasDeliveryDestination, {
    message: DELIVERY_DESTINATION_MESSAGE,
    path: ['address'],
  });

export type PublicOrderItemInput = z.infer<typeof publicOrderItemInputSchema>;
export type PublicOrderFields = z.infer<typeof publicOrderFieldsSchema>;
export type PublicOrderInput = z.infer<typeof publicOrderInputSchema>;

// Motivos de revisión del carrito (409): el checkout los muestra por línea, nada se cambia en silencio.
export const ORDER_ISSUE_REASONS = [
  'not_found',        // el producto o combo ya no está publicado
  'variant_required', // falta elegir opciones (carrito viejo sin variante)
  'invalid_variant',  // la variante guardada ya no existe en el producto
  'sold_out',         // la variante se agotó
  'coming_soon',      // la variante viene en camino: todavía no se puede pedir
  'unknown_stock',    // la variante no tiene stock verificable
  'insufficient',     // pide más unidades de las disponibles
  'price_changed',    // el precio cambió desde que se agregó
] as const;
export type OrderIssueReason = (typeof ORDER_ISSUE_REASONS)[number];

export interface OrderIssue {
  /** Posición de la línea en `items` del request. */
  index: number;
  reason: OrderIssueReason;
  /** Precio vigente (price_changed). */
  currentPrice?: number;
  /** Máximo que se puede pedir hoy (insufficient). No se muestra como número. */
  maxQuantity?: number;
}

// ── Seguimiento ── `status` es texto libre en la base; este enum es lo que escribe el panel.
// 'shipped' se muestra «En camino» o «Listo para retiro» según la entrega.
export const PUBLIC_ORDER_STATUSES = ['new', 'preparing', 'shipped', 'delivered', 'cancelled'] as const;
export type PublicOrderStatus = (typeof PUBLIC_ORDER_STATUSES)[number];

export const updatePublicOrderStatusSchema = z.object({
  status: z.enum(PUBLIC_ORDER_STATUSES),
});

// ── Operación del pedido (solo panel) ── Producto pagado no implica transporte pagado, y registrar el
// pedido o marcarlo entregado no confirma ningún pago ni la recepción: cada dato lo carga el personal.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');
export const publicOrderOperationSchema = z.object({
  shippingQuote: z.number().min(0, 'El monto no puede ser negativo.').max(999_999, 'Monto demasiado alto.').nullable(),
  productPaidDate: isoDate.nullable(),
  shippingPaidDate: isoDate.nullable(),
  carrierReference: z.string().trim().max(80, 'Máximo 80 caracteres.').nullable(),
  // Desde esta fecha corre la garantía: es la de recepción real, no la del pedido, el pago o el despacho.
  receivedDate: isoDate.nullable(),
});
export type PublicOrderOperation = z.infer<typeof publicOrderOperationSchema>;

/** Día calendario en Managua (yyyy-MM-dd): el día de un pago o una entrega no depende de dónde esté el servidor. */
export function managuaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Fechas imposibles: en el futuro o antes de que existiera el pedido. Las mismas reglas en el panel y en el servidor. */
export function operationDateIssues(
  op: Pick<PublicOrderOperation, 'productPaidDate' | 'shippingPaidDate' | 'receivedDate'>,
  orderCreatedOn: string,
  today: string,
): { path: 'productPaidDate' | 'shippingPaidDate' | 'receivedDate'; message: string }[] {
  const fields = ['productPaidDate', 'shippingPaidDate', 'receivedDate'] as const;
  return fields.flatMap((path) => {
    const value = op[path];
    if (!value) return [];
    if (value > today) return [{ path, message: 'No puede ser una fecha futura.' }];
    if (value < orderCreatedOn) return [{ path, message: 'No puede ser anterior al pedido.' }];
    return [];
  });
}

// Rastreo sin cuenta: número corto (#A1B2C3D4) más teléfono; ninguno de los dos alcanza solo.
export const trackPublicOrderSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.replace(/^#/, '').toLowerCase())
    .pipe(z.string().regex(/^[0-9a-f]{8}$/, 'El número de pedido tiene 8 caracteres, como A1B2C3D4.')),
  phone: z
    .string()
    .trim()
    .max(24)
    .transform((v) => v.replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(PHONE_RE, 'Ingresá el teléfono con el que hiciste el pedido.')),
});
export type TrackPublicOrderInput = z.infer<typeof trackPublicOrderSchema>;
