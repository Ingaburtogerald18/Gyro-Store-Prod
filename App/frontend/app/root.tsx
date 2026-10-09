// Layout raíz de Remix.
// Responsabilidades: cargar tailwind.css, fijar data-theme/data-skin y exponer
// las llaves públicas de Supabase al navegador vía window.ENV.
import type { LinksFunction, LoaderFunctionArgs } from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from '@remix-run/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { StoreSync } from '~/components/StoreSync';
import { AuthSync } from '~/components/auth/AuthSync';
import { GlobalProgress } from '~/components/ui/global-progress';
import { TooltipProvider } from '~/components/ui/tooltip';
import { StorefrontAnalytics } from '~/components/layout/storefront-analytics';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { RouteError } from '~/components/layout/route-error';

import { Toaster } from 'sonner';
import { createAppStore } from '~/store/store';
import { useAppDispatch } from '~/store/hooks';
import { themeSet } from '~/store/slices/uiSlice';
import { defaultThemeFor, isTheme, restoreTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '~/lib/theme';
import tailwindHref from './tailwind.css?url';
import gyroBag from '~/assets/brand/gyro-bag.png';
import chivoWoff2 from '@fontsource-variable/chivo/files/chivo-latin-wght-normal.woff2?url';

// Sin Google Fonts: Chivo (catálogo y panel) y Chivo Mono (códigos)
// se sirven localmente vía @fontsource-variable, importadas desde tailwind.css.
// Se precarga el woff2 latino de Chivo: es la fuente del primer paint de la
// tienda y, sin preload, el titular del hero salta de fuente al cargar.
//
// El favicon inicial se reemplaza por el configurado al hidratar.
export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: tailwindHref },
  { rel: 'preload', href: chivoWoff2, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  // Favicon por defecto en el HTML del servidor (la bolsa del logo). Si el panel
  // tiene uno configurado, DynamicFavicon lo reemplaza después de hidratar.
  { rel: 'icon', type: 'image/png', href: gyroBag },
];

/** Área de la app según la ruta: permite estilos de layout específicos.
 *  La tipografía Chivo y los controles se comparten entre catálogo y panel. */
function areaFor(pathname: string): 'admin' | 'store' {
  return /^\/(admin|login|auth)(\/|$)/.test(pathname) ? 'admin' : 'store';
}

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
  const { pathname } = useLocation();

  return (
    // suppressHydrationWarning: el script anti-flash puede cambiar data-theme
    // antes de que React hidrate; ese "mismatch" es intencional.
    <html
      lang="es"
      data-theme={defaultThemeFor(pathname)}
      data-skin="store"
      data-area={areaFor(pathname)}
      suppressHydrationWarning
    >
      <head>
        {/* Zod en modo `jitless` — DEBE ir antes que cualquier módulo del bundle.
            Zod 4 compila los esquemas con `new Function` (JIT). Nuestra CSP
            (`script-src 'self' 'nonce-…'`, sin `'unsafe-eval'`) bloquea ese eval:
            aunque Zod lo atrapa y cae a modo interpretado, deja un
            `securitypolicyviolation` que DevTools muestra como Issue. Pre-seteando
            `__zod_globalConfig.jitless` acá (script inline, corre en el parseo del
            <head>, ANTES de que los `type=module` deferidos evalúen Zod) evitamos
            el probe y el JIT por completo, sin abrir `'unsafe-eval'` en la CSP.
            Ver zod/src/v4/core/{util,core}.ts y el test jitless-allows-eval. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `globalThis.__zod_globalConfig=Object.assign(globalThis.__zod_globalConfig||{},{jitless:true});`,
          }}
        />
        {/* Anti-flash de tema: aplica el tema guardado ANTES del primer paint. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: THEME_INIT_SCRIPT,
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

// Se renderiza dentro de Layout pero SIN el <Provider> de App: RouteError no
// toca el store. Cubre 404 y errores de cualquier ruta sin boundary propio.
export function ErrorBoundary() {
  return <RouteError />;
}

/** Sincroniza DOM y Redux después de hidratar, sin depender de un botón visible.
 *  También entre pestañas: elegir el tema en una pestaña lo aplica en las demás
 *  (el evento `storage` solo llega a las OTRAS pestañas del mismo origen). */
function ThemeSync() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(themeSet(restoreTheme()));
    function onStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
      document.documentElement.dataset.theme = event.newValue;
      dispatch(themeSet(event.newValue));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [dispatch]);
  return null;
}

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
  const [store] = useState(createAppStore);
  const { search } = useLocation();
  const editorPreview = new URLSearchParams(search).get('landing-preview') === '1';
  return (
    <Provider store={store}>
      <StoreSync />
      <ThemeSync />
      {/* TooltipProvider va acá y no dentro de cada vista: las primitivas del
          registry montan <Tooltip> sin proveedor propio (el `tooltip` de
          SidebarMenuButton, por ejemplo) y Radix lanza si no encuentra uno.
          delayDuration 0: en un panel interno el tooltip es una etiqueta del
          ícono colapsado, no una ayuda opcional — debe salir de inmediato. */}
      <TooltipProvider delayDuration={0}>
        <GlobalProgress />
        <DynamicFavicon />
        <AuthSync />
        {!editorPreview && <StorefrontAnalytics />}
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
