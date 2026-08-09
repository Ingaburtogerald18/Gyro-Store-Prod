// Señales de confianza del negocio. Fuente única: las consumen el footer
// (siempre visible) y el TrustBox de la ficha. Un solo lugar para editar el
// texto o el orden sin que las dos piezas se desincronicen.
import { CreditCardIcon, ShieldCheck, TruckDeliveryIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';

export interface TrustSignal {
  icon: IconSvgElement;
  label: string;
}

export const TRUST_SIGNALS: TrustSignal[] = [
  { icon: TruckDeliveryIcon, label: 'Envío en Managua' },
  { icon: CreditCardIcon, label: 'Pago contra entrega' },
  { icon: ShieldCheck, label: 'Garantía en cada compra' },
];
