// Pantalla de error de las rutas. Sin esto, cualquier excepción al renderizar o
// en un loader mostraba la pantalla por defecto de Remix: en inglés, sin marca y
// sin salida. Distingue "no existe" (404) de "algo se rompió", porque el usuario
// puede resolver lo primero y no lo segundo.
//
// Ojo: el ErrorBoundary de root.tsx se renderiza FUERA del <Provider> de Redux,
// así que este componente no puede usar hooks del store ni RTK Query.
import { isRouteErrorResponse, Link, useRouteError } from '@remix-run/react';
import { useEffect } from 'react';
import { Alert02Icon, Home01Icon, RefreshIcon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import gyroBag from '~/assets/brand/gyro-bag.png';
import { cn } from '~/lib/utils';

function describe(error: unknown) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return {
      title: 'No encontramos esta página',
      text: 'Puede que el enlace esté mal escrito o que el producto ya no esté publicado.',
      canRetry: false,
    };
  }
  return {
    title: 'Algo salió mal',
    text: 'Tuvimos un problema al cargar esta página. Probá de nuevo en unos segundos.',
    canRetry: true,
  };
}

export function RouteError({
  homeHref = '/',
  homeLabel = 'Volver al inicio',
  className,
}: {
  homeHref?: string;
  homeLabel?: string;
  className?: string;
}) {
  const error = useRouteError();
  const { title, text, canRetry } = describe(error);
  const developmentError = import.meta.env.DEV && error instanceof Error ? error.message : null;

  useEffect(() => {
    if (import.meta.env.DEV) console.error('[RouteError]', error);
  }, [error]);

  return (
    <main
      className={cn(
        'mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center',
        className,
      )}
    >
      {/* En la tienda, un 404 lleva la mascota (perderse no es una falla grave);
          un error real o el panel mantienen el ícono de alerta. */}
      {!canRetry && homeHref === '/' ? (
        <img src={gyroBag} alt="" width={96} height={96} className="size-24" />
      ) : (
        <span
          className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"
          aria-hidden
        >
          <HugeIcon icon={Alert02Icon} size={28} strokeWidth={2} />
        </span>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-balance text-muted-foreground">{text}</p>
      {developmentError && (
        <details className="w-full rounded-lg border p-3 text-left text-sm">
          <summary className="cursor-pointer">Detalle del error (desarrollo)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{developmentError}</pre>
        </details>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link to={homeHref}>
            <HugeIcon icon={Home01Icon} size={16} strokeWidth={2} aria-hidden />
            {homeLabel}
          </Link>
        </Button>
        {canRetry && (
          <Button variant="outline" onClick={() => window.location.reload()}>
            <HugeIcon icon={RefreshIcon} size={16} strokeWidth={2} aria-hidden />
            Reintentar
          </Button>
        )}
      </div>
    </main>
  );
}

/** Variante del panel: vive dentro del área de contenido de cada ruta hija, así
 *  que la barra lateral sigue disponible para salir a otra sección. */
export function AdminRouteError() {
  return <RouteError homeHref="/admin" homeLabel="Volver al panel" className="min-h-[50dvh]" />;
}
