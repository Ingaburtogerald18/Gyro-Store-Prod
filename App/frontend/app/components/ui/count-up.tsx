// Número que cuenta hacia su valor (easing easeOutCubic): desde 0 al aparecer y
// desde el valor anterior cuando cambia (p. ej. al cambiar de mes). Acepta un
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
  // Desde dónde arranca la próxima animación: lo último que se mostró.
  const shown = useRef(0);

  useEffect(() => {
    if (reduce) {
      shown.current = value;
      setDisplay(format(value));
      return;
    }
    const from = shown.current;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      shown.current = from + (value - from) * eased;
      setDisplay(format(shown.current));
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
