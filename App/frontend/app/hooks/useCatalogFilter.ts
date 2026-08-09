// Hook compartido de filtrado + orden del catálogo.
//
// Existe para que el MISMO resultado alimente tres piezas: la barra de
// herramientas (que muestra el conteo), la grilla (que renderiza) y los chips de
// filtros activos. Cuando cada una filtraba por su cuenta, el conteo mentía.
// Los filtros salen del uiSlice → única fuente de verdad.
import { useMemo } from 'react';

import type { CatalogProduct, Category } from '@shared/schemas';
import { useAppSelector } from '~/store/hooks';
import {
  selectActiveCategory,
  selectOnlyInStock,
  selectOnlyOnSale,
  selectPriceMax,
  selectPriceMin,
  selectSearch,
  selectSort,
} from '~/store/slices/uiSlice';

/** Está en oferta si lo marcaron como promo o si tiene precio tachado. */
export const isDeal = (p: CatalogProduct) => p.isPromo || (p.compareAtPrice ?? 0) > p.price;

// Búsqueda tolerante a acentos: en una tienda nicaragüense la gente escribe
// "audifono" y el catálogo dice "audífono". Sin normalizar, esa búsqueda no
// devuelve nada — el modo más caro de perder una venta.
//
// NFD separa cada letra de su tilde; `\p{Diacritic}` borra las marcas que
// quedan sueltas. Se usa la propiedad Unicode y no un rango literal a mano
// porque esos glifos son invisibles en el editor y cualquier reformateo se los
// come sin que nadie lo note.
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export interface CatalogFilterResult {
  /** Productos tras aplicar búsqueda + categoría + precio + toggles + orden. */
  filtered: CatalogProduct[];
  /** true si no hay ningún filtro puesto → la home muestra su vista segmentada. */
  isDefault: boolean;
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

  const filtered = useMemo(() => {
    // Cada término debe aparecer en algún lado (AND), así "kz negro" no trae
    // todo lo que sea KZ más todo lo que sea negro.
    const terms = normalize(query).split(/\s+/).filter(Boolean);

    const result = products.filter((p) => {
      if (terms.length) {
        const haystack = normalize(`${p.name} ${p.category} ${p.description ?? ''}`);
        if (!terms.every((t) => haystack.includes(t))) return false;
      }
      if (category) {
        // Find the category object by slug (or UUID/name if old format)
        const catObj = categories.find(c => c.slug === category || c.id === category || c.name === category);
        const matchId = catObj ? catObj.id : category;
        const matchName = catObj ? catObj.name : category;
        
        if (p.categoryId !== matchId && p.category !== matchName) return false;
      }
      if (priceMin != null && p.price < priceMin) return false;
      if (priceMax != null && p.price > priceMax) return false;
      if (onlyInStock && p.stock <= 0) return false;
      if (onlyOnSale && !isDeal(p)) return false;
      return true;
    });

    // Ordenar sobre el array ya filtrado: `filter` devolvió uno nuevo, así que
    // esto no muta el catálogo que llegó por props.
    if (sort === 'price-asc') result.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') result.sort((a, b) => b.price - a.price);

    return result;
  }, [products, categories, query, category, priceMin, priceMax, onlyOnSale, onlyInStock, sort]);

  return { filtered, isDefault };
}
