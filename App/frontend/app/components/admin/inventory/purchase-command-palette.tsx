import { HugeIcon } from "~/components/ui/icon";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { type Purchase } from "~/state/api/inventory-api";

const STATUS_LABEL: Record<Purchase["status"], { label: string; cls: string }> = {
  china: { label: "En tránsito", cls: "bg-info/15 text-info" },
  received: { label: "Recibido", cls: "bg-primary/15 text-primary-2" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchases: Purchase[];
  onSelect: (purchase: Purchase) => void;
}

export function PurchaseCommandPalette({ open, onOpenChange, purchases, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K global toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  // Focus input when palette opens; reset query when it closes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const results = query.trim()
    ? purchases.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.code.toLowerCase().includes(q) ||
          p.productName.toLowerCase().includes(q) ||
          p.lot?.toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : purchases.slice(0, 8);

  function select(p: Purchase) {
    onSelect(p);
    onOpenChange(false);
  }

  return (
    <AnimatePresence>
      {open && (
        // Overlay
        <motion.div
          key="palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
        >
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xl mx-4 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
              <HugeIcon icon={Search01Icon} size={20} strokeWidth={2} className="shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por código, lote, producto..."
                className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/50"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin resultados para "<span className="text-foreground">{query}</span>"
                </p>
              ) : (
                <ul className="p-1.5">
                  {results.map((p) => {
                    const st = STATUS_LABEL[p.status];
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => select(p)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        >
                          {/* Code badge */}
                          <span className="shrink-0 rounded-xl bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary-2">
                            {p.code}
                          </span>

                          {/* Name + lot */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{p.productName}</p>
                            {p.lot && (
                              <p className="truncate text-xs text-muted-foreground">Lote: {p.lot}</p>
                            )}
                          </div>

                          {/* Status pill */}
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                            {st.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 border-t border-border/40 px-4 py-2 text-2xs text-muted-foreground/60">
              <span><kbd className="font-mono">↵</kbd> seleccionar</span>
              <span><kbd className="font-mono">Esc</kbd> cerrar</span>
              <span className="ml-auto"><kbd className="font-mono">⌘K</kbd> abrir</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
