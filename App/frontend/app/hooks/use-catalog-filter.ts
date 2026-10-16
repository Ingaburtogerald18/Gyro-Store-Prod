// El mismo resultado alimenta el conteo, la grilla y los chips: cuando filtraban por separado, el conteo mentía.
// Se lee de la URL y no de Redux: así el HTML del servidor ya sale filtrado y una ruta nueva no pinta
// los filtros de la anterior. Redux sigue alimentando los campos mientras se escribe.
import { useMemo } from 'react';
import { useLocation } from '@remix-run/react';
import { parseCatalogLocation, type CatalogFilters } from '~/lib/catalog-query';
import { filterCatalog, isDeal } from '~/lib/catalog-products';

import type { CatalogProduct, Category } from '@shared/schemas';

export { isDeal };

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
  const filters = useCatalogFilters(categories);
  const { search, category, priceMin, priceMax, onlyOnSale, onlyInStock } = filters;

  // El orden NO cuenta como filtro: cambiarlo reordena la vista por defecto, no
  // la convierte en una búsqueda.
  const isDefault =
    !search.trim() && !category && priceMin == null && priceMax == null && !onlyOnSale && !onlyInStock;

  const outcome = useMemo(() => filterCatalog(products, filters, categories), [products, filters, categories]);
  return { ...outcome, isDefault };
}
