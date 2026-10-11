// Barra fina de "cuánto representa esto frente al mayor de la lista". Crece al
// aparecer (o al cambiar `animKey`) y respeta prefers-reduced-motion.
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '~/lib/utils';

export function RelativeBar({
  ratio,
  animKey,
  className,
  barClassName = 'bg-primary-2',
}: {
  /** 0..1 */
  ratio: number;
  animKey?: string | number;
  className?: string;
  barClassName?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <motion.div
        key={animKey}
        className={cn('h-full rounded-full', barClassName)}
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, originX: 0 }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}
