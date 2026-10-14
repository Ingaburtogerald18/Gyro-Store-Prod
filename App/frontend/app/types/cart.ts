// Línea del carrito. `price` es el que vio el cliente: si cambió, el backend pide revisar (409).
export interface CartItem {
  catalogId: string;
  /** Producto físico elegido; el servidor lo usa para recalcular precio. */
  variantId?: string;
  name: string;
  /**
   * Opciones unidas con ' / '; '' sin opciones. Un carrito viejo con 'Estándar' solo vale si el producto
   * tiene una única combinación.
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
  // ── Combos ── Con `comboId` la línea es un paquete; `comboProducts` lista su contenido.
  comboId?: string;
  comboProducts?: { name: string }[];
}
