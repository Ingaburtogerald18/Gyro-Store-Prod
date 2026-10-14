// Compra con confianza: la información comercial REAL (garantía, pago y
// entrega), breve, debajo de la ficha. En móvil queda plegada.
// Los textos salen de lib/store-policies.ts: no se prometen tarjeta, horarios
// ni coberturas que la tienda no definió.
import { HugeIcon } from '~/components/ui/icon';
import {
  ArrowDown01Icon,
  DeliveryTruck01Icon,
  SecurityCheckIcon,
  Wallet01Icon,
  RoadLocation01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import { STORE_POLICIES } from '~/lib/store-policies';
import { cn } from '~/lib/utils';

const ITEMS: { icon: IconSvgElement; title: string; text: string }[] = [
  { icon: SecurityCheckIcon, ...STORE_POLICIES.warranty },
  { icon: Wallet01Icon, ...STORE_POLICIES.payment },
  { icon: DeliveryTruck01Icon, ...STORE_POLICIES.managua },
  { icon: RoadLocation01Icon, ...STORE_POLICIES.outside },
];

export function TrustBox() {
  return (
    <section aria-labelledby="trust-heading">
      <details className="group border-t border-border sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-3 text-sm font-semibold text-foreground focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <HugeIcon icon={SecurityCheckIcon} size={20} aria-hidden className="shrink-0 text-primary-2" />
          <span id="trust-heading">Garantía, pago y entrega</span>
          <HugeIcon icon={ArrowDown01Icon} size={18} aria-hidden className="ml-auto shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <TrustItems className="grid gap-4 pt-1 pb-4" />
      </details>
      <TrustItems className="hidden gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid sm:grid-cols-2 lg:grid-cols-4" />
      <p className="mt-3 hidden text-sm text-muted-foreground sm:block">{STORE_POLICIES.shippingNote}</p>
    </section>
  );
}

function TrustItems({ className }: { className: string }) {
  return (
    <ul className={cn(className)} aria-label="Garantía, pago y entrega">
      {ITEMS.map(({ icon, title, text }) => (
        <li key={title} className="flex gap-3">
          <HugeIcon icon={icon} size={20} strokeWidth={1.8} aria-hidden className="mt-0.5 shrink-0 text-primary-2" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
