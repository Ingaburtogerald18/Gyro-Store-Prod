import { randomUUID } from 'node:crypto';
import { db } from '../supabase';
import { config } from '../config';
import { round } from './finance';
import { computeCodeDiscount, checkDiscountCode } from './discountCode';
import { findOrCreateOrderContact } from './crm';
import { ingestEvents } from './analytics';
import { collectMappedCodes, normalizeImages, toCatalogDetail } from './catalogPresenter';
import { listPublishedCatalogByIds } from './catalog';
import { getLotsByCodes } from './inventory';
import { getActiveOffers } from './offers';
import { resolveOrderLines, type ResolvedComboInfo } from './orderLines';
import { isMissingColumn, persistOrder, restoreOrderAttempt, type OrderAttemptStore } from './orderPersistence';
import { createAttemptRegistry, OrderAttemptConflict, orderRequestHash } from './orderIdempotency';
import { NotFoundError } from '../utils/httpError';
import { logger } from '../utils/logger';
import {
  PUBLIC_ORDER_STATUSES,
  type CatalogDetail,
  type OrderIssue,
  type PublicOrderInput,
  type PublicOrderStatus,
  type TrackPublicOrderInput,
} from '../../shared/schemas';

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

/**
 * El carrito necesita revisión antes de crear el pedido (precio cambiado,
 * variante agotada, etc.). Sale como 409 con la lista de problemas por línea:
 * el cliente decide, nada se corrige en silencio.
 */
export class OrderReviewError extends Error {
  status = 409;
  constructor(public issues: OrderIssue[]) {
    super('Algunos productos del carrito cambiaron. Revisalos antes de enviar el pedido.');
  }
}

// `public_order_items.sku` es texto libre sin FK. Para una línea de combo se
// guarda con este prefijo: deja la fila identificable y greppable sin necesitar
// una columna nueva (misma convención que usa el carrito del cliente). Para un
// producto sigue siendo el `catalog_items.id`: el panel y el seguimiento lo leen
// así. La variante va en su propia columna (`variant_name`, migración 0019).
const comboSku = (comboId: string) => `combo:${comboId}`;

/** Link público de seguimiento. Va en el mensaje de WhatsApp para que quede en el chat del cliente. */
const trackingUrl = (orderId: string) => `${config.appUrl.replace(/\/$/, '')}/pedido/${orderId}`;

interface MessageLine {
  name: string;
  variantName?: string;
  quantity: number;
  lineTotal: number;
}

