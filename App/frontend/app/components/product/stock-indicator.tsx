// Disponibilidad de la variante elegida, en texto y SIN cantidades: el cliente
// ve «Disponible», «Agotado» o «Consultar disponibilidad», nunca «Quedan 3».
//
// El punto de color acompaña, no informa: el estado siempre está ESCRITO
// (DESIGN.md §8).
import type { Availability } from '@shared/schemas';
import { AVAILABILITY_LABEL } from '~/lib/purchase';
import { cn } from '~/lib/utils';

const DOT: Record<Availability, string> = {
  available: 'bg-success',
  sold_out: 'bg-destructive',
  unknown: 'bg-warning',
};

const TEXT: Record<Availability, string> = {
  available: 'text-success',
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
