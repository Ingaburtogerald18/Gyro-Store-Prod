// Orden y filtros del catálogo sobre los productos ya cargados (qué filtros hay lo dice la URL, en
// catalog-query.ts). El listado, el conteo, los chips y la portada usan lo mismo.
import type { Availability, CatalogProduct } from '@shared/schemas';
import { findCategory, inCategory, priceRangeError, type CatalogFilters, type CatalogSort } from './catalog-query';
import { normalizeSearch } from './search';

/**
 * En oferta: alguna variante COMPRABLE tiene promoción vigente, o el producto
 * muestra precio tachado. `isPromo` ya sale de las variantes (catalogPresenter).
 */
export const isDeal = (p: Pick<CatalogProduct, 'isPromo' | 'compareAtPrice' | 'price'>) =>
  p.isPromo || (p.compareAtPrice ?? 0) > p.price;

/** El precio que ve el comprador; null si no hay uno comprable («Próximamente» o sin precio cargado). */
export function publicPrice(p: Pick<CatalogProduct, 'availability' | 'price'>): number | null {
  return p.availability !== 'coming_soon' && p.price > 0 ? p.price : null;
}

// «Recomendados»: lo que se puede pedir primero; dentro de cada grupo manda el orden de la tienda.
const AVAILABILITY_RANK: Record<Availability, number> = { available: 0, unknown: 1, coming_soon: 2, sold_out: 3 };

/** Copia ordenada; nunca toca el orden guardado. El orden de JS es estable: los empates quedan como llegaron. */
export function sortProducts<T extends Pick<CatalogProduct, 'availability' | 'price'>>(products: T[], sort: CatalogSort): T[] {
  const list = [...products];
  if (sort === 'relevant') return list.sort((a, b) => AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability]);
  const direction = sort === 'price-asc' ? 1 : -1;
  return list.sort((a, b) => {
    const pa = publicPrice(a);
    const pb = publicPrice(b);
    // Sin precio público, al final en los dos sentidos: un 0 no es «el más barato».
    if (pa == null || pb == null) return (pa == null ? 1 : 0) - (pb == null ? 1 : 0);
    return (pa - pb) * direction;
  });
}

export interface CatalogFilterOutcome<T> {
  filtered: T[];
  priceError: string | null;
  unknownCategory: boolean;
}

type FilterableProduct = Pick<
  CatalogProduct,
  'name' | 'category' | 'categoryId' | 'description' | 'axesSummary' | 'specs' | 'availability' | 'price' | 'isPromo' | 'compareAtPrice'
>;

/** Búsqueda, categoría, precio, ofertas y disponibilidad juntos, y después el orden. */
export function filterCatalog<T extends FilterableProduct>(
  products: T[],
  filters: CatalogFilters,
  categories: { id: string; slug: string; name: string }[],
): CatalogFilterOutcome<T> {
  const { search, category, priceMin, priceMax, sort, onlyOnSale, onlyInStock } = filters;
  // Cada término tiene que aparecer (AND): «kz negro» no trae todo KZ más todo lo negro.
  const terms = normalizeSearch(search.trim()).split(/\s+/).filter(Boolean);
  const priceError = priceRangeError({ priceMin, priceMax });
  const byPrice = !priceError && (priceMin != null || priceMax != null);
  const selectedCategory = findCategory(categories, category);

  const filtered = products.filter((p) => {
    if (terms.length) {
      // Datos reales del producto: nombre, categoría, opciones ofrecidas y specs.
      const haystack = normalizeSearch(
        `${p.name} ${p.category} ${p.description ?? ''} ${p.axesSummary.join(' ')} ${p.specs.map((s) => s.value).join(' ')}`,
      );
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    // Una categoría que ya no existe no coincide con nada (se avisa aparte).
    if (category && (!selectedCategory || !inCategory(p, selectedCategory))) return false;
    if (byPrice) {
      // Mismo precio que se muestra; sin precio público no cae en ningún rango.
      const price = publicPrice(p);
      if (price == null) return false;
      if (priceMin != null && price < priceMin) return false;
      if (priceMax != null && price > priceMax) return false;
    }
    if (onlyInStock && p.availability !== 'available') return false;
    if (onlyOnSale && !isDeal(p)) return false;
    return true;
  });

  return {
    filtered: sortProducts(filtered, sort),
    priceError,
    unknownCategory: Boolean(category && !selectedCategory && categories.length),
  };
}

/** Cuántos se ven del listado: de a `step`, sin pasarse del total. */
export function visibleWindow(total: number, shown: number, step: number) {
  const visible = Math.min(total, Math.max(step, shown));
  return { visible, hasMore: visible < total, next: Math.min(total, visible + step) };
}
