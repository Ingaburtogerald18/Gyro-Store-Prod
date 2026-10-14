// Esqueletos con la forma del contenido real: mismo alto, radio y grilla, nunca un spinner ni un
// salto de layout. Una forma nueva se agrega acá, no en la ruta.
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';

/**
 * Fila de StatCards. `n` tiene que coincidir con la cantidad real de tarjetas,
 * o al llegar los datos la grilla salta.
 */
export function SkeletonStatRow({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-2', n >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-3', className)}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Anchos fijos y no aleatorios: con `Math.random()` el esqueleto temblaría en cada render. */
const COL_WIDTHS = ['w-24', 'w-40', 'w-20', 'w-28', 'w-16', 'w-32'];

export function SkeletonTable({
  rows = 8,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card', className)}>
      <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-3 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', COL_WIDTHS[i % COL_WIDTHS.length])} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-t border-border/60 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4', COL_WIDTHS[(r + c) % COL_WIDTHS.length])} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Alturas fijas por el mismo motivo que los anchos de la tabla. */
const BAR_HEIGHTS = ['h-1/3', 'h-1/2', 'h-2/3', 'h-1/4', 'h-3/4', 'h-2/5', 'h-4/5', 'h-1/2', 'h-3/5', 'h-1/3'];

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-sm" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex h-64 items-end gap-2 pl-10">
        {BAR_HEIGHTS.map((h, i) => (
          <Skeleton key={i} className={cn('flex-1 rounded-t', h)} />
        ))}
      </div>
    </div>
  );
}

/** Tarjeta genérica: encabezado + N líneas. */
export function SkeletonCard({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-center gap-2 border-b pb-4">
        <Skeleton className="size-5 rounded-sm" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lista de filas sueltas (drilldowns, notificaciones, movimientos). */
export function SkeletonListRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-border', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Formas que `QueryState` sabe dibujar sin que la vista pase nada. */
export type SkeletonShape = 'stats' | 'table' | 'chart' | 'card' | 'list';

export function SkeletonFor({ shape, count }: { shape: SkeletonShape; count?: number }) {
  switch (shape) {
    case 'stats':
      return <SkeletonStatRow n={count ?? 4} />;
    case 'table':
      return <SkeletonTable rows={count ?? 8} />;
    case 'chart':
      return <SkeletonChart />;
    case 'list':
      return <SkeletonListRows rows={count ?? 6} />;
    case 'card':
    default:
      return <SkeletonCard lines={count ?? 4} />;
  }
}
