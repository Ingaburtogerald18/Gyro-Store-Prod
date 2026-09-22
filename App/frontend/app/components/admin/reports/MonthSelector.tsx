import { useState } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

export interface MonthYear {
  year: number;
  month: number; // 0-indexed: 0 = Enero, 11 = Diciembre
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MONTH_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export function getMonthRange(year: number, month: number) {
  // Inicio del mes a las 00:00:00.000 local
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  // Fin del mes a las 23:59:59.999 local
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export function MonthSelector({
  value,
  onChange,
  className,
}: {
  value: MonthYear;
  onChange: (next: MonthYear) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.year);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const isCurrentMonth = value.year === currentYear && value.month === currentMonth;

  // No permitir navegar al futuro con la flecha derecha
  const canGoNext =
    value.year < currentYear || (value.year === currentYear && value.month < currentMonth);

  function handlePrevMonth() {
    if (value.month === 0) {
      onChange({ year: value.year - 1, month: 11 });
      setViewYear(value.year - 1);
    } else {
      onChange({ year: value.year, month: value.month - 1 });
    }
  }

  function handleNextMonth() {
    if (!canGoNext) return;
    if (value.month === 11) {
      onChange({ year: value.year + 1, month: 0 });
      setViewYear(value.year + 1);
    } else {
      onChange({ year: value.year, month: value.month + 1 });
    }
  }

  function handleSelectMonth(mIndex: number) {
    onChange({ year: viewYear, month: mIndex });
    setOpen(false);
  }

  function handleGoToCurrentMonth() {
    onChange({ year: currentYear, month: currentMonth });
    setViewYear(currentYear);
    setOpen(false);
  }

  const isNextYearDisabled = viewYear >= currentYear;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card/90 p-1 shadow-xs backdrop-blur-xs',
        className,
      )}
    >
      {/* Flecha izquierda: mes anterior */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevMonth}
        title="Mes anterior"
        className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
      >
        <HugeIcon icon={ArrowLeft01Icon} size={15} strokeWidth={2.2} />
      </Button>

      {/* Popover con selector de mes y año */}
      <Popover
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (isOpen) setViewYear(value.year);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <HugeIcon
              icon={Calendar03Icon}
              size={15}
              strokeWidth={2}
              className="text-primary/90"
            />
            <span className="capitalize">
              {MONTH_NAMES[value.month]} {value.year}
            </span>
            <HugeIcon
              icon={ArrowDown01Icon}
              size={13}
              strokeWidth={2}
              className={cn(
                'text-muted-foreground transition-transform duration-150',
                open && 'rotate-180 text-foreground',
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="center"
          sideOffset={6}
          className="w-72 rounded-2xl border border-border bg-card p-3 shadow-xl"
        >
          {/* Navegación de año */}
          <div className="mb-3 flex items-center justify-between border-b border-border/60 px-1 pb-2.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewYear((y) => y - 1)}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground"
              title="Año anterior"
            >
              <HugeIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
            </Button>
            <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
              {viewYear}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewYear((y) => y + 1)}
              disabled={isNextYearDisabled}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Año siguiente"
            >
              <HugeIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
            </Button>
          </div>

          {/* Cuadrícula de 12 meses */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_SHORT.map((name, idx) => {
              const isFuture =
                viewYear > currentYear || (viewYear === currentYear && idx > currentMonth);
              const isSelected = value.year === viewYear && value.month === idx;
              const isThisMonth = currentYear === viewYear && currentMonth === idx;

              return (
                <button
                  key={name}
                  type="button"
                  disabled={isFuture}
                  onClick={() => handleSelectMonth(idx)}
                  className={cn(
                    'relative flex h-9 items-center justify-center rounded-lg text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-primary font-semibold text-primary-foreground shadow-xs'
                      : 'text-foreground/80 hover:bg-muted/80 hover:text-foreground',
                    isThisMonth && !isSelected && 'border border-primary/40 text-primary font-semibold',
                    isFuture && 'cursor-not-allowed opacity-25 hover:bg-transparent hover:text-foreground/80',
                  )}
                >
                  {name}
                  {isThisMonth && !isSelected && (
                    <span className="absolute bottom-1 size-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Botón para volver al mes actual */}
          {!isCurrentMonth && (
            <div className="mt-3 border-t border-border/60 pt-2 text-center">
              <button
                type="button"
                onClick={handleGoToCurrentMonth}
                className="w-full rounded-md py-1 text-center text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                Ir al mes actual ({MONTH_SHORT[currentMonth]} {currentYear})
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Flecha derecha: mes siguiente */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleNextMonth}
        disabled={!canGoNext}
        title={canGoNext ? 'Mes siguiente' : 'No se puede seleccionar un mes futuro'}
        className="size-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
      >
        <HugeIcon icon={ArrowRight01Icon} size={15} strokeWidth={2.2} />
      </Button>
    </div>
  );
}
