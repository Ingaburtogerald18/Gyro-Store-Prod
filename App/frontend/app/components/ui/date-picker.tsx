import { HugeIcon } from "~/components/ui/icon";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { cn } from '~/lib/utils';

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = 'Elegí una fecha',
  disabled,
  disableFuture = false,
  className,
}: {
  value?: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  disableFuture?: boolean;
  className?: string;
}) {
  const selected = value ? parseLocalYmd(value) : undefined;
  const [isOpen, setIsOpen] = React.useState(false);

  const disabledMatcher = React.useMemo(() => {
    if (!disableFuture) return undefined;
    return (date: Date) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return date > today;
    };
  }, [disableFuture]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start gap-2 font-normal border-border bg-card shadow-sm transition-all hover:bg-accent focus-visible:ring-primary',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <HugeIcon icon={Calendar03Icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden />
          {selected ? format(selected, "d 'de' MMMM, yyyy", { locale: es }) : placeholder}
        </Button>
      </PopoverTrigger>
      {/* pointer-events-auto permite clics cuando está en el portal del body */}
      <PopoverContent className="w-auto p-0 pointer-events-auto z-[9999]" align="start">
        <Calendar
          mode="single"
          selected={selected}
          disabled={disabledMatcher}
          onSelect={(date) => {
            if (date) {
              onChange(toYmd(date));
              setIsOpen(false);
            }
          }}
          locale={es}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// 'yyyy-MM-dd' → Date LOCAL. `new Date('yyyy-MM-dd')` se interpreta como UTC y
// puede correr un día según la zona horaria; parseando a mano se evita.
export function parseLocalYmd(ymd: string): Date | undefined {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function toYmd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function toLocalNoonIso(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return date.toISOString();
}
