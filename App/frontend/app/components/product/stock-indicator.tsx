// Disponibilidad de la variante elegida, en texto.
//
// El punto de color acompaña, no informa: el estado siempre está ESCRITO
// ("Agotado" / "Últimas 3 unidades"). Diferenciar solo por color deja afuera a
// quien no lo distingue (DESIGN.md §8).
import { cn } from '~/lib/utils';

export type StockTone = 'out' | 'low' | 'ok';

/** Umbral bajo el cual conviene empujar: "quedan pocas". */
const LOW_STOCK_THRESHOLD = 5;

export function stockTone(stock: number): StockTone {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

export function stockLabel(stock: number): string {
  if (stock <= 0) return 'Agotado';
  if (stock <= LOW_STOCK_THRESHOLD) {
    return `Últimas ${stock} unidad${stock === 1 ? '' : 'es'}`;
  }
  return `${stock} unidades disponibles`;
}

const DOT: Record<StockTone, string> = {
  out: 'bg-destructive',
  low: 'bg-warning',
  ok: 'bg-success',
};

const TEXT: Record<StockTone, string> = {
  out: 'text-destructive',
  low: 'text-warning',
  ok: 'text-muted-foreground',
};

export function StockIndicator({ stock, className }: { stock: number; className?: string }) {
  const tone = stockTone(stock);

  return (
    <p className={cn('inline-flex items-center gap-2 text-sm font-medium', TEXT[tone], className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[tone])} />
      {stockLabel(stock)}
    </p>
  );
}
