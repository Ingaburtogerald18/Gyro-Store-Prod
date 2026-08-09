// Selector de periodo: los presets rápidos como pestañas y, al elegir "Rango",
// dos DatePicker para el rango libre. El estado vive arriba (la ruta) porque
// TODAS las queries del reporte dependen de él.
import { DatePicker } from '~/components/ui/date-picker';
import { AnimatedTabs } from '~/components/ui/AnimatedTabs';
import { cn } from '~/lib/utils';
import { PERIOD_TABS, type CustomRange, type PeriodId } from './period';

export function PeriodPicker({
  period,
  onPeriodChange,
  custom,
  onCustomChange,
  layoutId,
  className,
}: {
  period: PeriodId;
  onPeriodChange: (id: PeriodId) => void;
  custom: CustomRange;
  onCustomChange: (next: CustomRange) => void;
  /** Único por página: dos grupos de tabs no pueden compartir el indicador. */
  layoutId: string;
  className?: string;
}) {
  const incomplete = period === 'range' && (!custom.from || !custom.to);
  const inverted = period === 'range' && custom.from && custom.to && custom.from > custom.to;

  return (
    <div className={cn('flex flex-col items-start gap-3 sm:items-end', className)}>
      <AnimatedTabs
        items={PERIOD_TABS}
        value={period}
        onChange={(id) => onPeriodChange(id as PeriodId)}
        layoutId={layoutId}
        className="flex-wrap"
      />

      {period === 'range' && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <DatePicker
            value={custom.from}
            onChange={(from) => onCustomChange({ ...custom, from })}
            placeholder="Desde"
            className="sm:w-52"
          />
          <span aria-hidden className="hidden text-muted-foreground sm:inline">
            —
          </span>
          <DatePicker
            value={custom.to}
            onChange={(to) => onCustomChange({ ...custom, to })}
            placeholder="Hasta"
            className="sm:w-52"
          />
        </div>
      )}

      {/* Sin las dos fechas el backend no recibe filtro y devolvería el
          histórico completo: mejor decirlo que mostrar un número engañoso. */}
      {period === 'range' && (incomplete || inverted) && (
        <p className="text-xs text-warning">
          {inverted
            ? 'La fecha "desde" es posterior a la de "hasta".'
            : 'Elegí las dos fechas para filtrar el periodo.'}
        </p>
      )}
    </div>
  );
}
