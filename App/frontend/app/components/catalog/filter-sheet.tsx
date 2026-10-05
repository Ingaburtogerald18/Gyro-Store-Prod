// Filtros avanzados en móvil: sube desde abajo, al alcance del pulgar.
//
// Sobre <Sheet> de shadcn (Radix): foco atrapado, cierre con Escape, bloqueo del
// scroll de fondo y aria del diálogo vienen resueltos. El V1 los reimplementaba
// a mano con un portal y un useEffect sobre document.body.
//
// Acá solo se EDITA el estado del uiSlice; quien filtra es useCatalogFilter.
import { HugeIcon } from '~/components/ui/icon';
import { PackageSearchIcon, Tag01Icon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Switch } from '~/components/ui/switch';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  filterSheetSet,
  filtersReset,
  onlyInStockSet,
  onlyOnSaleSet,
  priceMaxSet,
  priceMinSet,
  selectFilterSheetOpen,
  selectOnlyInStock,
  selectOnlyOnSale,
  selectPriceMax,
  selectPriceMin,
} from '~/store/slices/uiSlice';

export function FilterSheet() {
  const dispatch = useAppDispatch();
  const { data: config } = useGetConfigQuery();
  const open = useAppSelector(selectFilterSheetOpen);
  const priceMin = useAppSelector(selectPriceMin);
  const priceMax = useAppSelector(selectPriceMax);
  const onlyOnSale = useAppSelector(selectOnlyOnSale);
  const onlyInStock = useAppSelector(selectOnlyInStock);

  return (
    <Sheet open={open} onOpenChange={(next) => dispatch(filterSheetSet(next))}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Afiná el catálogo por precio y disponibilidad.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-2">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Rango de precio ({config?.currency ?? 'C$'})
            </legend>
            <div className="flex items-center gap-3">
              <PriceField
                id="filter-price-min"
                label="Mínimo"
                value={priceMin}
                onChange={(v) => dispatch(priceMinSet(v))}
              />
              <span className="mt-5 text-muted-foreground" aria-hidden>
                —
              </span>
              <PriceField
                id="filter-price-max"
                label="Máximo"
                value={priceMax}
                onChange={(v) => dispatch(priceMaxSet(v))}
              />
            </div>
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

        <SheetFooter className="flex-row gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={() => dispatch(filtersReset())} className="h-11 flex-1">
            Limpiar
          </Button>
          <Button onClick={() => dispatch(filterSheetSet(false))} className="h-11 flex-[2]">
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Campo de precio. Vacío = sin tope, que no es lo mismo que 0. */
function PriceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex-1 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === '' ? null : Number(raw));
        }}
        placeholder="—"
        className="h-11 tabular-nums"
      />
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
