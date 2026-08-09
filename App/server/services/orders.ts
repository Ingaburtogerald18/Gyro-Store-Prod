import { db } from '../supabase';
import { config } from '../config';
import { round } from './finance';
import { redeemDiscountCode, computeCodeDiscount, checkDiscountCode } from './discountCode';
import { findOrCreateOrderContact } from './crm';
import { ingestEvents } from './analytics';
import type { PublicOrderInput } from '../../shared/schemas';

/** Una línea ya resuelta contra la BD: o es un producto, o es un combo. */
export interface CreatedPublicOrderItem {
  catalogItemId?: string;
  comboId?: string;
  quantity: number;
  unitPrice: number;
  variantName?: string;
}

export interface CreatedPublicOrder {
  id: string;
  phone: string;
  total: number;
  status: string;
  items: CreatedPublicOrderItem[];
  /** Link a WhatsApp con el pedido ya formateado, listo para abrir. */
  whatsappUrl: string;
}

// `public_order_items.sku` es texto libre sin FK. Para una línea de combo se
// guarda con este prefijo: deja la fila identificable y greppable sin necesitar
// una columna nueva (misma convención que usa el carrito del cliente).
const comboSku = (comboId: string) => `combo:${comboId}`;

interface MessageLine {
  name: string;
  variantName?: string;
  quantity: number;
  lineTotal: number;
}

