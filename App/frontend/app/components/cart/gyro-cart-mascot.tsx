import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '~/lib/utils';

type GyroCartMascotProps = {
  src: string;
  active: boolean;
  interactive?: boolean;
  /** 'lg' (≈152px) en el carrito vacío; 'sm' (≈104px) sobre la lista. */
  size?: 'lg' | 'sm';
};

const SIZE = { lg: 'size-38', sm: 'size-26' } as const;

/**
 * Gyro libre, sin fondo ni marco. La imagen sigue siendo editable desde el
 * admin; solo se anima el recorte completo.
 *
 * Movimiento acotado: entrada breve y dos balanceos suaves, nada perpetuo. Se
 * detiene con el carrito cerrado, fuera de vista o con la pestaña oculta, y
 * `prefers-reduced-motion` muestra la imagen quieta.
 *
 * El salto al tocarla es decoración: NO entra en el orden de tabulación ni
 * recibe el foco inicial del carrito (las acciones de compra van primero).
 */
export function GyroCartMascot({ src, active, interactive = true, size = 'lg' }: GyroCartMascotProps) {
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { amount: 0.5 });
  const reduce = useReducedMotion() !== false;
  const [pageVisible, setPageVisible] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const canAnimate = active && inView && pageVisible && !reduce;
  const box = SIZE[size];

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!canAnimate) setCelebrating(false);
  }, [canAnimate]);

  const illustration = (
    <motion.img
      src={src}
      alt=""
      draggable={false}
      className={cn(box, 'select-none object-contain')}
      initial={false}
      animate={canAnimate && !celebrating
        ? { rotate: [0, -1.2, 0, 1.2, 0], y: [0, -2.5, 0, -2.5, 0] }
        : { rotate: 0, y: 0 }}
      transition={canAnimate && !celebrating
        ? { duration: 3.2, ease: 'easeInOut', repeat: 1, repeatDelay: 4 }
        : { duration: 0.15 }}
    />
  );

  return (
    <motion.div
      ref={stage}
      aria-hidden
      className={cn(box, 'shrink-0')}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.24, ease: 'easeOut' }}
    >
      {reduce || !interactive ? (
        reduce ? <img src={src} alt="" draggable={false} className={cn(box, 'object-contain')} /> : illustration
      ) : (
        <motion.button
          type="button"
          tabIndex={-1}
          className={cn(box, 'block cursor-pointer rounded-2xl border-0 bg-transparent p-0 outline-none')}
          initial={false}
          animate={canAnimate && celebrating
            ? { y: [0, -10, 0, -3, 0], rotate: [0, -3, 2, 0, 0] }
            : { y: 0, rotate: 0 }}
          transition={{ duration: canAnimate && celebrating ? 0.6 : 0.15, ease: 'easeInOut' }}
          onClick={() => {
            if (canAnimate) setCelebrating(true);
          }}
          onAnimationComplete={() => setCelebrating(false)}
        >
          {illustration}
        </motion.button>
      )}
    </motion.div>
  );
}
