import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type GyroCartMascotProps = {
  src: string;
  active: boolean;
  interactive?: boolean;
};

/** La imagen sigue siendo editable desde el admin. Solo animamos el recorte
 * completo; no necesita vídeo, GIF ni una nueva versión de la ilustración. */
export function GyroCartMascot({ src, active, interactive = true }: GyroCartMascotProps) {
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { amount: 0.5 });
  const reduce = useReducedMotion() !== false;
  const [pageVisible, setPageVisible] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const canAnimate = active && inView && pageVisible && !reduce;

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
      className="size-40 select-none object-contain"
      initial={false}
      animate={canAnimate && !celebrating
        ? { rotate: [0, -1.2, 0, 1.2, 0], y: [0, -2.5, 0, -2.5, 0] }
        : { rotate: 0, y: 0 }}
      transition={canAnimate && !celebrating
        ? { duration: 3.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 5.5 }
        : { duration: 0.15 }}
    />
  );

  return (
    <motion.div
      ref={stage}
      className="size-40 shrink-0"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.28, ease: 'easeOut' }}
    >
      {reduce ? (
        <img src={src} alt="" draggable={false} className="size-40 object-contain" />
      ) : interactive ? (
        <motion.button
          type="button"
          aria-label="Animar a Gyro"
          className="block size-40 cursor-pointer rounded-2xl border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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
      ) : illustration}
    </motion.div>
  );
}