// El mensaje se arma en el SERVIDOR a propósito: lleva el total recalculado
// (autoritativo) y el número de la tienda sale de config, nunca del cliente.
function buildWhatsappMessage(
  input: PublicOrderInput,
  lines: MessageLine[],
  total: number,
  discount?: { code: string; amount: number } | null,
): string {
  const money = (n: number) => `${config.currency}${Number(n || 0).toLocaleString('es-NI')}`;
  const div = '━━━━━━━━━━━━━━━';

  let msg = `🛒 *NUEVO PEDIDO — ${config.brandName}*\n`;
  msg += `${div}\n`;
  msg += `👤 *${input.customerName}*\n`;
  msg += `📞 ${input.phone}\n`;
  if (input.deliveryMethod === 'envio') {
    msg += '🚚 *Envío a domicilio*\n';
    if (input.address) msg += `📍 ${input.address}\n`;
    if (input.locationUrl) msg += `🗺️ Ubicación: ${input.locationUrl}\n`;
  } else {
    msg += '🏬 *Retiro en tienda*\n';
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
  msg += `💰 *TOTAL:  ${money(total)}*\n`;
  msg += `${div}\n`;
  msg += '_¡Gracias! Quedo atento(a) para coordinar el pago._ 🙌';

  return `https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

export async function createPublicOrder(input: PublicOrderInput): Promise<CreatedPublicOrder> {
  // 1. Separar las dos clases de línea. El schema ya garantizó que cada ítem
  // trae exactamente uno de los dos ids, así que los filtros no se solapan.
  const catalogIds = input.items
    .map((item) => item.catalogItemId)
    .filter((id): id is string => Boolean(id));
  const comboIds = input.items
    .map((item) => item.comboId)
    .filter((id): id is string => Boolean(id));

  // 2. Consultar catalog_items y combos EN PARALELO, filtrando por ids y
  // exigiendo que estén publicados. De catalog_items se trae el nombre del
  // template para nombrar cada línea en el mensaje de WhatsApp sin confiar en
  // lo que mandó el cliente; de combos, su nombre y su precio de paquete.
  //
  // Un `.in('id', [])` traería la tabla entera en algunos backends, así que la
  // consulta se omite cuando no hay ids de ese tipo.
  const [catalogRes, comboRes] = await Promise.all([
    catalogIds.length
      ? db
          .from('catalog_items')
          .select('id, price, base_price, template:templates(name)')
          .in('id', catalogIds)
          .eq('published', true)
      : Promise.resolve({ data: [], error: null } as const),
    comboIds.length
      ? db.from('combos').select('id, name, price').in('id', comboIds).eq('published', true)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (catalogRes.error) {
    throw catalogRes.error;
  }
  if (comboRes.error) {
    throw comboRes.error;
  }

  // 3. Armar los mapas de precio y nombre por tipo de línea.
  const priceMap = new Map<string, number | null>();
  const nameMap = new Map<string, string>();
  for (const row of catalogRes.data ?? []) {
    priceMap.set(row.id, row.price ?? row.base_price);
    // El join llega como objeto o como array según la cardinalidad inferida.
    const template = row.template as unknown as { name?: string | null } | { name?: string | null }[] | null;
    const name = Array.isArray(template) ? template[0]?.name : template?.name;
    nameMap.set(row.id, name ?? 'Producto');
  }

  const comboPriceMap = new Map<string, number | null>();
  const comboNameMap = new Map<string, string>();
  for (const row of comboRes.data ?? []) {
    comboPriceMap.set(row.id, row.price);
    comboNameMap.set(row.id, row.name ?? 'Combo');
  }

  const orderItems: CreatedPublicOrderItem[] = [];
  // Nombre por línea para el mensaje: se resuelve acá, donde todavía se sabe si
  // la línea era un producto o un combo.
  const messageLines: MessageLine[] = [];

  // 4 y 5. Resolver precio y nombre de cada línea contra la BD.
  for (const item of input.items) {
    const isCombo = Boolean(item.comboId);
    const id = (isCombo ? item.comboId : item.catalogItemId) as string;
    const price = isCombo ? comboPriceMap.get(id) : priceMap.get(id);

    // Es crucial el == null en lugar de !price para no tratar un valor de 0 como
    // error. Un combo despublicado o sin precio cae acá igual que un producto
    // no disponible: desde afuera son el mismo 400.
    if (price == null) {
      const err = new Error(
        isCombo
          ? 'Uno o más combos del pedido ya no están disponibles.'
          : 'Uno o más productos del pedido no están disponibles.',
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    orderItems.push({
      ...(isCombo ? { comboId: id } : { catalogItemId: id }),
      quantity: item.quantity,
      unitPrice: price,
      variantName: item.variantName,
    });
    messageLines.push({
      name: (isCombo ? comboNameMap.get(id) : nameMap.get(id)) ?? (isCombo ? 'Combo' : 'Producto'),
      // En una línea de combo `variantName` es la etiqueta "Combo", que no aporta
      // nada al mensaje: el paquete ya se distingue por su nombre.
      variantName: isCombo ? undefined : item.variantName,
      quantity: item.quantity,
      lineTotal: price * item.quantity,
    });
  }

  // 6. Calcular el subtotal sumando unitPrice * quantity
  const subtotal = round(
    orderItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    2,
  );

  // 6b. Validar (preview) el código de descuento (si vino).
  // Solo leemos el código para calcular el descuento antes de crear la orden.
  let discountCode: string | null = null;
  let codeDiscount = 0;
  if (input.discountCode) {
    const checked = await checkDiscountCode(input.discountCode);
    codeDiscount = round(computeCodeDiscount(checked.type, checked.value, subtotal), 2);
    discountCode = checked.code;
  }
  const total = round(subtotal - codeDiscount, 2);

  // 6c. Registrar/enlazar al COMPRADOR en el CRM (best-effort). Un pedido web es
  // un lead gestionable: find-or-create por teléfono deja el contacto listo para
  // seguimiento desde el panel. Si falla, devuelve null y el pedido igual se guarda.
  const contactId = await findOrCreateOrderContact(input.phone, input.customerName);

  // 7. Insertar en public_orders con los datos de entrega del comprador. La tabla
  // ya tiene las columnas (0001), pero hasta ahora solo se guardaba phone/total:
  // persistir el destino evita depender del mensaje de WhatsApp para despachar.
  const { data: order, error: orderError } = await db
    .from('public_orders')
    .insert({
      contact_id: contactId,
      phone: input.phone,
      customer_name: input.customerName,
      delivery_method: input.deliveryMethod,
      address: input.address ?? null,
      location_url: input.locationUrl ?? null,
      note: input.note ?? null,
      total,
      status: 'new',
      discount_code: discountCode,
      code_discount: codeDiscount,
    })
    .select('id, phone, total, status')
    .single();

  if (orderError) {
    throw orderError;
  }

  // 7b. Canje real del código de descuento (ahora que tenemos referenceId).
  // Si el canje falla (alguien más lo usó en este ms), borramos la orden y abortamos.
  if (discountCode) {
    try {
      await redeemDiscountCode(discountCode, {
        source: 'checkout',
        referenceId: order.id,
        referenceLabel: 'Pedido web',
        method: null,
        amount: codeDiscount,
      });
    } catch (err) {
      await db.from('public_orders').delete().eq('id', order.id);
      throw err;
    }
  }

  // 8. Insertar en public_order_items
  const { error: itemsError } = await db.from('public_order_items').insert(
    orderItems.map((item) => ({
      public_order_id: order.id,
      // TODO(Claude): reemplazar por el SKU real de la variante elegida cuando el frontend soporte selección de variantes (doc 03 variant_mappings). Por ahora usamos el catalogItemId como identificador temporal.
      sku: item.comboId ? comboSku(item.comboId) : item.catalogItemId,
      quantity: item.quantity,
      precio_unit: item.unitPrice,
    }))
  );

  // 9. Si el insert falla: borrar el public_order recién creado para no dejarlo huérfano y relanzar el error
  if (itemsError) {
    await db.from('public_orders').delete().eq('id', order.id);
    throw itemsError;
  }

  // 10. Telemetría de conversión (best-effort, no bloquea ni rompe el pedido):
  // cierra el embudo vista→pedido. El `sessionId` lo manda el cliente para
  // enlazar la sesión anónima con el pedido; `ingestEvents` traga cualquier error
  // (p. ej. si la migración 0005 aún no se aplicó).
  await ingestEvents([
    {
      type: 'order_created',
      sessionId: input.sessionId,
      path: '/checkout',
      payload: { publicOrderId: order.id, total },
    },
  ]);

  // 11. Devolver la orden construida + el link de WhatsApp ya formateado.
  return {
    ...order,
    items: orderItems,
    whatsappUrl: buildWhatsappMessage(
      input,
      messageLines,
      total,
      discountCode ? { code: discountCode, amount: codeDiscount } : null,
    ),
  };
}