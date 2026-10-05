// Chips de los filtros puestos, con "quitar" individual y un "Limpiar todo".
//
// Sin esto, un filtro aplicado desde el bottom sheet queda invisible al cerrarlo
// y el catálogo parece vacío "porque sí". Los chips son el recibo de lo que el
// usuario pidió.
import { HugeIcon } from '~/components/ui/icon';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

import type { StoreCategory } from '~/store/api/sessionApi';
import { Button } from '~/components/ui/button';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  categorySet,
  filtersClearedAll,
  onlyInStockSet,
  onlyOnSaleSet,
  priceMaxSet,
  priceMinSet,
  searchSet,
  selectActiveCategory,
  selectOnlyInStock,
  selectOnlyOnSale,
  selectPriceMax,
  selectPriceMin,
  selectSearch,
} from '~/store/slices/uiSlice';
import { formatCordobas } from '~/lib/formatters';

interface Chip {
  id: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({ categories = [] }: { categories?: StoreCategory[] }) {
  const dispatch = useAppDispatch();
  const { data: config } = useGetConfigQuery();
  const currency = config?.currency;

  const search = useAppSelector(selectSearch);
  const activeCategory = useAppSelector(selectActiveCategory);
  const priceMin = useAppSelector(selectPriceMin);
  const priceMax = useAppSelector(selectPriceMax);
  const onlyOnSale = useAppSelector(selectOnlyOnSale);
  const onlyInStock = useAppSelector(selectOnlyInStock);

  const chips: Chip[] = [];

  if (search.trim()) {
    chips.push({
      id: 'search',
      label: `Búsqueda: "${search.trim()}"`,
      onRemove: () => dispatch(searchSet('')),
    });
  }

  if (activeCategory) {
    const cat = categories.find((c) => c.id === activeCategory);
    chips.push({
      id: 'category',
      // Si la categoría ya no está en la config, el id crudo es mejor que un
      // chip mudo que no se puede relacionar con nada.
      label: `Categoría: ${cat?.name ?? activeCategory}`,
      onRemove: () => dispatch(categorySet(null)),
    });
  }

  if (priceMin != null || priceMax != null) {
    const min = priceMin != null ? formatCordobas(priceMin, currency) : null;
    const max = priceMax != null ? formatCordobas(priceMax, currency) : null;
    chips.push({
      id: 'price',
      label: min && max ? `${min} – ${max}` : min ? `Desde ${min}` : `Hasta ${max}`,
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
    <div className="catalog-active-filters mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Filtros:</span>

      {/* El CHIP ENTERO es el botón de quitar, no una X diminuta a su derecha:
          así el objetivo táctil llega a 44px de alto sin inflar el diseño, y no
          hay dos zonas con significados distintos dentro de la misma píldora. */}
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.onRemove}
          aria-label={`Quitar filtro ${chip.label}`}
          className="catalog-filter-chip group inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {chip.label}
          <HugeIcon
            icon={Cancel01Icon}
            size={12}
            strokeWidth={2}
            aria-hidden
            className="text-muted-foreground transition-colors group-hover:text-foreground"
          />
        </button>
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
