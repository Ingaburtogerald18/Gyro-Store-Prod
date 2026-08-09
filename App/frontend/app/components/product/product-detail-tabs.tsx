// Tabs Detalles / Especificaciones de la ficha (patrón del V1): tablist real
// con flechas ←/→ y un indicador que se desliza entre pestañas con layoutId.
// Si falta uno de los dos contenidos no hay nada que alternar: se pinta el que
// haya, directo y sin chrome de tabs.
import { useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '~/lib/utils';

interface SpecRow {
  label: string;
  value: string;
}

export function ProductDetailTabs({
  description,
  specs,
}: {
  description: string;
  specs: SpecRow[];
}) {
  const hasDetails = description.trim().length > 0;
  const hasSpecs = specs.length > 0;
  const tabs = [
    ...(hasDetails ? [{ id: 'details' as const, label: 'Detalles' }] : []),
    ...(hasSpecs ? [{ id: 'specs' as const, label: 'Especificaciones' }] : []),
  ];

  const [active, setActive] = useState(tabs[0]?.id ?? 'details');
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const reduce = useReducedMotion();

  if (tabs.length === 0) return null;

  // Con un solo contenido no hay alternancia: se renderiza pelado.
  if (tabs.length === 1) {
    return tabs[0].id === 'details' ? (
      <Details description={description} />
    ) : (
      <Specs specs={specs} />
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === active);
    const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-tab-${next.id}`)}`)
      ?.focus();
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Información del producto"
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {selected && (
                <motion.div
                  layoutId={`${baseId}-tab-indicator`}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          className="pt-4"
        >
          {tab.id === 'details' ? <Details description={description} /> : <Specs specs={specs} />}
        </div>
      ))}
    </div>
  );
}

function Details({ description }: { description: string }) {
  return <p className="max-w-[65ch] leading-relaxed text-pretty text-muted-foreground">{description}</p>;
}

function Specs({ specs }: { specs: SpecRow[] }) {
  return (
    // Grilla con hairlines: el gap de 1px sobre el borde dibuja las líneas,
    // sin bordes por celda.
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2">
      {specs.map((spec) => (
        <div key={spec.label} className="bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground capitalize">{spec.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}
