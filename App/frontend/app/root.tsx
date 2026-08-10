// Layout raíz de Remix (doc 09 ítem 41, versión mínima de fundación).
// Responsabilidades: cargar tailwind.css, fijar data-theme/data-skin y exponer
// las llaves públicas de Supabase al navegador vía window.ENV.
import type { LinksFunction, LoaderFunctionArgs } from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  useRouteLoaderData,
} from '@remix-run/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { store } from '~/store/store';
import tailwindHref from './tailwind.css?url';

// Sin Google Fonts: Geist (body y headings, según el preset Rhea) se sirve
// localmente vía @fontsource-variable, importado desde tailwind.css.
//
// Favicon: NO va en links — se carga dinámicamente desde la config del admin
// (Recursos de imágenes → Favicon) con el componente DynamicFavicon.
export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: tailwindHref },
];

// Único lugar donde el server pasa config al cliente. Solo llaves PÚBLICAS:
// la service_role vive exclusivamente en el backend Express.
export async function loader({ context }: LoaderFunctionArgs) {
  return {
    // Nonce de la CSP (lo inyecta el server Express, ver serveFrontend.ts).
    // En dev (vite sin Express) no hay context: '' desactiva el atributo nonce.
    cspNonce: (context as { cspNonce?: string } | undefined)?.cspNonce ?? '',
    ENV: {
      SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
      // Marca / negocio (públicos): permiten pintar <title> y textos SSR sin
      // esperar la query de /api/config. Fuente: mismas env vars del backend.
      BRAND_NAME: process.env.BRAND_NAME ?? '',
      INTERNAL_DOMAIN: process.env.INTERNAL_DOMAIN ?? '',
      APP_URL: process.env.RENDER_EXTERNAL_URL ?? process.env.APP_URL ?? '',
    },
  };
}

export function Layout({ children }: { children: ReactNode }) {
  // useRouteLoaderData (y no useLoaderData): Layout también envuelve el
  // ErrorBoundary, donde el loader pudo no haber corrido.
  const data = useRouteLoaderData<typeof loader>('root');
  const env = JSON.stringify(data?.ENV ?? {}).replace(/</g, '\\u003c');
  const nonce = data?.cspNonce ?? '';

  return (
    // suppressHydrationWarning: el script anti-flash puede cambiar data-theme
    // antes de que React hidrate; ese "mismatch" es intencional.
    <html
      lang="es"
      data-theme="dark"
      data-skin="store"
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash de tema: aplica el tema guardado ANTES del primer paint.
            Debe ir primero en <head>. Clave sincronizada con useTheme. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('gyro:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `window.ENV=${env};` }} />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

import { useEffect } from 'react';
import { AuthSync } from '~/components/auth/AuthSync';
import { GlobalProgress } from '~/components/ui/global-progress';
import { TooltipProvider } from '~/components/ui/tooltip';
import { StorefrontAnalytics } from '~/components/layout/storefront-analytics';
import { useGetConfigQuery } from '~/store/api/sessionApi';

/** Favicon dinámico: lee la URL desde la config del admin (Recursos de imágenes)
 *  y la inyecta como `<link rel="icon">` en el `<head>`. Si no hay favicon
 *  configurado, no agrega nada. */
function DynamicFavicon() {
  const { data: config } = useGetConfigQuery();
  const faviconUrl = config?.images?.favicon;

  useEffect(() => {
    if (!faviconUrl) return;

    // Buscar un link[rel="icon"] existente o crear uno nuevo
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
    // Detectar tipo por extensión
    if (faviconUrl.match(/\.ico($|\?)/i)) link.type = 'image/x-icon';
    else if (faviconUrl.match(/\.svg($|\?)/i)) link.type = 'image/svg+xml';
    else if (faviconUrl.match(/\.png($|\?)/i)) link.type = 'image/png';
    else link.type = 'image/png'; // fallback
  }, [faviconUrl]);

  return null;
}

export default function App() {
  return (
    <Provider store={store}>
      {/* TooltipProvider va acá y no dentro de cada vista: las primitivas del
          registry montan <Tooltip> sin proveedor propio (el `tooltip` de
          SidebarMenuButton, por ejemplo) y Radix lanza si no encuentra uno.
          delayDuration 0: en un panel interno el tooltip es una etiqueta del
          ícono colapsado, no una ayuda opcional — debe salir de inmediato. */}
      <TooltipProvider delayDuration={0}>
        <GlobalProgress />
        <DynamicFavicon />
        <AuthSync />
        <StorefrontAnalytics />
        <Outlet />
        {/* Toasts pintados con los tokens de marca, no con el tema de sonner. */}
        <Toaster
          position="bottom-center"
          toastOptions={{
            className:
              'border bg-card text-foreground rounded-lg text-sm',
          }}
        />
      </TooltipProvider>
    </Provider>
  );
}

// Red de seguridad global: cualquier error no atrapado en el árbol (un throw en
// render o en un efecto de un componente montado en root, un loader que revienta,
// una ruta inexistente) cae acá en vez de tumbar la página en blanco. Remix lo
// renderiza DENTRO de `Layout`, así que solo devolvemos el contenido, no el <html>.
export function ErrorBoundary() {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Algo salió mal';
  const detail = isRouteErrorResponse(error)
    ? (typeof error.data === 'string' ? error.data : 'No se pudo cargar esta página.')
    : 'Ocurrió un error inesperado. Intentá recargar la página.';

  return (
    <div className="grid min-h-svh place-items-center bg-background px-4 text-center text-foreground">
      <div className="flex max-w-md flex-col items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{detail}</p>
        <a
          href="/"
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
