// Hook compartido de filtrado + orden del catálogo.
//
// Existe para que el MISMO resultado alimente tres piezas: la barra de
// herramientas (que muestra el conteo), la grilla (que renderiza) y los chips de
// filtros activos. Cuando cada una filtraba por su cuenta, el conteo mentía.
// Los filtros salen del uiSlice → única fuente de verdad.
import { useMemo } from 'react';
import { normalizeSearch } from '~/lib/search';
import { findCategory, priceRangeError } from '~/lib/catalog-query';

import type { CatalogProduct, Category } from '@shared/schemas';
import { useAppSelector } from '~/state/hooks';
import {
  selectActiveCategory,
  selectOnlyInStock,
  selectOnlyOnSale,
  selectPriceMax,
  selectPriceMin,
  selectSearch,
  selectSort,
} from '~/state/slices/ui-slice';

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

export function useCatalogFilter(products: CatalogProduct[], categories: Category[] = []): CatalogFilterResult {
  const search = useAppSelector(selectSearch);
  const category = useAppSelector(selectActiveCategory);
  const priceMin = useAppSelector(selectPriceMin);
  const priceMax = useAppSelector(selectPriceMax);
  const sort = useAppSelector(selectSort);
  const onlyOnSale = useAppSelector(selectOnlyOnSale);
  const onlyInStock = useAppSelector(selectOnlyInStock);

  const query = search.trim();

  // El orden NO cuenta como filtro: cambiarlo reordena la vista por defecto, no
  // la convierte en una búsqueda.
  const isDefault =
    !query && !category && priceMin == null && priceMax == null && !onlyOnSale && !onlyInStock;

  const priceError = priceRangeError({ priceMin, priceMax });
  const selectedCategory = findCategory(categories, category);

  const filtered = useMemo(() => {
    // Cada término debe aparecer en algún lado (AND), así "kz negro" no trae
    // todo lo que sea KZ más todo lo que sea negro. Acentos y mayúsculas no
    // importan (normalizeSearch).
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
        if (!selectedCategory) return false;
        if (p.categoryId !== selectedCategory.id && p.category !== selectedCategory.name) return false;
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
