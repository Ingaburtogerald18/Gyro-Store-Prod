// Pestañas con indicador deslizante (física de resorte vía Framer layoutId).
// El "pill" activo se mueve suavemente entre tabs en vez de saltar.
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "~/lib/utils";

export interface TabItem {
  id: string;
  label: React.ReactNode;
}

interface AnimatedTabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Único por grupo de tabs en la página (evita que dos grupos compartan indicador). */
  layoutId: string;
  className?: string;
  /** Clase del indicador (fondo). Puede variar según el tab activo. */
  indicatorClassName?: string;
}

export function AnimatedTabs({
  items,
  value,
  onChange,
  layoutId,
  className,
  indicatorClassName = "bg-primary",
}: AnimatedTabsProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div role="group" aria-label="Opciones de vista" className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-card p-1", className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.id)}
            className={cn(
              "relative min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={cn("absolute inset-0 rounded-lg", indicatorClassName)}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative z-10">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
