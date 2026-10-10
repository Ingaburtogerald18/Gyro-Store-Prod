// Estados de carga, error y vacío de los listados admin. `shape` elige el
// esqueleto con la forma final; en un refetch los datos quedan atenuados.
import type { ReactNode } from 'react';

import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { SkeletonFor, type SkeletonShape } from '~/components/ui/skeletons';

interface QueryStateProps {
  loading: boolean;
  error?: boolean;
  empty?: boolean;
  /**
   * Refetch con datos ya en pantalla: atenúa el contenido en vez de
   * reemplazarlo por un esqueleto.
   */
  fetching?: boolean;
  /** Forma del esqueleto. Preferilo sobre `loadingFallback`. */
  shape?: SkeletonShape;
  /** Cantidad de piezas del esqueleto (tarjetas, filas). */
  shapeCount?: number;
  /** Placeholder de carga propio, para formas que no están en el catálogo. */
  loadingFallback?: ReactNode;
  emptyFallback?: ReactNode;
  errorMessage?: string;
  /** Si se pasa, el estado de error ofrece un botón para reintentar. */
  onRetry?: () => void;
  children: ReactNode;
}

export function QueryState({
  loading,
  error,
  empty,
  fetching,
  shape,
  shapeCount,
  loadingFallback,
  emptyFallback,
  errorMessage = 'No se pudo cargar la información.',
  onRetry,
  children,
}: QueryStateProps) {
  if (loading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    if (shape) return <SkeletonFor shape={shape} count={shapeCount} />;
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      >
        <p className="font-medium text-destructive">{errorMessage}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Puede ser una caída de conexión. Los datos siguen guardados.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (empty && emptyFallback) return <>{emptyFallback}</>;

  // `aria-busy` para que el lector de pantalla sepa que el contenido se está
  // actualizando, aunque visualmente siga ahí.
  if (fetching) {
    return (
      <div aria-busy className="pointer-events-none opacity-60 transition-opacity duration-200">
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
