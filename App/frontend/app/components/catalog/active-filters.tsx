// Filtros puestos, para que uno aplicado desde el panel del celular no quede
// invisible al cerrarlo.

import type { StoreCategory } from '~/state/api/session-api';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useAppDispatch } from '~/state/hooks';
import {
  categorySet,
  filtersClearedAll,
  onlyInStockSet,
  onlyOnSaleSet,
  priceMaxSet,
  priceMinSet,
  searchSet,
} from '~/state/slices/ui-slice';
import { useCatalogFilters } from '~/hooks/use-catalog-filter';
import { formatCordobas } from '~/lib/formatters';
import { findCategory, priceRangeError } from '~/lib/catalog-query';

interface ActiveFilter {
  id: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({ categories = [] }: { categories?: StoreCategory[] }) {
  const dispatch = useAppDispatch();
  const config = useStoreConfig();
  const currency = config?.currency;

  // Lo que se muestra sale de la URL (igual que la grilla); quitar un chip pasa por Redux y CatalogUrlSync.
  const { search, category: activeCategory, priceMin, priceMax, onlyOnSale, onlyInStock } = useCatalogFilters(categories);

  const chips: ActiveFilter[] = [];

  if (search.trim()) {
    chips.push({
      id: 'search',
      label: `Búsqueda: «${search.trim()}»`,
      onRemove: () => dispatch(searchSet('')),
    });
  }

  if (activeCategory) {
    // Siempre el NOMBRE legible: nunca el slug o el id técnico.
    const cat = findCategory(categories, activeCategory);
    chips.push({
      id: 'category',
      label: cat ? cat.name : 'Categoría no disponible',
      onRemove: () => dispatch(categorySet(null)),
    });
  }

  if ((priceMin != null || priceMax != null) && !priceRangeError({ priceMin, priceMax })) {
    const min = priceMin != null ? formatCordobas(priceMin, currency) : null;
    const max = priceMax != null ? formatCordobas(priceMax, currency) : null;
    chips.push({
      id: 'price',
      label: min && max ? `Precio: ${min} a ${max}` : min ? `Precio desde ${min}` : `Precio hasta ${max}`,
      onRemove: () => {
        dispatch(priceMinSet(null));
        dispatch(priceMaxSet(null));
      },
    });
  }

  if (onlyOnSale) {
    chips.push({ id: 'sale', label: 'En oferta', onRemove: () => dispatch(onlyOnSaleSet(false)) });
  }

  if (onlyInStock) {
    chips.push({
      id: 'stock',
      label: 'Disponibles',
      onRemove: () => dispatch(onlyInStockSet(false)),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Filtros:</span>

      {/* Todo el chip quita el filtro: así llega a 44 px de alto. */}
      {chips.map((chip) => (
        <Chip
          key={chip.id}
          variant="filter"
          onRemove={chip.onRemove}
          removeLabel={`Quitar filtro ${chip.label}`}
          className="min-h-11 text-sm"
        >
          {chip.label}
        </Chip>
      ))}

      {chips.length > 1 && (
        <Button
          variant="link"
          size="sm"
          onClick={() => dispatch(filtersClearedAll())}
          className="h-11 px-2 text-primary-2"
        >
          Limpiar todo
        </Button>
      )}
    </div>
  );
}
