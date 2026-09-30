// Tabla de variantes ↔ bodega. Genera TODAS las combinaciones que ofrece el
// producto (producto cartesiano de las opciones activas) y por cada una permite
// vincular uno o más LOTES de bodega, más un precio override opcional.
//
// La disponibilidad («Disponible»/«Agotado») se DERIVA del stock de los lotes
// vinculados — no hay toggles manuales. Un vendedor no puede marcar como
// disponible algo que no está en bodega.
//
// Se vincula a varios lotes porque un lote se agota y entra otro del mismo
// artículo: mientras alguno tenga unidades, la variante se sigue vendiendo.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Alert02Icon, Cancel01Icon, PackageIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';

import type { TemplateAxis, VariantMappings } from '@shared/schemas';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Spinner } from '~/components/ui/spinner';
import type { InventoryLot } from '~/store/api/catalogAdminApi';
import { cn } from '~/lib/utils';
import { formatCordobas } from '~/lib/formatters';

// Techo de combinaciones a renderizar. 6 ejes de 4 opciones son 4096 filas: el
// navegador se arrodilla y la pantalla es inusable. Se corta y se avisa.
const MAX_ROWS = 200;

// Producto cartesiano en el ORDEN de los ejes. El orden importa: el nombre que
// sale de acá ("Negro / Con micrófono") es la llave con la que el backend
// resuelve el mapeo, y tiene que coincidir exactamente.
export function buildCombinations(axes: TemplateAxis[]): string[] {
  if (!axes.length) return [];
  let combos: string[][] = [[]];
  for (const axis of axes) {
    const next: string[][] = [];
    for (const combo of combos) {
      for (const option of axis.options) next.push([...combo, option]);
    }
    combos = next;
  }
  return combos.map((combo) => combo.join(' / '));
}

interface Props {
  axes: TemplateAxis[];
  variantMappings: VariantMappings;
  onChange: (mappings: VariantMappings) => void;
  lots: InventoryLot[];
  basePrice: number;
  isLoading?: boolean;
}

export function VariantMappingTable({
  axes,
  variantMappings,
  onChange,
  lots,
  basePrice,
  isLoading,
}: Props) {
  const combinations = useMemo(() => buildCombinations(axes), [axes]);

  const lotByCode = useMemo(() => {
    const map = new Map<string, InventoryLot>();
    for (const lot of lots) map.set(lot.code, lot);
    return map;
  }, [lots]);

  // Combinaciones guardadas que ya no existen entre las opciones activas: pasa
  // al apagar una opción o al editar los ejes del molde. Se muestran igual para
  // que el vínculo no desaparezca en silencio y se pueda limpiar a mano.
  const orphans = useMemo(
    () => Object.keys(variantMappings).filter((combo) => !combinations.includes(combo)),
    [variantMappings, combinations],
  );

  const visible = combinations.slice(0, MAX_ROWS);
  const allRows = [...visible, ...orphans];

  // Un lote ya vinculado a otra variante no se ofrece de nuevo: venderían el
  // mismo stock dos veces sin que nadie lo note.
  const usedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const mapping of Object.values(variantMappings)) {
      for (const code of mapping.codes) set.add(code);
    }
    return set;
  }, [variantMappings]);

  const mappedCount = allRows.filter((combo) => (variantMappings[combo]?.codes.length ?? 0) > 0).length;

  function updateRow(combo: string, codes: string[], price?: number) {
    const next = { ...variantMappings };
    const clean = [...new Set(codes.filter(Boolean))];
    if (clean.length === 0) {
      delete next[combo];
    } else {
      next[combo] = price === undefined ? { codes: clean } : { codes: clean, price };
    }
    onChange(next);
  }

  if (!axes.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Esta plantilla no define ejes de variante, así que el producto es único.
        Vinculá el lote de bodega desde la plantilla si querés separar versiones.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{mappedCount}</span>/{allRows.length} variantes
          vinculadas · el resto se muestra <span className="font-semibold text-warning">Agotado</span>.
        </p>
        {isLoading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Cargando bodega…
          </span>
        )}
      </div>

      {combinations.length > MAX_ROWS && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          Esta combinación de ejes genera {combinations.length} variantes. Se muestran las primeras{' '}
          {MAX_ROWS}: apagá opciones en «Opciones del producto» para reducirlas.
        </p>
      )}

      <div className="space-y-2">
        {allRows.map((combo) => (
          <VariantRow
            key={combo}
            combo={combo}
            isOrphan={orphans.includes(combo)}
            codes={variantMappings[combo]?.codes ?? []}
            price={variantMappings[combo]?.price}
            lots={lots}
            lotByCode={lotByCode}
            usedCodes={usedCodes}
            basePrice={basePrice}
            onUpdate={(codes, price) => updateRow(combo, codes, price)}
          />
        ))}
      </div>
    </div>
  );
}

