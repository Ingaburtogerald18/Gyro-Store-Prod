// Pestañas con indicador deslizante (física de resorte vía Framer layoutId).
// El "pill" activo se mueve suavemente entre tabs en vez de saltar.
import { motion } from "framer-motion";
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
  return (
    <div className={cn("inline-flex gap-1 rounded-pill border bg-card p-1", className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={cn(
              "relative rounded-pill px-4 py-2 text-sm font-medium transition-colors",
              active ? "text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={cn("absolute inset-0 rounded-pill", indicatorClassName)}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative z-10">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
