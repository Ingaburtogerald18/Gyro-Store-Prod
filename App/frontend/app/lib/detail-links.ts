// Enlaces a un producto guardados en la portada (el botón de un banner). Se guardan con el id, que no
// cambia si el producto se renombra, y se muestran con la URL del nombre.
import { findByDetailParam } from '@shared/detail-slug';

const PRODUCT_PREFIX = '/producto/';

/** Lo que guarda un banner que lleva a un producto. */
export const productTarget = (product: { id: string }) => `${PRODUCT_PREFIX}${product.id}`;

/** El producto publicado al que lleva un destino («/producto/<slug>», «/producto/<id>» o el formato viejo «nombre--id»). */
export function productFromTarget<T extends { id: string; name: string | null; slug?: string }>(
  target: string,
  products: T[],
): T | undefined {
  if (!target.startsWith(PRODUCT_PREFIX)) return undefined;
  const raw = target.slice(PRODUCT_PREFIX.length).split(/[?#]/)[0] ?? '';
  try {
    return findByDetailParam(products, decodeURIComponent(raw));
  } catch {
    return undefined;
  }
}
