// Franja de confianza después de la información del producto. Las cuatro
// promesas comparten una superficie abierta para no competir con la ficha.
import { HugeIcon } from '~/components/ui/icon';
import {
  DeliveryTruck01Icon,
  HeadsetIcon,
  SecurityCheckIcon,
  Wallet01Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';

const ITEMS: { icon: IconSvgElement; title: string; text: string }[] = [
  {
    icon: DeliveryTruck01Icon,
    title: 'Delivery en Managua',
    text: 'Entrega el mismo día dentro de la ciudad.',
  },
  {
    icon: Wallet01Icon,
    title: 'Pagá como prefieras',
    text: 'Efectivo, transferencia o tarjeta.',
  },
  {
    icon: SecurityCheckIcon,
    title: 'Garantía real',
    text: 'Todos los productos con garantía de tienda.',
  },
  {
    icon: HeadsetIcon,
    title: 'Soporte por WhatsApp',
    text: 'Te acompañamos antes y después de comprar.',
  },
];

export function TrustBox() {
  return (
    <div>
      <details className="group border-t border-border sm:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 text-sm font-semibold text-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <HugeIcon icon={SecurityCheckIcon} size={20} aria-hidden className="shrink-0 text-primary-2" />
          Envío, pago y garantía
          <HugeIcon icon={ArrowDown01Icon} size={18} aria-hidden className="ml-auto shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <TrustItems className="grid gap-5 pt-2 pb-4" />
      </details>
      <TrustItems className="hidden gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid sm:grid-cols-2 lg:grid-cols-4" />
    </div>
  );
}

function TrustItems({ className }: { className: string }) {
  return (
    <ul className={className} aria-label="Garantías de compra">
      {ITEMS.map((item) => (
        <li key={item.title} className="flex min-w-0 items-start gap-3">
          <HugeIcon
            icon={item.icon}
            size={20}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 shrink-0 text-primary-2"
          />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
