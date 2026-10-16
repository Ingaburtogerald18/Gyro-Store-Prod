// Qué productos muestra la portada y en qué bloques (DESIGN.md §10). No depende de cuántos productos
// hay: con 8 o con 9 la composición es la misma, y ningún bloque repite lo que ya está arriba.
import { categoryMode, type CatalogProduct, type LandingConfig } from '@shared/schemas';
import { inCategory } from './catalog-query';
import { isDeal, sortProducts } from './catalog-products';

/** Productos por bloque: una fila en escritorio, dos en el celular. */
export const HOME_SHELF_SIZE = 4;

interface Category {
  id: string;
  slug: string;
  name: string;
}

export interface HomeShelf<C extends Category> {
  category: C | null;
  products: CatalogProduct[];
  /** Cuántos hay en total en ese grupo (los de «Ver todo»). */
  total: number;
}

export interface HomeSections<C extends Category> {
  /** Los destacados elegidos a mano, en su orden; sin elección, los primeros por disponibilidad. */
  highlight: CatalogProduct[];
  manual: boolean;
  deals: HomeShelf<C> | null;
  rows: HomeShelf<C>[];
  /** Productos sin una categoría de la configuración (solo en modo automático). */
  uncategorized: HomeShelf<C> | null;
}

export function homeSections<C extends Category>(
  products: CatalogProduct[],
  categories: C[],
  landing: Pick<LandingConfig, 'featuredProductIds' | 'homeCategories' | 'homeCategoriesMode'> | null | undefined,
): HomeSections<C> {
  const ordered = sortProducts(products, 'relevant');
  const featured = (landing?.featuredProductIds ?? [])
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is CatalogProduct => Boolean(p));
  const manual = featured.length > 0;
  const highlight = manual ? featured : ordered.slice(0, HOME_SHELF_SIZE);

  // Un bloque se muestra si trae algo que el primero no tiene.
  const above = new Set(highlight.map((p) => p.id));
  const shelf = (category: C | null, items: CatalogProduct[]): HomeShelf<C> | null => {
    const shown = items.slice(0, HOME_SHELF_SIZE);
    return shown.some((p) => !above.has(p.id)) ? { category, products: shown, total: items.length } : null;
  };

  const mode = categoryMode(landing?.homeCategoriesMode, landing?.homeCategories);
  let rowCategories: C[] = [];
  if (mode === 'custom') {
    // El orden que eligió el dueño, tal cual.
    rowCategories = (landing?.homeCategories ?? [])
      .map((id) => categories.find((c) => c.id === id))
      .filter((c): c is C => Boolean(c));
  } else if (mode === 'auto') {
    // Primero las que tienen algo para pedir hoy; entre ellas, el orden de la configuración.
    const hasAvailable = (c: C) => products.some((p) => inCategory(p, c) && p.availability === 'available');
    rowCategories = [...categories].sort((a, b) => Number(hasAvailable(b)) - Number(hasAvailable(a)));
  }

  const rows = rowCategories
    .map((c) => shelf(c, ordered.filter((p) => inCategory(p, c))))
    .filter((row): row is HomeShelf<C> => row !== null);

  return {
    highlight,
    manual,
    deals: shelf(null, ordered.filter(isDeal)),
    rows,
    uncategorized:
      mode === 'auto' && categories.length > 0
        ? shelf(null, ordered.filter((p) => !categories.some((c) => inCategory(p, c))))
        : null,
  };
}
