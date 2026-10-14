// Barra del catálogo. El conteo sale del mismo hook que la grilla para que
// nunca digan cifras distintas.
import { HugeIcon } from '~/components/ui/icon';
import { FilterHorizontalIcon, PackageSearchIcon, Tag01Icon, Tick01Icon } from '@hugeicons/core-free-icons';

import type { CatalogProduct } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { Toolbar } from '~/components/ui/toolbar';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useCatalogFilter } from '~/hooks/use-catalog-filter';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
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
} from '~/state/slices/ui-slice';
import { cn } from '~/lib/utils';

const SORTS: Array<{ value: CatalogSort; label: string }> = [
  // Sin un cálculo de relevancia real: el orden que define la tienda.
  { value: 'relevant', label: 'Recomendados' },
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

  const { filtered, priceError } = useCatalogFilter(products, categories);
  const count = filtered.length;

  return (
    <Toolbar className="mb-4 gap-2 sm:gap-3 sm:px-4">
      {/* Móvil: un solo botón que abre el sheet. */}
      <Button
        variant="outline"
        onClick={() => dispatch(filterSheetSet(true))}
        className="shrink-0 lg:hidden"
      >
        <HugeIcon icon={FilterHorizontalIcon} size={16} strokeWidth={2} aria-hidden />
        Filtros
        {activeCount > 0 && (
          <Chip variant="count">{activeCount}</Chip>
        )}
      </Button>

      {/* Escritorio: los filtros a la vista, sin abrir nada. */}
      <div className="mr-auto hidden items-center gap-3 lg:flex">
        <div className="relative">
          <div role="group" aria-label="Rango de precio" aria-describedby={priceError ? 'catalog-price-error' : undefined} className="flex items-center gap-2">
            <span className="mr-1 text-sm font-semibold text-foreground">Precio</span>
            <PriceInput label="Precio mínimo" placeholder="Mín" value={priceMin} invalid={Boolean(priceError)} onChange={(v) => dispatch(priceMinSet(v))} />
            <span className="text-muted-foreground" aria-hidden>
              —
            </span>
            <PriceInput label="Precio máximo" placeholder="Máx" value={priceMax} invalid={Boolean(priceError)} onChange={(v) => dispatch(priceMaxSet(v))} />
          </div>
          {priceError && (
            <p id="catalog-price-error" role="alert" className="absolute top-full left-0 mt-1 text-xs font-medium whitespace-nowrap text-destructive">
              {priceError}
            </p>
          )}
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
          <SelectTrigger className="w-full min-w-0 sm:w-56 lg:w-60" aria-label="Ordenar catálogo">
            {/* Texto explícito: se ve desde el HTML del servidor, antes de hidratar. */}
            <SelectValue>{SORTS.find((o) => o.value === sort)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent className="p-1" position="popper" align="end">
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* En móvil no entra junto a Filtros y Orden. */}
        <p className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
          <Chip variant="count" className="h-7 min-w-7 rounded-xl text-sm">{count}</Chip>
          {count === 1 ? 'producto' : 'productos'}
        </p>
      </div>
    </Toolbar>
  );
}

/** Precio: vacío = sin tope (no es 0); negativos y texto no se aceptan. */
export function PriceInput({
  label,
  placeholder,
  value,
  invalid,
  onChange,
  id,
  className,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  invalid?: boolean;
  onChange: (v: number | null) => void;
  id?: string;
  className?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value.trim();
        const n = Number(raw);
        onChange(raw === '' || !Number.isFinite(n) ? null : Math.max(0, n));
      }}
      placeholder={placeholder}
      aria-label={id ? undefined : label}
      aria-invalid={invalid || undefined}
      className={cn('w-24 tabular-nums', className)}
    />
  );
}

/** Filtro binario: la selección la marca el estilo global de aria-pressed. */
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
      variant="outline"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(active && 'font-semibold')}
    >
      <HugeIcon icon={active ? Tick01Icon : icon} size={16} strokeWidth={2} aria-hidden className="text-primary-2" />
      {label}
    </Button>
  );
}