// El mensaje se arma en el SERVIDOR a propósito: lleva el total recalculado
// (autoritativo) y el número de la tienda sale de config, nunca del cliente.
// Con el pedido ya registrado, el mensaje lo presenta como tal: el pago y el
// envío se coordinan en el chat.
function buildWhatsappMessage(
  input: PublicOrderInput,
  lines: MessageLine[],
  total: number,
  discount?: { code: string; amount: number } | null,
  trackUrl?: string,
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
  msg += `💰 *TOTAL PRODUCTOS:  ${money(total)}*\n`;
  if (input.deliveryMethod === 'envio') msg += '🚚 Envío: por confirmar\n';
  msg += `${div}\n`;
  if (trackUrl) msg += `📦 Seguimiento: ${trackUrl}\n`;
  msg += '_¡Gracias! Quedo atento(a) para coordinar el pago y la entrega._ 🙌';

  return `https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

export class OrderCheckoutUnavailable extends Error {
  status = 503;
  constructor() {
    super('El registro de pedidos no está disponible temporalmente. Tu carrito sigue guardado; intentá más tarde.');
  }
}

type OrderDraft = { header: Record<string, unknown>; rows: Record<string, unknown>[]; response: CreatedPublicOrder };
function orderDatabaseError(error: { code?: string; message?: string }): never {
  if (['PGRST202', 'PGRST204', 'PGRST205', '42883', '42P01', '42703'].includes(error.code ?? '')) {
    logger.error('[orders] Falta aplicar 0021_atomic_public_order_checkout.sql', { code: error.code });
    throw new OrderCheckoutUnavailable();
  }
  if (error.code === 'PT409' || error.code === 'PT400') {
    if (error.code === 'PT409' && error.message === 'Este intento corresponde a otro pedido.') {
      throw new OrderAttemptConflict();
    }
    throw Object.assign(new Error(error.message || 'No se pudo registrar el pedido.'), { status: error.code === 'PT409' ? 409 : 400 });
  }
  throw error;
}
const orderStore: OrderAttemptStore<CreatedPublicOrder, OrderDraft> = {
  async find(key) {
    const { data, error } = await db.rpc('recover_public_order_attempt', { p_key: key });
    if (error) orderDatabaseError(error);
    return data as { requestHash: string; response: CreatedPublicOrder } | null;
  },
  async commit(key, hash, draft) {
    const { data, error } = await db.rpc('register_public_order_attempt', {
      p_key: key, p_request_hash: hash, p_header: draft.header, p_items: draft.rows, p_response: draft.response,
    });
    if (error) orderDatabaseError(error);
    return data as { response: CreatedPublicOrder; replayed: boolean };
  },
};
const attempts = createAttemptRegistry<CreatedPublicOrder>();

export function createPublicOrder(input: PublicOrderInput): Promise<CreatedPublicOrder> {
  const key = input.idempotencyKey ?? randomUUID();
  const hash = orderRequestHash(input);
  return attempts.run(key, hash, async () => {
    // Recuperar ANTES de revalidar stock/cupón: el pedido ya registrado puede
    // haber agotado el código o cambiado de disponibilidad desde el primer envío.
    const stored = await restoreOrderAttempt(orderStore, key, hash);
    return stored ?? createPublicOrderOnce(input, key, hash);
  });
}
export function recoverPublicOrder(key: string): Promise<CreatedPublicOrder | null> {
  return restoreOrderAttempt(orderStore, key);
}

async function loadDetails(ids: string[]): Promise<Map<string, CatalogDetail>> {
  const rows = await listPublishedCatalogByIds(ids);
  const [lots, offers] = await Promise.all([getLotsByCodes(rows.flatMap(collectMappedCodes)), getActiveOffers()]);
  return new Map(rows.map((row) => [row.id, toCatalogDetail(row, lots, offers.get(row.id))]));
}

async function createPublicOrderOnce(input: PublicOrderInput, key: string, hash: string): Promise<CreatedPublicOrder> {
  // 1. Separar las dos clases de línea. El schema ya garantizó que cada ítem
  // trae exactamente uno de los dos ids, así que los filtros no se solapan.
  const catalogIds = [...new Set(input.items.map((item) => item.catalogItemId).filter((id): id is string => Boolean(id)))];
  const comboIds = [...new Set(input.items.map((item) => item.comboId).filter((id): id is string => Boolean(id)))];

  // 2. Productos con la MISMA presentación que la ficha (precio por variante,
  // promoción y disponibilidad desde bodega) y combos publicados, en paralelo.
  const [details, comboRes] = await Promise.all([
    loadDetails(catalogIds),
    comboIds.length
      ? db.from('combos').select('id, name, price, images').in('id', comboIds).eq('published', true)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (comboRes.error) throw comboRes.error;

  const combos = new Map<string, ResolvedComboInfo>();
  for (const row of comboRes.data ?? []) {
    combos.set(row.id, { id: row.id, name: row.name ?? 'Combo', price: row.price });
  }

  // 3. Resolver cada línea: variante exacta, precio autorizado y disponibilidad.
  // Cualquier diferencia con lo que vio el cliente frena el pedido para revisar.
  const { lines, issues } = resolveOrderLines(input.items, details, combos);
  if (issues.length) throw new OrderReviewError(issues);

  const orderItems: CreatedPublicOrderItem[] = lines.map((line) => ({
    ...(line.comboId ? { comboId: line.comboId } : { catalogItemId: line.catalogItemId }),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    ...(line.variantName ? { variantName: line.variantName } : {}),
  }));
  const messageLines: MessageLine[] = lines.map((line) => ({
    name: line.name,
    variantName: line.variantName,
    quantity: line.quantity,
    lineTotal: line.unitPrice * line.quantity,
  }));

  // 4. Subtotal autoritativo.
  const subtotal = round(
    orderItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    2,
  );

  // 5. Preview del código (no consume uso). El canje real va al FINAL, cuando el
  // pedido y sus líneas ya están guardados: un fallo previo no gasta el código.
  let discountCode: string | null = null;
  let codeDiscount = 0;
  if (input.discountCode) {
    const checked = await checkDiscountCode(input.discountCode);
    codeDiscount = round(computeCodeDiscount(checked.type, checked.value, subtotal), 2);
    discountCode = checked.code;
  }
  const total = round(subtotal - codeDiscount, 2);

  // 6. Registrar/enlazar al COMPRADOR en el CRM (best-effort). Si falla,
  // devuelve null y el pedido igual se guarda.
  const contactId = await findOrCreateOrderContact(input.phone, input.customerName);

  // Una transacción registra pedido, variantes, nombres/fotos, cupón y respuesta.
  // Un error revierte TODO; no hay fallback que pierda opciones ni pedidos parciales.
  const id = randomUUID();
  const response: CreatedPublicOrder = {
    id, phone: input.phone, total, status: 'new', items: orderItems,
    whatsappUrl: buildWhatsappMessage(input, messageLines, total,
      discountCode ? { code: discountCode, amount: codeDiscount } : null, trackingUrl(id)),
  };
  const result = await persistOrder(orderStore, key, hash, {
    header: {
      id, contact_id: contactId, phone: input.phone, customer_name: input.customerName,
      delivery_method: input.deliveryMethod, address: input.address ?? null,
      location_url: input.locationUrl ?? null, note: input.note ?? null,
      total, discount_code: discountCode, code_discount: codeDiscount,
    },
    rows: lines.map(line => ({
      sku: line.comboId ? comboSku(line.comboId) : line.catalogItemId,
      quantity: line.quantity, precio_unit: line.unitPrice, variant_name: line.variantName ?? null,
      product_name: line.name,
      product_image: line.comboId
        ? normalizeImages((comboRes.data ?? []).find(row => row.id === line.comboId)?.images)[0] ?? null
        : details.get(line.catalogItemId as string)?.images[0] ?? null,
    })),
    response,
  });
  if (!result.replayed) {
    await ingestEvents([{
      type: 'order_created', sessionId: input.sessionId, path: '/checkout',
      payload: { publicOrderId: result.response.id, total: result.response.total },
    }]);
  }
  return result.response;
}

// ============================================================================
// Seguimiento del pedido web (sin cuenta)
// ============================================================================
//
// El id del pedido es un UUID aleatorio: quien tiene el link `/pedido/<id>` es
// quien hizo el pedido (o a quien se lo pasó). Por eso la vista pública NO lleva
// teléfono, dirección ni ubicación: solo lo que sirve para seguir el pedido.

export interface PublicOrderLine {
  name: string;
  /** Combinación elegida; null en pedidos anteriores a la migración 0019. */
  variantName: string | null;
  image: string | null;
  quantity: number;
  unitPrice: number;
}

export interface PublicOrderTracking {
  id: string;
  status: PublicOrderStatus;
  deliveryMethod: 'retiro' | 'envio' | null;
  /** Solo el primer nombre: alcanza para saludar, no identifica a nadie. */
  firstName: string | null;
  total: number;
  codeDiscount: number;
  createdAt: string;
  items: PublicOrderLine[];
}

export interface AdminPublicOrder {
  id: string;
  status: PublicOrderStatus;
  customerName: string | null;
  phone: string | null;
  deliveryMethod: 'retiro' | 'envio' | null;
  address: string | null;
  locationUrl: string | null;
  note: string | null;
  total: number;
  discountCode: string | null;
  codeDiscount: number;
  createdAt: string;
  items: PublicOrderLine[];
  /** Venta en que se convirtió (migración 0023). Null si todavía no. */
  saleId: string | null;
}

const isKnownStatus = (s: unknown): s is PublicOrderStatus =>
  PUBLIC_ORDER_STATUSES.includes(s as PublicOrderStatus);

// Un valor viejo o desconocido en la base se lee como "recibido" en vez de romper.
const toStatus = (s: unknown): PublicOrderStatus => (isKnownStatus(s) ? s : 'new');

type ItemRow = {
  public_order_id: string;
  sku: string | null;
  quantity: number;
  precio_unit: number | null;
  variant_name?: string | null;
  product_name?: string | null;
  product_image?: string | null;
};

/**
 * Resuelve el nombre e imagen de cada línea. `public_order_items.sku` guarda el
 * id del catalog_item o `combo:<id>` (ver `comboSku`), así que se consultan las
 * dos tablas en paralelo, una sola vez para todos los pedidos.
 */
async function resolveLines(rows: ItemRow[]): Promise<Map<string, PublicOrderLine[]>> {
  const catalogIds = new Set<string>();
  const comboIds = new Set<string>();
  for (const row of rows) {
    if (!row.sku || row.product_name) continue;
    if (row.sku.startsWith('combo:')) comboIds.add(row.sku.slice('combo:'.length));
    else catalogIds.add(row.sku);
  }

  const [catalogRes, comboRes] = await Promise.all([
    catalogIds.size
      ? db.from('catalog_items').select('id, name, images, template:templates(name)').in('id', [...catalogIds])
      : Promise.resolve({ data: [], error: null } as const),
    comboIds.size
      ? db.from('combos').select('id, name, images').in('id', [...comboIds])
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (catalogRes.error) throw catalogRes.error;
  if (comboRes.error) throw comboRes.error;

  const info = new Map<string, { name: string; image: string | null }>();
  for (const row of catalogRes.data ?? []) {
    const template = row.template as unknown as { name?: string | null } | { name?: string | null }[] | null;
    const templateName = Array.isArray(template) ? template[0]?.name : template?.name;
    info.set(row.id, {
      name: row.name || templateName || 'Producto',
      image: normalizeImages(row.images)[0] ?? null,
    });
  }
  for (const row of comboRes.data ?? []) {
    info.set(comboSku(row.id), { name: row.name || 'Combo', image: normalizeImages(row.images)[0] ?? null });
  }

  const byOrder = new Map<string, PublicOrderLine[]>();
  for (const row of rows) {
    const meta = row.sku ? info.get(row.sku) : undefined;
    const lines = byOrder.get(row.public_order_id) ?? [];
    lines.push({
      // Un producto borrado después del pedido no rompe la vista.
      name: row.product_name ?? meta?.name ?? 'Producto no disponible',
      variantName: row.variant_name?.trim() || null,
      image: row.product_name !== undefined && row.product_name !== null ? row.product_image ?? null : meta?.image ?? null,
      quantity: row.quantity,
      unitPrice: Number(row.precio_unit ?? 0),
    });
    byOrder.set(row.public_order_id, lines);
  }
  return byOrder;
}

async function linesFor(orderIds: string[]): Promise<Map<string, PublicOrderLine[]>> {
  if (orderIds.length === 0) return new Map();
  const read = (columns: string) =>
    db.from('public_order_items').select(columns).in('public_order_id', orderIds).order('created_at', { ascending: true });
  let { data, error } = await read('public_order_id, sku, quantity, precio_unit, variant_name, product_name, product_image');
  if (isMissingColumn(error)) ({ data, error } = await read('public_order_id, sku, quantity, precio_unit, variant_name'));
  // Sin la migración 0019 la columna no existe: se lee la forma anterior.
  if (isMissingColumn(error)) ({ data, error } = await read('public_order_id, sku, quantity, precio_unit'));
  if (error) throw error;
  return resolveLines((data ?? []) as unknown as ItemRow[]);
}

/** Vista pública de un pedido por su id completo (el link de seguimiento). */
export async function getPublicOrderTracking(id: string): Promise<PublicOrderTracking> {
  const { data: order, error } = await db
    .from('public_orders')
    .select('id, status, delivery_method, customer_name, total, code_discount, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new NotFoundError('No encontramos ese pedido.');

  const lines = await linesFor([order.id]);
  return {
    id: order.id,
    status: toStatus(order.status),
    deliveryMethod: order.delivery_method,
    firstName: order.customer_name?.trim().split(/\s+/)[0] || null,
    total: Number(order.total ?? 0),
    codeDiscount: Number(order.code_discount ?? 0),
    createdAt: order.created_at,
    items: lines.get(order.id) ?? [],
  };
}

/**
 * Las formas en que el mismo número pudo quedar guardado: el checkout guarda el
 * teléfono tal como lo escribió la persona (`85944758`, `+50585944758`…).
 */
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('505') ? digits.slice(3) : digits;
  const variants = new Set([phone, digits, `+${digits}`, local]);
  if (local.length === 8) {
    variants.add(`505${local}`);
    variants.add(`+505${local}`);
  }
  return [...variants];
}

/**
 * Rastreo sin link: número corto del pedido + teléfono. Devuelve el id completo
 * para que el front navegue a `/pedido/<id>`. Mismo 404 si el número no existe o
 * si el teléfono no coincide: no se revela cuál de los dos falló.
 */
export async function findPublicOrderByCode(input: TrackPublicOrderInput): Promise<{ id: string }> {
  const { data, error } = await db
    .from('public_orders')
    .select('id')
    .in('phone', phoneVariants(input.phone))
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const match = (data ?? []).find((row) => row.id.toLowerCase().startsWith(input.code));
  if (!match) throw new NotFoundError('No encontramos un pedido con ese número y teléfono.');
  return { id: match.id };
}

/** Lista para el panel: pedidos web más recientes primero, con sus líneas. */
export async function listPublicOrders(limit = 300): Promise<AdminPublicOrder[]> {
  const BASE =
    'id, status, customer_name, phone, delivery_method, address, location_url, note, total, discount_code, code_discount, created_at';
  const run = (columns: string) =>
    db.from('public_orders').select(columns).order('created_at', { ascending: false }).limit(limit);
  // `sale_id` llega con la 0023; sin ella se lista igual.
  let { data, error } = await run(`${BASE}, sale_id`);
  if (isMissingColumn(error)) ({ data, error } = await run(BASE));
  if (error) throw error;

  const orders = (data ?? []) as unknown as {
    id: string;
    status: string;
    customer_name: string | null;
    phone: string | null;
    delivery_method: 'retiro' | 'envio' | null;
    address: string | null;
    location_url: string | null;
    note: string | null;
    total: number | null;
    discount_code: string | null;
    code_discount: number | null;
    created_at: string;
    sale_id?: string | null;
  }[];
  const lines = await linesFor(orders.map((o) => o.id));
  return orders.map((o) => ({
    id: o.id,
    status: toStatus(o.status),
    customerName: o.customer_name,
    phone: o.phone,
    deliveryMethod: o.delivery_method,
    address: o.address,
    locationUrl: o.location_url,
    note: o.note,
    total: Number(o.total ?? 0),
    discountCode: o.discount_code,
    codeDiscount: Number(o.code_discount ?? 0),
    createdAt: o.created_at,
    items: lines.get(o.id) ?? [],
    saleId: o.sale_id ?? null,
  }));
}

export async function updatePublicOrderStatus(
  id: string,
  status: PublicOrderStatus,
): Promise<{ id: string; status: PublicOrderStatus }> {
  const { data, error } = await db
    .from('public_orders')
    .update({ status })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('El pedido no existe.');
  return { id: data.id, status: toStatus(data.status) };
}
