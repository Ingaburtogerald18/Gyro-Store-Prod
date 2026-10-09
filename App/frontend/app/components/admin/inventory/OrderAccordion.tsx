import { useId, useReducer, type ReactNode } from 'react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeIcon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { orderExpansionReducer, orderIsExpanded } from '~/lib/orderExpansion';

export interface OrderPanel {
  id: string;
  label: string;
  summary: ReactNode;
  toolbar?: ReactNode;
  details: ReactNode;
}

/** The caller keys this list by filters, so a new search opens its matches. */
export function OrderAccordion({ panels, searching = false }: { panels: OrderPanel[]; searching?: boolean }) {
  const [state, dispatch] = useReducer(orderExpansionReducer, { all: searching, exceptions: {} });
  const openCount = panels.filter((panel) => orderIsExpanded(state, panel.id)).length;
  return (
    <div className="purchase-orders space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role="status">{panels.length} {panels.length === 1 ? 'grupo de compra' : 'grupos de compra'} · {openCount} {openCount === 1 ? 'abierto' : 'abiertos'}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={openCount === panels.length} onClick={() => dispatch({ type: 'all', open: true })}>Expandir todas</Button>
          <Button type="button" variant="outline" disabled={openCount === 0} onClick={() => dispatch({ type: 'all', open: false })}>Contraer todas</Button>
        </div>
      </div>
      {panels.map((panel) => <OrderDisclosure key={panel.id} panel={panel} open={orderIsExpanded(state, panel.id)} toggle={() => dispatch({ type: 'toggle', id: panel.id })} />)}
    </div>
  );
}

function OrderDisclosure({ panel, open, toggle }: { panel: OrderPanel; open: boolean; toggle: () => void }) {
  const id = useId();
  return (
    <section className="purchase-order overflow-hidden rounded-lg border border-border bg-card" data-expanded={open} aria-label={panel.label}>
      <h2>
        <button type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={`${id}-details`} onClick={toggle} className="purchase-order-trigger flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center text-muted-foreground">
            <HugeIcon icon={ArrowDown01Icon} size={18} className={`transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          </span>
          <span className="min-w-0 flex-1">{panel.summary}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground lg:block">{open ? 'Ocultar productos' : 'Ver productos'}</span>
        </button>
      </h2>
      {panel.toolbar && <div className="purchase-order-toolbar border-t border-border px-4 py-2 sm:px-5">{panel.toolbar}</div>}
      <div id={`${id}-details`} role="region" aria-labelledby={`${id}-trigger`} hidden={!open}>
        {open && panel.details}
      </div>
    </section>
  );
}
