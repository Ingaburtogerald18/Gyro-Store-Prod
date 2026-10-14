// Con `prev === 0` muestra «—»: de 0 a 5 no es «+100 %». `invert` para métricas donde subir es malo:
// la flecha sigue al número y el color al significado.
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
