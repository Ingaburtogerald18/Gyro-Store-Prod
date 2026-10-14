// Barra de progreso global de 2 px arriba del contenido. Aparece recién a los
// 150 ms, avanza hasta el 90 % y al terminar salta al 100 % y se desvanece.
import { useNavigation } from '@remix-run/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { useAnyQueryPending } from '~/hooks/use-any-query-pending';

/** Por debajo de esto no se muestra nada: la carga se percibe instantánea. */
const APPEARANCE_DELAY_MS = 150;
/** Tope del avance simulado. El 100 % solo llega cuando la carga termina de verdad. */
const CEILING = 90;

export function GlobalProgress() {
  const navigation = useNavigation();
  const anyQueryPending = useAnyQueryPending();
  const reduce = useReducedMotion();

  // Navegación de Remix y queries de RTK: un módulo puede resolver la ruta y tardar en traer datos.
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

      // Incrementos decrecientes: una barra que sube parejo y se planta en 90 delata la simulación.
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

  // El cierre va aparte: el efecto de arriba se desmonta al terminar y todavía falta pintar el 100 %.
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
          // `fixed` al viewport: root.tsx ya monta una sola instancia para toda la app.
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
