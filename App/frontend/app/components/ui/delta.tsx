// Variación porcentual contra el periodo anterior.
//
// ── Las tres decisiones que lo hacen honesto ──
//
// 1. Con `prev === 0` muestra "—", no "+100 %" ni "∞". Pasar de 0 a 5 ventas no
//    es "un 100 % más": es el primer periodo con datos. Inventar un porcentaje
//    ahí es mentir con precisión decimal.
//
// 2. `invert` para las métricas donde subir es MALO. El coste subiendo 12 % es
//    una mala noticia pintada de verde si el color solo mira el signo. Con
//    `invert`, el color sigue al SIGNIFICADO y no al signo aritmético.
//
// 3. La flecha sigue al número (sube = ↑), el color sigue al significado. Son
//    dos ejes distintos a propósito: en el coste, la flecha sube y el color es
//    rojo, y eso se lee correctamente de un vistazo.
import { ArrowDown02Icon, ArrowUp02Icon } from '@hugeicons/core-free-icons';

import { HugeIcon } from '~/components/ui/icon';
import { cn } from '~/lib/utils';

export function Delta({
  value,
  prev,
  invert = false,
  className,
}: {
  value: number;
  prev: number | undefined;
  /** true cuando subir es malo (coste, gastos). */
  invert?: boolean;
  className?: string;
}) {
  if (prev === undefined || prev === 0) {
    return (
      <span
        className={cn('text-xs text-muted-foreground', className)}
        title="Sin datos del periodo anterior para comparar"
      >
        —
      </span>
    );
  }

  const ratio = (value - prev) / Math.abs(prev);
  const pct = ratio * 100;
  const up = ratio > 0;
  // El "bueno" depende de la métrica, no del signo.
  const good = invert ? !up : up;
  const flat = Math.abs(pct) < 0.05;

  const formatted = `${up ? '+' : ''}${pct.toLocaleString('es-NI', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;

  if (flat) {
    return <span className={cn('nums text-xs text-muted-foreground', className)}>Sin cambio</span>;
  }

  return (
    <span
      className={cn(
        'nums inline-flex items-center gap-0.5 text-xs font-medium',
        good ? 'text-foreground' : 'text-destructive',
        className,
      )}
      // El lector de pantalla no puede interpretar una flecha ni un color.
      aria-label={`${Math.abs(pct).toFixed(1)} % ${up ? 'más' : 'menos'} que el periodo anterior`}
    >
      <HugeIcon
        icon={up ? ArrowUp02Icon : ArrowDown02Icon}
        size={12}
        strokeWidth={2.5}
        aria-hidden
      />
      {formatted}
    </span>
  );
}
