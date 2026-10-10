// Barra de progreso global de 2 px arriba del contenido. Aparece recién a los
// 150 ms, avanza hasta el 90 % y al terminar salta al 100 % y se desvanece.
import { useNavigation } from '@remix-run/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { useAnyQueryPending } from '~/hooks/useAnyQueryPending';

/** Por debajo de esto no se muestra nada: la carga se percibe instantánea. */
const APPEARANCE_DELAY_MS = 150;
/** Tope del avance simulado. El 100 % solo llega cuando la carga termina de verdad. */
const CEILING = 90;

export function GlobalProgress() {
  const navigation = useNavigation();
  const anyQueryPending = useAnyQueryPending();
  const reduce = useReducedMotion();

  // Navegación de Remix Y queries de RTK: un módulo puede resolver su ruta al
  // instante y pasar dos segundos trayendo datos. Mirar solo `navigation` haría
  // que la barra desapareciera con la pantalla todavía vacía.
  const busy = navigation.state !== 'idle' || anyQueryPending;

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!busy) return;

    const appear = setTimeout(() => {
      setVisible(true);
      setProgress(12);

      if (reduce) return; // Con motion reducido la barra aparece y espera, sin avanzar.

      // Incrementos decrecientes: avanza rápido al principio y se va frenando.
      // Una barra que sube a ritmo constante y se planta en 90 delata la
      // simulación; ésta se siente como algo que va costando.
      intervalRef.current = setInterval(() => {
        setProgress((prev) => (prev >= CEILING ? prev : prev + (CEILING - prev) * 0.12));
      }, 250);
    }, APPEARANCE_DELAY_MS);

    return () => {
      clearTimeout(appear);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [busy, reduce]);

  // Cierre: completar y recién después esconder. Se separa del efecto de arriba
  // porque el desmontaje de aquél corre en cuanto `busy` pasa a false, y ahí
  // todavía falta pintar el 100 %.
  useEffect(() => {
    if (busy || !visible) return;
    setProgress(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
    return () => clearTimeout(hide);
  }, [busy, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="progressbar"
          aria-label="Cargando"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // `fixed` al viewport y no `absolute` dentro del SidebarInset, aunque
          // el plan pedía lo segundo: `root.tsx` ya monta UNA instancia para
          // toda la app. Montar otra en el shell del admin dibujaría dos barras
          // al mismo tiempo, y hacerla condicional por ruta es más frágil que
          // aceptar que cruce por encima del sidebar — que además es el patrón
          // habitual (GitHub, YouTube).
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-primary/15"
        >
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