function VariantRow({
  combo,
  isOrphan,
  codes,
  price,
  lots,
  lotByCode,
  usedCodes,
  basePrice,
  onUpdate,
}: {
  combo: string;
  isOrphan: boolean;
  codes: string[];
  price?: number;
  lots: InventoryLot[];
  lotByCode: Map<string, InventoryLot>;
  usedCodes: Set<string>;
  basePrice: number;
  onUpdate: (codes: string[], price?: number) => void;
}) {
  const parts = useMemo(() => combo.split(/\s*\/\s*/).filter(Boolean), [combo]);
  const stock = codes.reduce((sum, code) => sum + (lotByCode.get(code)?.available ?? 0), 0);
  const hasLots = codes.length > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border p-3 transition-colors',
        isOrphan
          ? 'border-warning/40 bg-warning/5'
          : hasLots
            ? 'border-primary/25 bg-card'
            : 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn('size-2 shrink-0 rounded-full', stock > 0 ? 'bg-primary' : 'bg-warning')}
            aria-hidden
          />
          {parts.map((part) => (
            <Badge key={part} variant="secondary" className="text-2xs font-medium">
              {part}
            </Badge>
          ))}
          {isOrphan && (
            <span className="text-2xs font-medium text-warning">
              · ya no existe entre las opciones activas
            </span>
          )}
        </div>

        <Badge
          variant={stock > 0 ? 'default' : 'outline'}
          className={cn('shrink-0 text-2xs font-bold', stock === 0 && 'text-warning')}
        >
          {!hasLots ? 'Sin vincular' : stock > 0 ? `${stock} uds` : 'Agotado'}
        </Badge>
      </div>

      <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
        {codes.map((code) => {
          const lot = lotByCode.get(code);
          return (
            <div
              key={code}
              className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-2.5 py-1.5"
            >
              <HugeIcon icon={PackageIcon} size={14} strokeWidth={2} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="font-bold text-primary">[{code}]</span>{' '}
                <span className="text-foreground">{lot?.productName ?? 'Lote no encontrado en bodega'}</span>
              </span>
              <span className="shrink-0 text-2xs font-semibold text-muted-foreground">
                {lot ? `${lot.available} uds` : '—'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Quitar lote ${code}`}
                onClick={() => onUpdate(codes.filter((c) => c !== code), price)}
              >
                <HugeIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              </Button>
            </div>
          );
        })}

        <LotPicker
          lots={lots}
          // El lote ya vinculado a ESTA fila tampoco se reofrece, ni los de otras.
          excluded={usedCodes}
          onSelect={(code) => {
            const selectedLot = lots.find((l) => l.code === code);
            const nextPrice = selectedLot?.suggestedPrice ?? price;
            onUpdate([...codes, code], nextPrice);
          }}
          hasLots={hasLots}
        />

        {hasLots && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min={0}
              step="0.01"
              className="h-8 w-32 text-xs"
              placeholder={formatCordobas(basePrice)}
              value={price ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                onUpdate(codes, raw ? Number(raw) : undefined);
              }}
            />
            <span className="text-2xs text-muted-foreground">
              Precio propio de esta variante (opcional)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Buscador contra los lotes recibidos. Se ocultan los agotados: vincular un lote
// en cero no aporta stock y solo ensucia la fila.
function LotPicker({
  lots,
  excluded,
  onSelect,
  hasLots,
}: {
  lots: InventoryLot[];
  excluded: Set<string>;
  onSelect: (code: string) => void;
  hasLots: boolean;
}) {
  const [open, setOpen] = useState(false);

  const available = useMemo(
    () => lots.filter((lot) => lot.available > 0 && !excluded.has(lot.code) && !lot.linkedTo),
    [lots, excluded],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs">
          <HugeIcon icon={hasLots ? Add01Icon : Search01Icon} size={14} strokeWidth={2} />
          {hasLots ? 'Vincular otro lote' : 'Vincular lote de bodega'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por código o producto…" />
          <CommandList>
            <CommandEmpty>
              <span className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <HugeIcon icon={Alert02Icon} size={14} strokeWidth={2} />
                No hay lotes con stock sin vincular.
              </span>
            </CommandEmpty>
            <CommandGroup>
              {available.map((lot) => (
                <CommandItem
                  key={lot.code}
                  // `value` es lo que filtra cmdk: incluye nombre y lote para que
                  // se pueda buscar por cualquiera de los tres.
                  value={`${lot.code} ${lot.productName} ${lot.lot}`}
                  onSelect={() => {
                    onSelect(lot.code);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <HugeIcon
                    icon={PackageIcon}
                    size={14}
                    strokeWidth={2}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed">
                    <span className="font-bold text-primary">[{lot.code}]</span> {lot.productName}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-2xs font-bold">
                    {lot.available} uds
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
