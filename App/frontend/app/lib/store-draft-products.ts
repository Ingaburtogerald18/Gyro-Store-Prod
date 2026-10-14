// Cambios de productos y combos del borrador (fotos, «Mostrar en la tienda»,
// orden) aplicados sobre lo publicado, para el modo edición y la vista previa.
import type { AdminCombo, CatalogProduct, EditorProduct, StoreDraftProducts } from '@shared/schemas';

export const EMPTY_DRAFT_PRODUCTS: StoreDraftProducts = { items: {}, combos: {} };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const withoutEmpty = (byColor: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(byColor).filter(([, images]) => images.length > 0));

// El orden de los colores no cuenta como cambio.
const sameByColor = (a: Record<string, string[]>, b: Record<string, string[]>) =>
  same(Object.entries(a).sort(([x], [y]) => x.localeCompare(y)), Object.entries(b).sort(([x], [y]) => x.localeCompare(y)));

/** Fotos de la tarjeta: las generales o, si no hay, las de los colores. */
export const cardImages = (images: string[], byColor: Record<string, string[]>) =>
  images.length ? images : Object.values(byColor).flat();

/** Cada producto con lo que cambia el borrador, en el orden del borrador. */
export function applyDraftProducts(products: EditorProduct[], draft: StoreDraftProducts): EditorProduct[] {
  const changed = products.map((product) => {
    const change = draft.items[product.id];
    if (!change) return product;
    return {
      ...product,
      images: change.images ?? product.images,
      imagesByColor: change.imagesByColor ?? product.imagesByColor,
      published: change.published ?? product.published,
    };
  });
  if (!draft.order) return changed;
  const position = new Map(draft.order.map((id, index) => [id, index]));
  // Los que no están en el orden (creados después) van al final.
  return changed
    .map((product, index) => ({ product, key: position.get(product.id) ?? draft.order!.length + index }))
    .sort((a, b) => a.key - b.key)
    .map(({ product }) => product);
}

/** Cada combo con lo que cambia el borrador. */
export function applyDraftCombos(combos: AdminCombo[], draft: StoreDraftProducts): AdminCombo[] {
  return combos.map((combo) => {
    const change = draft.combos[combo.id];
    return change ? { ...combo, images: change.images ?? combo.images, published: change.published ?? combo.published } : combo;
  });
}

function normalizeCombos(draft: StoreDraftProducts, combos: AdminCombo[] | undefined): StoreDraftProducts['combos'] {
  if (!combos) return draft.combos;
  const byId = new Map(combos.map((combo) => [combo.id, combo]));
  const kept: StoreDraftProducts['combos'] = {};
  for (const [id, change] of Object.entries(draft.combos)) {
    const published = byId.get(id);
    if (!published) continue;
    const next: StoreDraftProducts['combos'][string] = {};
    if (change.images && !same(change.images, published.images)) next.images = change.images;
    if (change.published !== undefined && change.published !== published.published) next.published = change.published;
    if (Object.keys(next).length) kept[id] = next;
  }
  return kept;
}

/** Saca lo que quedó igual a lo publicado: así «sin cambios» es de verdad sin cambios. */
export function normalizeDraftProducts(
  draft: StoreDraftProducts,
  products: EditorProduct[],
  combos?: AdminCombo[],
): StoreDraftProducts {
  const byId = new Map(products.map((product) => [product.id, product]));
  const items: StoreDraftProducts['items'] = {};
  for (const [id, change] of Object.entries(draft.items)) {
    const published = byId.get(id);
    if (!published) continue;
    const kept: StoreDraftProducts['items'][string] = {};
    if (change.images && !same(change.images, published.images)) kept.images = change.images;
    if (change.imagesByColor && !sameByColor(withoutEmpty(change.imagesByColor), published.imagesByColor))
      kept.imagesByColor = withoutEmpty(change.imagesByColor);
    if (change.published !== undefined && change.published !== published.published) kept.published = change.published;
    if (Object.keys(kept).length) items[id] = kept;
  }
  const publishedOrder = products.map((product) => product.id);
  const order = draft.order?.filter((id) => byId.has(id));
  const draftOrder = order && applyDraftProducts(products, { ...EMPTY_DRAFT_PRODUCTS, order }).map((p) => p.id);
  return {
    items,
    combos: normalizeCombos(draft, combos),
    ...(draftOrder && !same(draftOrder, publishedOrder) ? { order: draftOrder } : {}),
  };
}

export const hasDraftProductChanges = (draft: StoreDraftProducts) =>
  Object.keys(draft.items).length > 0 || Object.keys(draft.combos).length > 0 || draft.order !== undefined;

/** Catálogo de la vista previa: también los sin publicar, marcados. */
export function previewCatalog(products: EditorProduct[]): CatalogProduct[] {
  return products.map((product) => ({
    ...product.card,
    images: cardImages(product.images, product.imagesByColor),
    ...(product.published ? {} : { unpublished: true }),
  }));
}

/** Resumen para la ventana de publicar: «2 se muestran, 1 se oculta…». */
export function describeProductChanges(draft: StoreDraftProducts, products: EditorProduct[], combos: AdminCombo[] = []): string[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const shown: string[] = [];
  const hidden: string[] = [];
  let photos = 0;
  for (const [id, change] of Object.entries(draft.items)) {
    const name = byId.get(id)?.name ?? 'Producto';
    if (change.published === true) shown.push(name);
    if (change.published === false) hidden.push(name);
    if (change.images || change.imagesByColor) photos += 1;
  }
  const lines: string[] = [];
  if (shown.length) lines.push(`Se muestran en la tienda: ${shown.join(', ')}`);
  if (hidden.length) lines.push(`Se ocultan de la tienda: ${hidden.join(', ')}`);
  if (photos) lines.push(`Fotos nuevas o cambiadas en ${photos} ${photos === 1 ? 'producto' : 'productos'}`);
  if (draft.order) lines.push('Orden nuevo de los productos');

  const comboName = new Map(combos.map((combo) => [combo.id, combo.name]));
  const changes = Object.entries(draft.combos);
  const comboShown = changes.filter(([, c]) => c.published === true).map(([id]) => comboName.get(id) ?? 'Combo');
  const comboHidden = changes.filter(([, c]) => c.published === false).map(([id]) => comboName.get(id) ?? 'Combo');
  const comboPhotos = changes.filter(([, c]) => c.images).length;
  if (comboShown.length) lines.push(`Combos que se muestran: ${comboShown.join(', ')}`);
  if (comboHidden.length) lines.push(`Combos que se ocultan: ${comboHidden.join(', ')}`);
  if (comboPhotos) lines.push(`Fotos nuevas o cambiadas en ${comboPhotos} ${comboPhotos === 1 ? 'combo' : 'combos'}`);
  return lines;
}
