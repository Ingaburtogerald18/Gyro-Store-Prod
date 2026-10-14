// Disponibilidad en texto y sin cantidades: nunca «Quedan 3». El punto acompaña; el estado está escrito.
import type { Availability } from '@shared/schemas';
import { AVAILABILITY_LABEL } from '~/lib/purchase';
import { cn } from '~/lib/utils';

const DOT: Record<Availability, string> = {
  available: 'bg-success',
  coming_soon: 'bg-primary-2',
  sold_out: 'bg-destructive',
  unknown: 'bg-warning',
};

const TEXT: Record<Availability, string> = {
  available: 'text-foreground',
  coming_soon: 'text-foreground',
  sold_out: 'text-destructive',
  unknown: 'text-foreground',
};

export function StockIndicator({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  return (
    <p className={cn('inline-flex items-center gap-2 text-sm font-medium', TEXT[availability], className)}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[availability])} />
      {AVAILABILITY_LABEL[availability]}
    </p>
  );
}
