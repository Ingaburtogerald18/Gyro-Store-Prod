// Selector de opciones de variante (color, conector, etc.). Una fila por eje.
//
// Consciente del STOCK REAL: `catalogDetailSchema.variants` trae cada
// combinación con su stock, así que una opción que no lleva a ninguna
// combinación disponible se muestra agotada y no se puede elegir. Antes el
// selector aceptaba cualquier combinación y el "Agregar" fallaba después.
//
// Al elegir una opción se REPARAN los otros ejes: si la selección previa deja
// la nueva combinación sin stock, los demás ejes saltan a un valor que sí exista
// — así no hay callejones sin salida.
import type { CatalogAxis, CatalogVariant } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { isLightSwatch, swatchVar } from '~/lib/productColors';
import { cn } from '~/lib/utils';

export type VariantSelection = Record<string, string>;

/** Nombre legible de la combinación elegida, en el orden de los ejes. */
export function variantLabel(axes: CatalogAxis[], selection: VariantSelection): string {
  const parts = axes.map((a) => selection[a.key]).filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Estándar';
}

/** Los ejes que de verdad ofrecen algo que elegir. */
export function pickableAxes(axes: CatalogAxis[]): CatalogAxis[] {
  return axes.filter((a) => a.options.length > 0);
}

// `variants[].axisValues` viene alineado posicionalmente con `axes`.
const valueAt = (variant: CatalogVariant, index: number) => variant.axisValues[index] ?? null;

/**
 * Resuelve la combinación exacta que corresponde a la selección.
 * Devuelve `null` si todavía faltan ejes por elegir o si no existe tal variante.
 */
export function resolveVariant(
  axes: CatalogAxis[],
  variants: CatalogVariant[],
  selection: VariantSelection,
): CatalogVariant | null {
  const pickable = pickableAxes(axes);
  if (pickable.some((a) => !selection[a.key])) return null;
  return (
    variants.find((v) => axes.every((a, i) => !selection[a.key] || valueAt(v, i) === selection[a.key])) ??
    null
  );
}

/** ¿Existe alguna combinación CON stock que use `value` en el eje `axisIndex`? */
function isAvailable(
  axes: CatalogAxis[],
  variants: CatalogVariant[],
  selection: VariantSelection,
  axisIndex: number,
  value: string,
): boolean {
  return variants.some((v) => {
    if (valueAt(v, axisIndex) !== value || v.stock <= 0) return false;
    // El resto de los ejes ya elegidos tiene que coincidir; el propio eje se
    // ignora porque es el que se está evaluando.
    return axes.every((a, i) => {
      if (i === axisIndex) return true;
      const chosen = selection[a.key];
      return !chosen || valueAt(v, i) === chosen;
    });
  });
}

export function VariantPicker({
  axes,
  variants = [],
  selection,
  onChange,
}: {
  axes: CatalogAxis[];
  /** Combinaciones con stock. Vacío = sin datos, todas las opciones habilitadas. */
  variants?: CatalogVariant[];
  selection: VariantSelection;
  onChange: (next: VariantSelection) => void;
}) {
  const pickable = pickableAxes(axes);
  if (pickable.length === 0) return null;

  // Sin `variants` no se puede saber de stock; deshabilitar todo dejaría el
  // producto incomprable, así que se degrada a "todo disponible".
  const stockKnown = variants.length > 0;

  function pick(axis: CatalogAxis, axisIndex: number, option: string) {
    const next: VariantSelection = { ...selection, [axis.key]: option };
    if (!stockKnown) {
      onChange(next);
      return;
    }
    // Reparación: cualquier otro eje que quede sin stock salta a un valor válido.
    axes.forEach((other, i) => {
      if (i === axisIndex) return;
      const chosen = next[other.key];
      if (!chosen || isAvailable(axes, variants, next, i, chosen)) return;
      const fallback = other.options.find((o) => isAvailable(axes, variants, next, i, o));
      if (fallback) next[other.key] = fallback;
    });
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {axes.map((axis, axisIndex) => {
        if (axis.options.length === 0) return null;
        const chosen = selection[axis.key];

        return (
          <div key={axis.key} className="space-y-2">
            <Label className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {/* `label` es la etiqueta para humanos ("Tipo de conector"); `key`
                  es el id interno, que antes se mostraba tal cual. */}
              {axis.label || axis.key}
              {chosen && <span className="ml-2 normal-case text-foreground">{chosen}</span>}
            </Label>

            <div className="flex flex-wrap gap-2">
              {axis.options.map((option) => {
                const enabled = !stockKnown || isAvailable(axes, variants, selection, axisIndex, option);
                const active = chosen === option;

                return axis.isColor ? (
                  <ColorSwatch
                    key={option}
                    option={option}
                    active={active}
                    enabled={enabled}
                    onSelect={() => pick(axis, axisIndex, option)}
                  />
                ) : (
                  <Button
                    key={option}
                    type="button"
                    variant="outline"
                    aria-pressed={active}
                    // Agotado se comunica por estado deshabilitado Y por tachado,
                    // no solo por un gris más claro (§8).
                    disabled={!enabled && !active}
                    onClick={() => pick(axis, axisIndex, option)}
                    // h-11: elegir variante es la decisión previa a comprar, y
                    // se toma con el pulgar. La densidad Rhea (h-8) es cómoda
                    // con mouse pero deja un objetivo de 32px en móvil.
                    className={cn(
                      'h-11 rounded-pill',
                      active
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground',
                      !enabled && !active && 'line-through',
                    )}
                  >
                    {option}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Círculo con el color aproximado + su nombre debajo (el color nunca va solo). */
function ColorSwatch({
  option,
  active,
  enabled,
  onSelect,
}: {
  option: string;
  active: boolean;
  enabled: boolean;
  onSelect: () => void;
}) {
  const swatch = swatchVar(option);

  // Color desconocido: chip de texto en vez de un círculo gris que mentiría
  // sobre cómo se ve el producto.
  if (!swatch) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={active}
        disabled={!enabled && !active}
        onClick={onSelect}
        className={cn(
          'h-11 rounded-pill',
          active ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground',
          !enabled && !active && 'line-through',
        )}
      >
        {option}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!enabled && !active}
      aria-pressed={active}
      title={enabled ? option : `${option} — agotado`}
      // min-h-11: el círculo mide 40px pero el objetivo táctil llega a 44px.
      className="group flex min-h-11 flex-col items-center gap-1 disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          'relative grid size-10 place-items-center rounded-full border transition-all',
          active
            ? 'border-transparent ring-2 ring-primary ring-offset-2 ring-offset-background'
            : 'border-border group-hover:border-primary/40',
          isLightSwatch(option) && !active && 'border-foreground/25',
          !enabled && !active && 'opacity-40',
        )}
        style={{ backgroundColor: swatch }}
      >
        {/* Agotado: barra diagonal sobre la muestra — señal de forma, no de color. */}
        {!enabled && !active && (
          <span aria-hidden className="absolute h-px w-[150%] -rotate-45 bg-foreground/70" />
        )}
      </span>
      <span
        className={cn(
          'max-w-20 truncate text-xs',
          active ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {option}
      </span>
    </button>
  );
}
