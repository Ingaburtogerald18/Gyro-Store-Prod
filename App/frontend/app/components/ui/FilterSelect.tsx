// Dropdown de filtro estilizado (reemplazo del <select> nativo).
// Soporta un "punto" indicador por opción (p. ej. vendedores con ventas pendientes).
import { HugeIcon } from "~/components/ui/icon";
import { ArrowDown01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "~/lib/utils";

export interface FilterSelectOption {
  value: string;
  label: string;
  /** Si es true, muestra un punto indicador junto a la opción. */
  dot?: boolean;
}

export interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  placeholder?: string;
  /** Tooltip del punto indicador (accesibilidad). */
  dotTitle?: string;
  /** Ícono opcional a la izquierda del valor (da identidad visual al filtro). */
  icon?: React.ReactNode;
  /** "ghost" = sin bordes ni fondo, para usar como título de columna. */
  variant?: "default" | "ghost";
  /** `id` del botón, para asociarlo a un <label htmlFor>. */
  id?: string;
}

export function FilterSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  dotTitle,
  icon,
  variant = "default",
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const Dot = () => (
    <span
      title={dotTitle}
      // El resplandor sale del token, no de un ámbar hardcodeado: así sigue al
      // tema y acompaña si `--warning` cambia.
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning shadow-[0_0_6px_var(--color-warning)]"
    />
  );

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 text-left transition-all duration-200",
          variant === "ghost"
            ? "bg-transparent border-none p-0 text-sm font-semibold text-foreground hover:text-primary-2"
            : cn(
                "flex w-full items-center justify-between gap-2 rounded-pill border bg-muted px-4 py-2 text-sm text-foreground transition-all duration-200 hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-primary/20",
                open && "border-primary/50 ring-2 ring-primary/20"
              ),
        )}
      >
        <span className="flex flex-1 items-center gap-2 truncate text-sm">
          {icon && <span className="shrink-0 text-primary-2">{icon}</span>}
          {selected?.dot && <Dot />}
          <span className="truncate">
            {variant === "ghost" ? (
              <>
                {placeholder}
                {selected && selected.value !== "all" && (
                  <span className="ml-1 font-normal text-muted-foreground/70">: {selected.label}</span>
                )}
              </>
            ) : (
              selected ? selected.label : placeholder
            )}
          </span>
        </span>
        {/* El chevron rota por CSS con `open && rotate-180`: comunica si el
            panel está abierto. */}
        <HugeIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} className={cn( "shrink-0 transition-transform duration-200", variant === "ghost" ? "h-3.5 w-3.5 text-muted-foreground" : "h-4 w-4 text-muted-foreground", open && "rotate-180", )} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 z-50 mt-2 flex flex-col gap-1 min-w-[180px] w-max max-w-[300px] max-h-64 overflow-y-auto rounded-card border bg-card p-1 shadow-2xl"
          >
            {options.map((o) => {
              const isSel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isSel ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {/* Reservar el ancho del punto siempre, para que los nombres queden alineados */}
                  {o.dot ? <Dot /> : <span className="h-1.5 w-1.5 shrink-0" />}
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSel && <HugeIcon icon={Tick01Icon} size={14} strokeWidth={2} className="shrink-0 text-primary-2" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
