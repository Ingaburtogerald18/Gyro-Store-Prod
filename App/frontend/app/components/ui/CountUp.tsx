// Número que cuenta hacia arriba al aparecer (easing easeOutCubic). Acepta un
// formateador (p. ej. formatCordobas). Respeta prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface CountUpProps {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("es-NI"),
  durationMs = 600,
  className,
}: CountUpProps) {
  const reduce = useReducedMotion();
  // SSR / primer render: muestra el valor final (evita layout shift e hidratación rara).
  const [display, setDisplay] = useState(() => format(value));
  const raf = useRef<number>();

  useEffect(() => {
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(format(value * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{display}</span>;
}
