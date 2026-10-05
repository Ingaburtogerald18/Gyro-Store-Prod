// Trust box de la ficha (patrón del V1): grilla 2×2 con las cuatro promesas de
// compra. Contenido fijo — es copy de confianza de la tienda, no dato del
// producto. Va debajo de la galería en desktop y tras el bloque de compra en
// móvil (lo decide el orden en producto.$id.tsx).
import { HugeIcon } from '~/components/ui/icon';
import {
  DeliveryTruck01Icon,
  HeadsetIcon,
  SecurityCheckIcon,
  Wallet01Icon,
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
    // Dos columnas también en móvil: apiladas en una sola, las cuatro tarjetas
    // ocupaban casi una pantalla entera entre el botón de compra y las specs.
    <ul className="grid grid-cols-2 gap-2" aria-label="Garantías de compra">
      {ITEMS.map((item) => (
        <li key={item.title} className="rounded-xl border bg-card p-3 sm:p-4">
          <HugeIcon
            icon={item.icon}
            size={18}
            strokeWidth={2}
            aria-hidden
            className="text-primary-2"
          />
          <p className="mt-1.5 text-[0.8125rem] leading-snug font-bold text-foreground sm:text-sm">{item.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {item.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
