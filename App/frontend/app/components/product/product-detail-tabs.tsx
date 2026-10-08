// Tabs Detalles / Especificaciones de la ficha (patrón del V1): tablist real
// con flechas ←/→ y un indicador que se desliza entre pestañas con layoutId.
// Si falta uno de los dos contenidos no hay nada que alternar: se pinta el que
// haya, directo y sin chrome de tabs.
import { useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';

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
      {/* Patrón roving tabindex del WAI-ARIA: el foco lo reciben los tabs, y las
          flechas burbujean hasta acá. El tablist en sí no debe ser enfocable. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
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
                'relative min-h-11 px-4 py-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2',
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
  return <p className="max-w-[65ch] leading-relaxed whitespace-pre-line text-pretty text-muted-foreground">{description}</p>;
}

function Specs({ specs }: { specs: SpecRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hasMore = specs.length > 3;

  return (
    <div>
      <dl id={listId} className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        {specs.map((spec, index) => {
          // El texto largo conserva el ancho completo en móvil. Las medidas y
          // valores cortos caben junto al rótulo sin alargar cada fila.
          const longText = spec.value.length > 50 || spec.label.length > 28;
          return (
            <div key={spec.label} className={cn(
              'grid min-w-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-x-4 gap-y-1 border-b border-border py-3 sm:gap-5 sm:py-4',
              hasMore && index >= 3 && !expanded && 'hidden sm:grid',
            )}>
              <dt className={cn('text-sm leading-relaxed text-muted-foreground', longText && 'col-span-2 sm:col-span-1')}>{spec.label}</dt>
              <dd className={cn('min-w-0 text-sm leading-relaxed font-medium break-words text-foreground sm:text-base', longText && 'col-span-2 sm:col-span-1')}>{spec.value}</dd>
            </div>
          );
        })}
      </dl>
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="mt-2 min-h-11 w-full justify-between text-primary-2 sm:hidden"
        >
          {expanded ? 'Mostrar menos' : `Ver las ${specs.length} especificaciones`}
          <HugeIcon icon={ArrowDown01Icon} size={18} aria-hidden className={cn('transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} />
        </Button>
      )}
    </div>
  );
}
