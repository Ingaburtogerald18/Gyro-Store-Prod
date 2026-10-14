// Selector de opciones de variante (color, conector, etc.). Una fila por eje.
// Lo usan la ficha y el selector rápido: las reglas viven en `lib/purchase.ts`.
//
// Todas las opciones se pueden elegir — también una agotada o sin stock
// verificable — para que la persona vea su estado y pueda consultarla por
// WhatsApp. Nada se cambia solo: si la combinación elegida no se puede comprar,
// el estado lo explica y «Cambiar selección» limpia los ejes.
import type { Availability, CatalogAxis, CatalogVariant } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { isLightSwatch, swatchVar } from '~/lib/product-colors';
import {
  AVAILABILITY_LABEL,
  optionAvailability,
  pickableAxes,
  type VariantSelection,
} from '~/lib/purchase';
import { cn } from '~/lib/utils';

export function VariantPicker({
  axes,
  variants = [],
  selection,
  onChange,
  missingKey,
  layout = 'stacked',
  idPrefix = 'variant',
}: {
  axes: CatalogAxis[];
  variants?: CatalogVariant[];
  selection: VariantSelection;
  onChange: (next: VariantSelection) => void;
  /** Eje que falta elegir al intentar agregar: se marca y se explica. */
  missingKey?: string;
  /** Filas con rótulo al lado en la ficha de escritorio; apiladas en móvil. */
  layout?: 'stacked' | 'rows';
  /** Prefijo de ids (ficha y selector rápido pueden convivir en la página). */
  idPrefix?: string;
}) {
  const pickable = pickableAxes(axes);
  if (pickable.length === 0) return null;

  const sorted = [...pickable].sort((a, b) => (a.isColor === b.isColor ? 0 : a.isColor ? -1 : 1));

  return (
    <div className={layout === 'rows' ? 'space-y-4' : 'space-y-4'}>
      {sorted.map((axis) => {
        const axisIndex = axes.indexOf(axis);
        const chosen = selection[axis.key];
        const labelId = `${idPrefix}-${axisIndex}-label`;
        const errorId = `${idPrefix}-${axisIndex}-error`;
        const missing = missingKey === axis.key;

        return (
          <div
            key={axis.key}
            role="group"
            aria-labelledby={labelId}
            aria-describedby={missing ? errorId : undefined}
            className={cn('space-y-2', layout === 'rows' && 'lg:grid lg:grid-cols-[6.5rem_minmax(0,1fr)] lg:items-start lg:gap-3 lg:space-y-0')}
          >
            <p id={labelId} className={cn('text-sm font-medium text-foreground', layout === 'rows' && 'lg:pt-3')}>
              {axis.label || axis.key}
              {chosen && <span className={cn('ml-2 font-normal text-muted-foreground', layout === 'rows' && 'lg:ml-0 lg:block')}>{chosen}</span>}
            </p>

            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                {axis.options.map((option) => {
                  const state = optionAvailability(axes, variants, selection, axisIndex, option);
                  const active = chosen === option;
                  const select = () => onChange({ ...selection, [axis.key]: option });
                  return axis.isColor && swatchVar(option) ? (
                    <ColorSwatch key={option} option={option} active={active} state={state} onSelect={select} />
                  ) : (
                    <OptionChip key={option} option={option} active={active} state={state} onSelect={select} />
                  );
                })}
              </div>
              {missing && (
                <p id={errorId} className="text-sm font-medium text-destructive">
                  Elegí {(axis.label || axis.key).toLowerCase()} para continuar.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Sufijo accesible de una opción no comprable: el estado nunca va solo en color. */
function stateSuffix(state: Availability) {
  return state === 'available' ? '' : ` — ${AVAILABILITY_LABEL[state].toLowerCase()}`;
}

function OptionChip({
  option,
  active,
  state,
  onSelect,
}: {
  option: string;
  active: boolean;
  state: Availability;
  onSelect: () => void;
}) {
  const unavailable = state !== 'available';
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={active}
      aria-label={`${option}${stateSuffix(state)}`}
      onClick={onSelect}
      className={cn(
        'h-11 rounded-xl px-4',
        active ? 'font-semibold' : 'text-foreground',
        unavailable && !active && 'border-dashed text-muted-foreground',
      )}
    >
      <span className={cn(state === 'sold_out' && !active && 'line-through decoration-1')}>{option}</span>
    </Button>
  );
}

/** Círculo con el color aproximado + su nombre debajo (el color nunca va solo). */
function ColorSwatch({
  option,
  active,
  state,
  onSelect,
}: {
  option: string;
  active: boolean;
  state: Availability;
  onSelect: () => void;
}) {
  const swatch = swatchVar(option);
  const unavailable = state !== 'available';
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      aria-label={`${option}${stateSuffix(state)}`}
      // min-h-11: el círculo mide 40px pero el objetivo táctil llega a 44px.
      className="group flex min-h-11 min-w-11 flex-col items-center gap-1 rounded-xl p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className={cn(
          'relative grid size-10 place-items-center rounded-full border transition-colors motion-reduce:transition-none',
          active
            ? 'border-transparent ring-2 ring-primary-2 ring-offset-2 ring-offset-background'
            : 'border-border group-hover:border-primary-2/60 dark:border-foreground/35',
          isLightSwatch(option) && !active && 'border-foreground/25',
          unavailable && !active && 'opacity-50',
        )}
        style={{ backgroundColor: swatch ?? undefined }}
      >
        {/* Agotado: barra diagonal — señal de forma, no de color. */}
        {state === 'sold_out' && (
          <span className="absolute h-px w-[150%] -rotate-45 bg-foreground/70" />
        )}
      </span>
      <span className={cn('max-w-20 truncate text-xs', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
        {option}
      </span>
    </button>
  );
}
