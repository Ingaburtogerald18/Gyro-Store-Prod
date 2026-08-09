// Envuelve el patrón repetido loading/error/vacío de los listados admin
// (ventas, facturación, cuotas, caja, inventario).
//
// ── `shape` en vez de un fallback a mano por vista ──
// Antes cada vista inventaba su esqueleto y ninguno coincidía con la forma
// final: el dashboard dibujaba cuatro `div h-32` sueltos para una grilla de
// CINCO KPIs, así que al llegar los datos el layout saltaba. Con `shape` la
// vista declara QUÉ está cargando y el esqueleto correcto sale solo.
// `loadingFallback` se conserva como escotilla de escape.
//
// ── `fetching` (Fase 1.4) ──
// RTK Query distingue `isLoading` (primera carga, no hay nada que mostrar) de
// `isFetching` (refetch, ya hay datos en pantalla). Vaciar una tabla que ya
// tenía filas para poner un esqueleto es una regresión: el usuario pierde lo
// que estaba leyendo. En un refetch los datos viejos se quedan, atenuados y sin
// interacción, hasta que llegan los nuevos.
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
    return <Skeleton className="h-48 w-full rounded-card" />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-card border border-dashed border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
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
