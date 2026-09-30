// Pantalla de error de las rutas. Sin esto, cualquier excepción al renderizar o
// en un loader mostraba la pantalla por defecto de Remix: en inglés, sin marca y
// sin salida. Distingue "no existe" (404) de "algo se rompió", porque el usuario
// puede resolver lo primero y no lo segundo.
//
// Ojo: el ErrorBoundary de root.tsx se renderiza FUERA del <Provider> de Redux,
// así que este componente no puede usar hooks del store ni RTK Query.
import { isRouteErrorResponse, Link, useRouteError } from '@remix-run/react';
import { Alert02Icon, Home01Icon, RefreshIcon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { getBrandName } from '~/lib/brand';
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

  return (
    <main
      className={cn(
        'mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center',
        className,
      )}
    >
      <span
        className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"
        aria-hidden
      >
        <HugeIcon icon={Alert02Icon} size={28} strokeWidth={2} />
      </span>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {getBrandName()}
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-balance text-muted-foreground">{text}</p>
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
