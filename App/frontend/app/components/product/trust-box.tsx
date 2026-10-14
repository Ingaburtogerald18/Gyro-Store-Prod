// Garantía, pago y entrega de Configuración → Atención: no se promete lo que la tienda no definió.
import { HugeIcon } from '~/components/ui/icon';
import {
  ArrowDown01Icon,
  DeliveryTruck01Icon,
  SecurityCheckIcon,
  Wallet01Icon,
  RoadLocation01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import { Link } from '@remix-run/react';
import { useStorePolicies } from '~/hooks/use-store-config';
import { STORE_PAGES } from '~/lib/store-pages';
import { INFO_LINK } from '~/components/storefront/store-details';
import { cn } from '~/lib/utils';

type Item = { icon: IconSvgElement; title: string; text: string };

export function TrustBox() {
  const policies = useStorePolicies();
  if (!policies) return null;

  const items: Item[] = [
    { icon: SecurityCheckIcon, ...policies.warranty },
    { icon: Wallet01Icon, ...policies.payment },
    { icon: DeliveryTruck01Icon, ...policies.managua },
    { icon: RoadLocation01Icon, ...policies.outside },
  ];
  // Cerca de la decisión de compra, el camino a las condiciones completas.
  const links = (
    <p className="text-sm">
      <Link to={STORE_PAGES.paymentsDelivery} className={INFO_LINK}>
        Ver pagos y entregas
      </Link>
      {policies.warrantyPage && (
        <>
          <span className="text-muted-foreground"> · </span>
          <Link to={STORE_PAGES.warranty} className={INFO_LINK}>
            Garantía y cambios
          </Link>
        </>
      )}
    </p>
  );

  return (
    <section aria-labelledby="trust-heading">
      <details className="group border-t border-border sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-3 text-sm font-semibold text-foreground focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <HugeIcon icon={SecurityCheckIcon} size={20} aria-hidden className="shrink-0 text-primary-2" />
          <span id="trust-heading">Garantía, pago y entrega</span>
          <HugeIcon icon={ArrowDown01Icon} size={18} aria-hidden className="ml-auto shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <TrustItems items={items} className="grid gap-4 pt-1 pb-4" />
        <div className="pb-4">{links}</div>
      </details>
      <TrustItems items={items} className="hidden gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid sm:grid-cols-2 lg:grid-cols-4" />
      <div className="mt-3 hidden space-y-1 sm:block">
        {policies.shippingNote && <p className="text-sm text-muted-foreground">{policies.shippingNote}</p>}
        {links}
      </div>
    </section>
  );
}

function TrustItems({ items, className }: { items: Item[]; className: string }) {
  return (
    <ul className={cn(className)} aria-label="Garantía, pago y entrega">
      {items.map(({ icon, title, text }) => (
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
