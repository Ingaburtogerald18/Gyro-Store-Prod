// Telemetría del storefront montada una sola vez en la raíz. Hace dos cosas:
//   1. Registra `page_view` en cada cambio de ruta pública (el gating —
//      consentimiento, staff, rutas privadas— vive en analytics.client).
//   2. Muestra el BANNER DE CONSENTIMIENTO (no bloqueante, abajo) mientras el
//      visitante no haya decidido. Nada se emite hasta que acepta.
//
// Todo corre solo en el cliente: los efectos y el estado se activan tras montar,
// así que el SSR pinta sin banner y sin tocar localStorage.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@remix-run/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getConsent, setConsent, trackPageView } from '~/lib/analytics.client';

// El banner y el tracking se apagan en el panel/login: ahí no hay visitante que
// medir ni consentimiento que pedir.
function isPrivatePath(path: string): boolean {
  return path.startsWith('/admin') || path.startsWith('/login') || path.startsWith('/auth');
}

export function StorefrontAnalytics() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const [needsConsent, setNeedsConsent] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const visible = needsConsent && !isPrivatePath(location.pathname);

  useEffect(() => {
    const banner = bannerRef.current;
    if (!visible || !banner) return;
    const update = () => document.documentElement.style.setProperty('--consent-height', `${banner.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--consent-height');
    };
  }, [visible]);

  // Estado inicial del consentimiento: solo tras montar (localStorage no existe
  // en SSR). Si está sin decidir y estamos en una ruta pública, se pide.
  useEffect(() => {
    if (getConsent() === 'unset' && !isPrivatePath(location.pathname)) {
      setNeedsConsent(true);
    }
  }, [location.pathname]);

  // page_view por navegación. El pathname como dependencia cubre tanto la carga
  // inicial como cada transición de Remix. El propio track descarta rutas
  // privadas y visitantes sin consentimiento, así que no hace falta filtrar acá.
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  function decide(value: 'granted' | 'denied') {
    setConsent(value);
    setNeedsConsent(false);
    // Al aceptar, registramos la vista actual: antes del "sí" no se emitió nada,
    // y perder la página donde el visitante aceptó sesgaría el embudo.
    if (value === 'granted') trackPageView(location.pathname);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={bannerRef}
          role="region"
          aria-live="polite"
          aria-label="Preferencias de privacidad"
          initial={reduce ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0 } }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-3 pb-[env(safe-area-inset-bottom)] shadow-lg"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 py-1 sm:flex-nowrap">
            <p className="text-xs text-foreground">
              ¿Aceptás analítica anónima para mejorar la tienda?
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => decide('denied')}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => decide('granted')}
                className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Aceptar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
