// Línea del carrito del storefront. Portado de la v1 sin cambios de forma: el
// carrito, el drawer y el checkout de WhatsApp ya hablan este shape.
//
// `price` es SOLO para mostrar. El backend recalcula todo al crear la orden
// (POST /api/orders/public solo acepta { catalogItemId, quantity }).
export interface CartItem {
  catalogId: string;
  /** Producto físico elegido; el servidor lo usa para recalcular precio. */
  variantId?: string;
  name: string;
  variantName: string;
  /** Precio unitario en C$ — display únicamente. */
  price: number;
  image: string;
  quantity: number;
  // ── Líneas de combo ──
  // Con `comboId` la línea es un paquete, no un producto suelto: `price` es el
  // precio del combo y `comboProducts` lista su contenido para el UI.
  comboId?: string;
  comboProducts?: { name: string }[];
}
