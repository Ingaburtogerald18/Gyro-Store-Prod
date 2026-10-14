// Mensaje de WhatsApp del pedido web. Puro: recibe los datos del negocio y no toca la base, así lo cubre
// tests/order-delivery.test.ts.
import type { PublicOrderInput, StoredDeliveryMethod } from '../../../shared/schemas';

export interface MessageLine {
  name: string;
  variantName?: string;
  quantity: number;
  lineTotal: number;
}

export type MessageBusiness = { brandName: string; whatsapp: string; currency: string };

const DELIVERY_HEADING: Record<StoredDeliveryMethod, string> = {
  managua: '🛵 *Delivery en Managua*',
  cargo_trans: '🚚 *Envío por Cargo Trans*',
  retiro: '📍 *Retiro*',
  envio: '🚚 *Envío a domicilio*',
};

// El mensaje se arma en el servidor: lleva el total recalculado y el número de la tienda de Configuración.
export function buildWhatsappMessage(
  input: PublicOrderInput,
  lines: MessageLine[],
  total: number,
  business: MessageBusiness,
  discount?: { code: string; amount: number } | null,
  trackUrl?: string,
): string {
  const money = (n: number) => `${business.currency}${Number(n || 0).toLocaleString('es-NI')}`;
  const div = '━━━━━━━━━━━━━━━';

  let msg = `🛒 *NUEVO PEDIDO — ${business.brandName}*\n`;
  msg += `${div}\n`;
  msg += `👤 *${input.customerName}*\n`;
  msg += `📞 ${input.phone}\n`;
  msg += `${DELIVERY_HEADING[input.deliveryMethod]}\n`;
  if (input.deliveryMethod !== 'retiro') {
    if (input.address) msg += `📍 ${input.address}\n`;
    if (input.locationUrl) msg += `🗺️ Ubicación: ${input.locationUrl}\n`;
  }
  if (input.note) msg += `📝 _${input.note}_\n`;

  msg += `${div}\n`;
  msg += '🛍️ *Mi pedido*\n\n';
  for (const line of lines) {
    const variant =
      line.variantName && line.variantName !== 'Estándar' ? `  _(${line.variantName})_` : '';
    msg += `🔹 *${line.name}*${variant}  ×${line.quantity}\n`;
    msg += `   💵 ${money(line.lineTotal)}\n\n`;
  }

  msg += `${div}\n`;
  if (discount && discount.amount > 0) {
    msg += `🎟️ Código ${discount.code}:  -${money(discount.amount)}\n`;
  }
  msg += `💰 *TOTAL PRODUCTOS:  ${money(total)}*\n`;
  // El transporte nunca se suma al total: se cotiza o se paga aparte.
  if (input.deliveryMethod === 'managua' || input.deliveryMethod === 'envio') msg += '🛵 Delivery: a cotizar\n';
  if (input.deliveryMethod === 'cargo_trans') msg += '🚚 Transporte: aparte, con el comprobante de Cargo Trans\n';
  msg += `${div}\n`;
  if (trackUrl) msg += `📦 Seguimiento: ${trackUrl}\n`;
  msg += '_¡Gracias! Quedo atento(a) para coordinar el pago y la entrega._ 🙌';

  return `https://wa.me/${business.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}
