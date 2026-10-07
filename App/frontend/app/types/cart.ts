// Línea del carrito del storefront. Portado de la v1 sin cambios de forma: el
// carrito, el drawer y el checkout de WhatsApp ya hablan este shape.
//
// `price` es el precio que el cliente vio. El backend recalcula todo al crear
// la orden y, si cambió, pide revisarlo antes de enviar (409 `price_changed`).
export interface CartItem {
  catalogId: string;
  /** Producto físico elegido; el servidor lo usa para recalcular precio. */
  variantId?: string;
  name: string;
  /**
   * Identidad de la combinación (`CatalogVariant.variantName`): opciones unidas
   * con ' / '. '' para un producto sin opciones. Carritos viejos pueden traer
   * 'Estándar'; el servidor lo acepta solo si el producto tiene una única
   * combinación y, si no, pide elegir de nuevo.
   */
  variantName: string;
  /** Precio unitario en C$ — display únicamente. */
  price: number;
  image: string;
  quantity: number;
  /**
   * Tope de unidades para esta variante al momento de agregarla. Limita los
   * aumentos sin mostrar el número; el servidor revalida al crear el pedido.
   */
  maxQuantity?: number;
  // ── Líneas de combo ──
  // Con `comboId` la línea es un paquete, no un producto suelto: `price` es el
  // precio del combo y `comboProducts` lista su contenido para el UI.
  comboId?: string;
  comboProducts?: { name: string }[];
}
