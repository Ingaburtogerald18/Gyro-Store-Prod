// Barra de herramientas del catálogo: conteo de resultados, orden, y —en
// escritorio— los filtros rápidos. En móvil el botón "Filtros" abre el bottom
// sheet, con un badge que dice cuántos hay puestos.
//
// El conteo sale del MISMO hook que usa la grilla (useCatalogFilter). Cuando
// cada uno filtraba por su lado, la barra decía "24 productos" sobre una grilla
// de 8.
import { HugeIcon } from '~/components/ui/icon';
import { FilterHorizontalIcon, PackageSearchIcon, Tag01Icon, Tick01Icon } from '@hugeicons/core-free-icons';

import type { CatalogProduct } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useCatalogFilter } from '~/hooks/useCatalogFilter';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  type CatalogSort,
  filterSheetSet,
  onlyInStockSet,
  onlyOnSaleSet,
  priceMaxSet,
  priceMinSet,
  selectActiveFilterCount,
  selectOnlyInStock,
  selectOnlyOnSale,
  selectPriceMax,
  selectPriceMin,
  selectSort,
  sortSet,
} from '~/store/slices/uiSlice';
import { cn } from '~/lib/utils';

const SORTS: Array<{ value: CatalogSort; label: string }> = [
  { value: 'relevant', label: 'Relevancia' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
];

export function FilterBar({ products, categories = [] }: { products: CatalogProduct[], categories?: import('@shared/schemas').Category[] }) {
  const dispatch = useAppDispatch();
  const sort = useAppSelector(selectSort);
  const priceMin = useAppSelector(selectPriceMin);
  const priceMax = useAppSelector(selectPriceMax);
  const onlyOnSale = useAppSelector(selectOnlyOnSale);
  const onlyInStock = useAppSelector(selectOnlyInStock);
  const activeCount = useAppSelector(selectActiveFilterCount);

  const { filtered } = useCatalogFilter(products, categories);
  const count = filtered.length;

  return (
    <div className="catalog-filter-bar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 sm:gap-3 sm:px-4">
      {/* Móvil: un solo botón que abre el sheet. */}
      <Button
        variant="outline"
        onClick={() => dispatch(filterSheetSet(true))}
        // h-11 en móvil (44px): es el control principal de esta barra en el
        // tamaño donde se toca con el pulgar.
        className="catalog-filter-control shrink-0 lg:hidden"
      >
        <HugeIcon icon={FilterHorizontalIcon} size={16} strokeWidth={2} aria-hidden />
        Filtros
        {activeCount > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-primary text-2xs font-bold text-primary-foreground tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>

      {/* Escritorio: los filtros a la vista, sin abrir nada. */}
      <div className="mr-auto hidden items-center gap-3 lg:flex">
        <div role="group" aria-label="Rango de precio" className="flex items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-foreground">Precio</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={priceMin ?? ''}
            onChange={(e) =>
              dispatch(priceMinSet(e.target.value.trim() === '' ? null : Number(e.target.value)))
            }
            placeholder="Mín"
            aria-label="Precio mínimo"
            className="catalog-filter-control w-24 tabular-nums"
          />
          <span className="text-muted-foreground" aria-hidden>
            —
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={priceMax ?? ''}
            onChange={(e) =>
              dispatch(priceMaxSet(e.target.value.trim() === '' ? null : Number(e.target.value)))
            }
            placeholder="Máx"
            aria-label="Precio máximo"
            className="catalog-filter-control w-24 tabular-nums"
          />
        </div>

        <FilterToggle
          icon={Tag01Icon}
          label="Ofertas"
          active={onlyOnSale}
          onToggle={() => dispatch(onlyOnSaleSet(!onlyOnSale))}
        />
        <FilterToggle
          icon={PackageSearchIcon}
          label="Disponibles"
          active={onlyInStock}
          onToggle={() => dispatch(onlyInStockSet(!onlyInStock))}
        />
      </div>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3 lg:flex-none">
        <Select value={sort} onValueChange={(v) => dispatch(sortSet(v as CatalogSort))}>
          {/* Ancho flexible en móvil: los órdenes largos se truncan dentro del
              control, sin empujar el botón Filtros fuera de la barra. */}
          <SelectTrigger className="catalog-filter-control w-full min-w-0 sm:w-56 lg:w-60" aria-label="Ordenar catálogo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="catalog-filter-sort-menu p-1" position="popper" align="end">
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* El conteo se esconde en móvil: a 375px no entraba junto a Filtros y
            Orden y se salía del borde de la barra. */}
        <p className="hidden items-baseline gap-1 text-sm text-muted-foreground sm:flex">
          <span className="grid min-h-8 min-w-8 place-items-center rounded-lg bg-primary px-2 font-bold text-primary-foreground tabular-nums">{count}</span>
          {count === 1 ? 'producto' : 'productos'}
        </p>
      </div>
    </div>
  );
}

/** Filtro binario. El estado activo cambia fondo Y peso, no solo color (§8). */
function FilterToggle({
  icon,
  label,
  active,
  onToggle,
}: {
  icon: Parameters<typeof HugeIcon>[0]['icon'];
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      onClick={onToggle}
      aria-pressed={active}
      className={cn('catalog-filter-control catalog-filter-toggle', active && 'font-semibold')}
    >
      <HugeIcon icon={active ? Tick01Icon : icon} size={16} strokeWidth={2} aria-hidden className="text-primary-2" />
      {label}
    </Button>
  );
}
