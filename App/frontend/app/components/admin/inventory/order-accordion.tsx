// Órdenes de compra como tarjetas que se abren, con un título de sección como
// «Resultados» en el catálogo de la tienda. Cada tarjeta conserva su resumen
// (número, estado, proveedor, total) aunque los productos estén cerrados.
import { useId, useReducer, type ReactNode } from 'react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeIcon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { orderExpansionReducer, orderIsExpanded } from '~/lib/order-expansion';

export interface OrderPanel {
  id: string;
  label: string;
  summary: ReactNode;
  toolbar?: ReactNode;
  details: ReactNode;
}

/** The caller keys this list by filters, so a new search opens its matches. */
export function OrderAccordion({
  panels,
  searching = false,
  title = 'Órdenes de compra',
}: {
  panels: OrderPanel[];
  searching?: boolean;
  title?: string;
}) {
  const [state, dispatch] = useReducer(orderExpansionReducer, { all: searching, exceptions: {} });
  const headingId = useId();
  const openCount = panels.filter((panel) => orderIsExpanded(state, panel.id)).length;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="font-heading text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {title} <span className="text-sm font-normal text-muted-foreground tabular-nums">({panels.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <span className="sr-only" role="status">
            {openCount} {openCount === 1 ? 'abierta' : 'abiertas'}
          </span>
          <Button type="button" variant="link" className="h-11 px-2 text-primary-2" disabled={openCount === panels.length} onClick={() => dispatch({ type: 'all', open: true })}>
            Expandir todas
          </Button>
          <span aria-hidden className="text-muted-foreground">·</span>
          <Button type="button" variant="link" className="h-11 px-2 text-primary-2" disabled={openCount === 0} onClick={() => dispatch({ type: 'all', open: false })}>
            Contraer todas
          </Button>
        </div>
      </div>
      {panels.map((panel) => (
        <OrderDisclosure key={panel.id} panel={panel} open={orderIsExpanded(state, panel.id)} toggle={() => dispatch({ type: 'toggle', id: panel.id })} />
      ))}
    </section>
  );
}

function OrderDisclosure({ panel, open, toggle }: { panel: OrderPanel; open: boolean; toggle: () => void }) {
  const id = useId();
  return (
    <section className="overflow-clip rounded-2xl border border-border bg-card transition-colors duration-150 data-[expanded=true]:border-primary-2/80 data-[expanded=true]:shadow-table" data-expanded={open} aria-label={panel.label}>
      <h3>
        <button
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-controls={`${id}-details`}
          onClick={toggle}
          className="flex w-full cursor-pointer transition-colors duration-150 hover:bg-primary-2/5 items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:p-5"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary-2/40 bg-primary-2/10 text-primary-2">
            <HugeIcon icon={ArrowDown01Icon} size={18} strokeWidth={2} className={`transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          </span>
          <span className="min-w-0 flex-1">{panel.summary}</span>
          <span className="sr-only">{open ? 'Ocultar productos' : 'Ver productos'}</span>
        </button>
      </h3>
      {panel.toolbar && <div className="border-t border-border px-4 py-3 sm:px-5">{panel.toolbar}</div>}
      <div id={`${id}-details`} role="region" aria-labelledby={`${id}-trigger`} hidden={!open} className="border-t border-table-edge focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        {open && panel.details}
      </div>
    </section>
  );
}
