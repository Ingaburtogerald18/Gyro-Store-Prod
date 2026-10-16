// Filtros en móvil sobre <Sheet> (foco, Escape y scroll resueltos). Solo edita el uiSlice;
// quien filtra es useCatalogFilter.
import { HugeIcon } from '~/components/ui/icon';
import { PackageSearchIcon, Tag01Icon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { PriceInput } from '~/components/catalog/filter-bar';
import { categoriesWithProducts, priceRangeError } from '~/lib/catalog-query';
import { Label } from '~/components/ui/label';
import { NativeSelect } from '~/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Switch } from '~/components/ui/switch';
import { useCategoryCounts, useStoreConfig } from '~/hooks/use-store-config';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import {
  categorySet,
  filterSheetSet,
  filtersReset,
  onlyInStockSet,
  onlyOnSaleSet,
  priceMaxSet,
  priceMinSet,
  selectActiveCategory,
  selectFilterSheetOpen,
  selectOnlyInStock,
  selectOnlyOnSale,
  selectPriceMax,
  selectPriceMin,
} from '~/state/slices/ui-slice';

export function FilterSheet({ resultCount }: { resultCount: number }) {
  const dispatch = useAppDispatch();
  const config = useStoreConfig();
  const counts = useCategoryCounts();
  const open = useAppSelector(selectFilterSheetOpen);
  const activeCategory = useAppSelector(selectActiveCategory);
  const priceMin = useAppSelector(selectPriceMin);
  const priceMax = useAppSelector(selectPriceMax);
  const onlyOnSale = useAppSelector(selectOnlyOnSale);
  const onlyInStock = useAppSelector(selectOnlyInStock);
  const priceError = priceRangeError({ priceMin, priceMax });
  // Las mismas que el menú: las que tienen productos, con su nombre completo.
  const categories = categoriesWithProducts(config?.categories ?? [], counts);

  return (
    <Sheet open={open} onOpenChange={(next) => dispatch(filterSheetSet(next))}>
      <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Elegí la categoría y afiná por precio y disponibilidad.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-2">
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="filter-category" className="text-sm font-semibold text-foreground">
                Categoría
              </Label>
              {/* Elegir otra lleva a su página (CatalogUrlSync), con su listado completo y los demás filtros. */}
              <NativeSelect
                id="filter-category"
                className="w-full"
                value={activeCategory ?? ''}
                onChange={(event) => dispatch(categorySet(event.target.value || null))}
              >
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">
              Rango de precio ({config?.currency ?? 'C$'})
            </legend>
            <div className="flex items-center gap-3">
              <PriceField
                id="filter-price-min"
                label="Mínimo"
                value={priceMin}
                onChange={(v) => dispatch(priceMinSet(v))}
                invalid={Boolean(priceError)}
              />
              <span className="mt-5 text-muted-foreground" aria-hidden>
                —
              </span>
              <PriceField
                id="filter-price-max"
                label="Máximo"
                value={priceMax}
                onChange={(v) => dispatch(priceMaxSet(v))}
                invalid={Boolean(priceError)}
              />
            </div>
            {priceError && (
              <p role="alert" className="text-sm font-medium text-destructive">{priceError}</p>
            )}
          </fieldset>

          <div className="space-y-1 border-t border-border pt-4">
            <ToggleRow
              icon={Tag01Icon}
              label="Solo en oferta"
              checked={onlyOnSale}
              onChange={(v) => dispatch(onlyOnSaleSet(v))}
            />
            <ToggleRow
              icon={PackageSearchIcon}
              label="Solo disponibles"
              checked={onlyInStock}
              onChange={(v) => dispatch(onlyInStockSet(v))}
            />
          </div>
        </div>

        <SheetFooter className="gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {resultCount === 0 && (
            <p role="status" className="text-sm font-medium text-foreground">
              Ningún producto coincide. Probá con «Limpiar» o con otra categoría.
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => dispatch(filtersReset())} className="h-12 flex-1">
              Limpiar
            </Button>
            <Button onClick={() => dispatch(filterSheetSet(false))} className="h-12 flex-[2]">
              {resultCount === 0 ? 'Ver resultados' : `Ver ${resultCount} ${resultCount === 1 ? 'producto' : 'productos'}`}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Campo de precio con su rótulo visible. Vacío = sin tope, que no es lo mismo que 0. */
function PriceField({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  invalid?: boolean;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <PriceInput id={id} label={label} placeholder="Sin tope" value={value} invalid={invalid} onChange={onChange} className="h-12 w-full text-base" />
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: Parameters<typeof HugeIcon>[0]['icon'];
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // La fila entera mide 48px de alto y es el label del switch: en móvil se
  // acierta el texto mucho más fácil que el control de 20px.
  return (
    <Label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-sm font-medium text-foreground">
      <span className="flex items-center gap-2">
        <HugeIcon
          icon={icon}
          size={16}
          strokeWidth={2}
          aria-hidden
          className={checked ? 'text-primary-2' : 'text-muted-foreground'}
        />
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Label>
  );
}
