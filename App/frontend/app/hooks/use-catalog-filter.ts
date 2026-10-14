// El mismo resultado alimenta el conteo, la grilla y los chips: cuando filtraban por separado, el conteo mentía.
// Se lee de la URL y no de Redux: así el HTML del servidor ya sale filtrado y una ruta nueva no pinta
// los filtros de la anterior. Redux sigue alimentando los campos mientras se escribe.
import { useMemo } from 'react';
import { useLocation } from '@remix-run/react';
import { normalizeSearch } from '~/lib/search';
import { findCategory, inCategory, parseCatalogLocation, priceRangeError, type CatalogFilters } from '~/lib/catalog-query';

import type { CatalogProduct, Category } from '@shared/schemas';

/**
 * En oferta: alguna variante COMPRABLE tiene promoción vigente, o el producto
 * muestra precio tachado. `isPromo` ya sale de las variantes (catalogPresenter).
 */
export const isDeal = (p: CatalogProduct) => p.isPromo || (p.compareAtPrice ?? 0) > p.price;

export interface CatalogFilterResult {
  /** Productos tras aplicar búsqueda + categoría + precio + toggles + orden. */
  filtered: CatalogProduct[];
  /** true si no hay ningún filtro puesto → la home muestra su vista segmentada. */
  isDefault: boolean;
  /** Error del rango de precio (mín > máx): se muestra junto a los campos y no filtra. */
  priceError: string | null;
  /** La categoría pedida no existe en la configuración. */
  unknownCategory: boolean;
}

const NO_CATEGORIES: Category[] = [];

export function useCatalogFilters(categories: Category[] = NO_CATEGORIES): CatalogFilters {
  const { pathname, search } = useLocation();
  return useMemo(() => parseCatalogLocation(pathname, new URLSearchParams(search), categories), [pathname, search, categories]);
}

export function useCatalogFilter(products: CatalogProduct[], categories: Category[] = NO_CATEGORIES): CatalogFilterResult {
  const { search, category, priceMin, priceMax, sort, onlyOnSale, onlyInStock } = useCatalogFilters(categories);

  const query = search.trim();

  // El orden NO cuenta como filtro: cambiarlo reordena la vista por defecto, no
  // la convierte en una búsqueda.
  const isDefault =
    !query && !category && priceMin == null && priceMax == null && !onlyOnSale && !onlyInStock;

  const priceError = priceRangeError({ priceMin, priceMax });
  const selectedCategory = findCategory(categories, category);

  const filtered = useMemo(() => {
    // Cada término tiene que aparecer (AND): «kz negro» no trae todo KZ más todo lo negro.
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    const rangeOk = !priceError;

    const result = products.filter((p) => {
      if (terms.length) {
        // Datos reales del producto: nombre, categoría, opciones ofrecidas y specs.
        const haystack = normalizeSearch(
          `${p.name} ${p.category} ${p.description ?? ''} ${p.axesSummary.join(' ')} ${p.specs.map((s) => s.value).join(' ')}`,
        );
        if (!terms.every((t) => haystack.includes(t))) return false;
      }
      if (category) {
        // Una categoría que ya no existe no coincide con nada (se avisa aparte).
        if (!selectedCategory || !inCategory(p, selectedCategory)) return false;
      }
      // El precio del filtro es el mismo que se muestra (el menor comprable).
      if (rangeOk && priceMin != null && p.price < priceMin) return false;
      if (rangeOk && priceMax != null && p.price > priceMax) return false;
      if (onlyInStock && p.availability !== 'available') return false;
      if (onlyOnSale && !isDeal(p)) return false;
      return true;
    });

    // «Recomendados» = el orden que define la tienda en el panel, tal cual llega.
    if (sort === 'price-asc') result.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') result.sort((a, b) => b.price - a.price);

    return result;
  }, [products, selectedCategory, query, category, priceMin, priceMax, priceError, onlyOnSale, onlyInStock, sort]);

  return { filtered, isDefault, priceError, unknownCategory: Boolean(category && !selectedCategory && categories.length) };
}
