import { db } from '../../core/supabase';
import { config } from '../../core/config';
import { round } from '../finance/costing';
import { BadRequestError } from '../../utils/http-error';
import type { CreateInvoiceInput } from '../../../shared/schemas';
import { listSellableProducts } from '../sales/sales-quote';
import { redeemDiscountCode, computeCodeDiscount, checkDiscountCode } from '../discount-codes/discount-codes';

export interface Invoice {
  id: string;
  saleId: string | null;
  /** Correlativo numérico: es el artefacto legal y el criterio de orden. */
  invoiceNumber: number;
  /** Código legible derivado del correlativo: `GS-PR-12`. Es lo que se imprime. */
  invoiceCode: string;
  status: string;
  method: string | null;
  deliveryFee: number;
  total: number;
  createdAt: string;
  customerName?: string | null;
  phone?: string | null;
  subtotal?: number;
  discount?: number;
  deliveryName?: string | null;
  /** Vendedor al que Caja le asignó la factura al emitirla (o null). */
  sellerUid?: string | null;
  /**
   * Nombre del vendedor asignado, con una segunda consulta: un embed de PostgREST rompe el listado
   * entero si la FK no está en caché.
   */
  sellerName?: string | null;
  /** Quien canjeó la factura en una venta (y cobra su comisión); puede no ser a quien Caja la asignó. */
  registeredByName?: string | null;
  /** Solo las trae `findInvoiceByNumber`: en el listado serían una consulta por factura. */
  items?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface InvoiceRow {
  id: string;
  sale_id: string | null;
  invoice_number: number;
  invoice_code: string | null;
  status: string;
  method: string | null;
  delivery_fee: number | null;
  total: number | null;
  created_at: string;
  customer_name: string | null;
  phone: string | null;
  subtotal: number | null;
  discount: number | null;
  delivery_name: string | null;
  seller_uid: string | null;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    saleId: row.sale_id,
    invoiceNumber: row.invoice_number,
    invoiceCode: row.invoice_code ?? formatInvoiceCode(row.invoice_number),
    status: row.status,
    method: row.method,
    deliveryFee: row.delivery_fee ?? 0,
    total: row.total ?? 0,
    createdAt: row.created_at,
    customerName: row.customer_name,
    phone: row.phone,
    subtotal: row.subtotal ?? 0,
    discount: row.discount ?? 0,
    deliveryName: row.delivery_name,
    sellerUid: row.seller_uid,
  };
}

const INVOICE_COLUMNS = 'id, sale_id, invoice_number, invoice_code, status, method, delivery_fee, total, created_at, customer_name, phone, subtotal, discount, delivery_name, seller_uid';

export const INVOICE_CODE_PREFIX = 'GS-PR-';

export function formatInvoiceCode(n: number): string {
  return `${INVOICE_CODE_PREFIX}${n}`;
}

/** Acepta `GS-PR-12`, `gs-pr-12`, `GSPR12` o `12`. Null si no se reconoce. */
export function parseInvoiceCode(raw: string | number | null | undefined): number | null {
  const cleaned = String(raw ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
  const match = cleaned.match(/^(?:GSPR)?(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Emite la factura como documento independiente (unlinked).
export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  // Validar productos (que existan). No verificamos stock riguroso acá, 
  // ya que la venta final (orders) será la que haga la reserva y baje inventario.
  const sellables = await listSellableProducts();
  const validProducts = new Set(sellables.map(s => s.productName));
  
  let subtotal = 0;
  for (const item of input.items) {
    if (!validProducts.has(item.productName)) {
      throw new BadRequestError(`El producto "${item.productName}" no está en el catálogo disponible.`);
    }
    subtotal += item.quantity * item.unitPrice;
  }

  subtotal = round(subtotal, 2);

  // Código de descuento (opcional): primero preview (solo validamos)
  let discountCode: string | null = null;
  let codeDiscount = 0;
  if (input.discountCode) {
    const checked = await checkDiscountCode(input.discountCode);
    codeDiscount = round(computeCodeDiscount(checked.type, checked.value, subtotal), 2);
    discountCode = checked.code;
  }

  const manualDiscount = input.discount ?? 0;
  const discount = round(Math.min(manualDiscount + codeDiscount, subtotal), 2); // No descontar más del subtotal
  const deliveryFee = round(input.deliveryFee ?? 0, 2);
  const total = round(subtotal - discount + deliveryFee, 2);

  let customCreatedAt: string | undefined = undefined;
  if (input.issuedAt) {
    const issuedDate = new Date(input.issuedAt);
    if (isNaN(issuedDate.getTime())) {
      throw new BadRequestError('Fecha de factura inválida.');
    }
    if (issuedDate.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestError('La fecha de factura no puede ser futura.');
    }
    customCreatedAt = issuedDate.toISOString();
  }

  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .insert({
      status: 'unlinked',
      method: input.method,
      delivery_fee: deliveryFee,
      total,
      customer_name: input.customerName || null,
      phone: input.phone || null,
      subtotal,
      discount,
      discount_code: discountCode,
      delivery_name: input.deliveryName || null,
      seller_uid: input.sellerUid || null,
      ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
    })
    .select(INVOICE_COLUMNS)
    .single();
    
  if (invoiceError) throw invoiceError;

  // Canje real del código de descuento
  if (discountCode) {
    try {
      await redeemDiscountCode(discountCode, {
        source: 'invoice',
        referenceId: invoice.id,
        referenceLabel: 'Factura ' + (invoice.invoice_code ?? formatInvoiceCode(invoice.invoice_number)),
        method: input.method,
        amount: codeDiscount,
        redeemedBy: null, // Si tuvieramos usuario, se pasaría aquí
      });
    } catch (err) {
      await db.from('invoices').delete().eq('id', invoice.id);
      throw err;
    }
  }

  // Insertar líneas (invoice_items)
  const itemsToInsert = input.items.map(item => ({
    invoice_id: invoice.id,
    sku: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    line_total: round(item.quantity * item.unitPrice, 2),
    ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
  }));

  const { error: itemsError } = await db
    .from('invoice_items')
    .insert(itemsToInsert);

  if (itemsError) throw itemsError;

  return toInvoice(invoice as unknown as InvoiceRow);
}

// Ligado en dos pasos: registerSale primero toma la factura y recién después crea la venta, así un
// doble clic no crea dos ventas: el segundo la encuentra tomada y corta antes de reservar stock.

export async function claimInvoice(invoiceNumber: number): Promise<void> {
  const { data, error } = await db
    .from('invoices')
    .update({ status: 'linked' })
    .eq('invoice_number', invoiceNumber)
    .eq('status', 'unlinked') // compare-and-swap: solo si nadie la tomó entre medio
    .is('sale_id', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new BadRequestError('Esta factura ya está vinculada a otra venta o fue anulada.');
  }
}

// Deshace `claimInvoice` si el registro falló después de tomarla.
export async function releaseInvoiceClaim(invoiceNumber: number): Promise<void> {
  const { error } = await db
    .from('invoices')
    .update({ status: 'unlinked', sale_id: null })
    .eq('invoice_number', invoiceNumber)
    .eq('status', 'linked');
  if (error) console.error(`[invoice] No se pudo liberar la factura ${invoiceNumber}: revisar a mano.`, error);
}

export async function attachInvoiceToSale(invoiceNumber: number, saleId: string): Promise<void> {
  const { data, error } = await db
    .from('invoices')
    .update({ sale_id: saleId })
    .eq('invoice_number', invoiceNumber)
    .eq('status', 'linked')
    .is('sale_id', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BadRequestError('La factura cambió mientras se registraba la venta. Intentá de nuevo.');
}

// Al rechazar una venta la factura vuelve a quedar libre: la venta corregida se registra con ella.
export async function unlinkInvoiceFromSale(saleId: string): Promise<string | null> {
  const { data, error } = await db
    .from('invoices')
    .update({ status: 'unlinked', sale_id: null })
    .eq('sale_id', saleId)
    .eq('status', 'linked')
    .select('invoice_number, invoice_code');
  if (error) throw error;
  const row = (data ?? [])[0] as { invoice_number: number; invoice_code: string | null } | undefined;
  return row ? row.invoice_code ?? formatInvoiceCode(row.invoice_number) : null;
}

export async function listInvoices(
  filters: { status?: string; sellerUid?: string } = {},
): Promise<Invoice[]> {
  let query = db.from('invoices').select(INVOICE_COLUMNS).order('invoice_number', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.sellerUid) query = query.eq('seller_uid', filters.sellerUid);

  const { data, error } = await query;
  if (error) throw error;
  const invoices = ((data ?? []) as unknown as InvoiceRow[]).map(toInvoice);

  // Quien canjeó cada factura: el vendedor de la orden que la usó, que puede no ser el asignado.
  const saleIds = [...new Set(invoices.map((inv) => inv.saleId).filter((id): id is string => !!id))];
  const sellerUidBySaleId = new Map<string, string | null>();
  if (saleIds.length > 0) {
    const { data: orders } = await db.from('orders').select('id, seller_uid').in('id', saleIds);
    for (const o of (orders ?? []) as { id: string; seller_uid: string | null }[]) {
      sellerUidBySaleId.set(o.id, o.seller_uid);
    }
  }

  // Segunda consulta en vez de embed: si PostgREST no tiene la FK en caché, el embed se lleva puesto
  // el listado entero. El nombre es secundario.
  const uids = [
    ...new Set([
      ...invoices.map((inv) => inv.sellerUid).filter((id): id is string => !!id),
      ...[...sellerUidBySaleId.values()].filter((id): id is string => !!id),
    ]),
  ];
  if (uids.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, name').in('id', uids);
    const namesByUid = new Map<string, string>();
    for (const p of (profiles ?? []) as { id: string; name: string | null }[]) {
      if (p.name?.trim()) namesByUid.set(p.id, p.name.trim());
    }
    for (const inv of invoices) {
      if (inv.sellerUid) inv.sellerName = namesByUid.get(inv.sellerUid) ?? null;
      const registeredByUid = inv.saleId ? sellerUidBySaleId.get(inv.saleId) : null;
      if (registeredByUid) inv.registeredByName = namesByUid.get(registeredByUid) ?? null;
    }
  }

  return invoices;
}

/** Vendedores para el selector de Caja. Incluye admin: también factura a su nombre. */
const INVOICE_SELLER_ROLES = ['admin', 'seller', 'global_admin'];

export async function listActiveSellers(): Promise<{ id: string; name: string }[]> {
  // El filtro de rol va en JS y no con `.overlaps`: el admin protegido recibe su rol del entorno y su
  // fila puede tener `roles: []`, así que quedaba afuera del selector.
  const { data, error } = await db
    .from('profiles')
    .select('id, name, email, roles, status, deleted_at')
    .is('deleted_at', null)
    .neq('status', 'disabled')
    .order('name');
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    email: string | null;
    name: string | null;
    roles: string[] | null;
  }[])
    .filter((p) => {
      const isProtected =
        !!config.protectedEmail && p.email?.toLowerCase() === config.protectedEmail;
      return isProtected || (p.roles ?? []).some((r) => INVOICE_SELLER_ROLES.includes(r));
    })
    .filter((p) => p.name?.trim())
    // Se colapsan los espacios internos: el HTML los colapsa al dibujar y el combobox no encontraba el nombre.
    .map((p) => ({ id: p.id, name: p.name!.trim().replace(/\s+/g, ' ') }));
}

/** Cajero y admin ven cualquiera; un vendedor solo la suya o una sin dueño, nunca la de otro vendedor. */
export interface InvoiceAccess {
  requesterUid: string;
  isPrivileged: boolean;
}

function canAccessInvoice(sellerUid: string | null, access: InvoiceAccess): boolean {
  return access.isPrivileged || sellerUid === null || sellerUid === access.requesterUid;
}

// Con sus líneas: el editor de ventas se precarga entero en vez de hacer tipear lo del ticket.
export async function findInvoiceByNumber(
  rawCode: string | number,
  access: InvoiceAccess,
): Promise<Invoice | null> {
  const invoiceNumber = parseInvoiceCode(rawCode);
  if (invoiceNumber === null) return null;

  const { data, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('invoice_number', invoiceNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const invoice = toInvoice(data as unknown as InvoiceRow);
  // Mismo 404 que "no existe": no le confirmamos a un vendedor que el código
  // es válido si es de otro vendedor.
  if (!canAccessInvoice(invoice.sellerUid ?? null, access)) return null;

  // El editor muestra a quién se le registrará la venta (registerSale impone el vendedor asignado).
  if (invoice.sellerUid) {
    const { data: profile } = await db
      .from('profiles')
      .select('name')
      .eq('id', invoice.sellerUid)
      .maybeSingle();
    invoice.sellerName = (profile as { name: string | null } | null)?.name?.trim() || null;
  }

  const { data: itemRows, error: itemsError } = await db
    .from('invoice_items')
    .select('sku, quantity, unit_price, line_total')
    .eq('invoice_id', invoice.id);
  if (itemsError) throw itemsError;

  invoice.items = ((itemRows ?? []) as unknown as Array<{
    sku: string | null;
    quantity: number;
    unit_price: number | null;
    line_total: number | null;
  }>).map((item) => ({
    // `sku` guarda el nombre del producto (ver createInvoice).
    productName: item.sku ?? '',
    quantity: item.quantity,
    unitPrice: item.unit_price ?? 0,
    lineTotal: item.line_total ?? 0,
  }));

  return invoice;
}

/**
 * Borra una factura `void` o `unlinked`. El número queda retirado. Una ligada no: la venta quedaría
 * apuntando a un número que no existe.
 */
export async function deleteInvoice(id: string): Promise<boolean> {
  const { data: existing, error: findError } = await db
    .from('invoices')
    .select('id, status, sale_id')
    .eq('id', id)
    .maybeSingle();
  if (findError) throw findError;
  if (!existing) return false;

  if (existing.status === 'linked' || existing.sale_id) {
    throw new BadRequestError(
      'Esta factura está vinculada a una venta. Anulá o editá la venta antes de descartarla.',
    );
  }

  // `invoice_items` cae solo por el `on delete cascade` de 0007.
  const { error } = await db.from('invoices').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function voidInvoice(
  id: string,
  reason: string,
  voidedBy: string | null,
  // Solo deleteSale anula una factura ligada: la venta se borra en el mismo paso.
  opts: { allowLinked?: boolean } = {},
): Promise<Invoice | null> {
  const { data: existing, error: findError } = await db
    .from('invoices')
    .select('id, status, sale_id')
    .eq('id', id)
    .maybeSingle();
  if (findError) throw findError;
  if (!existing) return null;

  if (existing.status === 'void') {
    throw new BadRequestError('Esta factura ya está anulada.');
  }
  if (existing.status === 'linked' && existing.sale_id && !opts.allowLinked) {
    throw new BadRequestError(
      'Esta factura está ligada a una venta. Rechazá la venta (si está pendiente) para liberarla, o eliminá la venta, antes de anularla.',
    );
  }

  const { data, error } = await db
    .from('invoices')
    .update({
      status: 'void',
      void_reason: reason,
      voided_by: voidedBy,
      voided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(INVOICE_COLUMNS)
    .single();
  if (error) throw error;
  return toInvoice(data as unknown as InvoiceRow);
}

// Corrección de los datos de cobro. Solo para facturas unlinked.
/**
 * Corrige una factura huérfana con sus líneas. Una ligada ya alimentó el snapshot de su venta.
 * El código de descuento no se reaplica (gastaría otro uso): se conserva el monto ya resuelto.
 */
export async function updateInvoice(
  id: string,
  input: {
    method?: string;
    deliveryFee?: number;
    customerName?: string;
    phone?: string;
    deliveryName?: string;
    issuedAt?: string;
    items?: { productName: string; quantity: number; unitPrice: number }[];
  },
): Promise<Invoice | null> {
  const { data: existing, error: findError } = await db
    .from('invoices')
    .select('id, status, subtotal, discount, delivery_fee, created_at')
    .eq('id', id)
    .maybeSingle();
  if (findError) throw findError;
  if (!existing) return null;

  if (existing.status !== 'unlinked') {
    throw new BadRequestError('Solo se pueden editar los datos de facturas huérfanas (unlinked).');
  }

  const patch: Record<string, unknown> = {};
  if (input.method !== undefined) patch.method = input.method;
  // `|| null` para que borrar el campo en el formulario lo deje vacío de verdad
  // y no guarde una cadena en blanco que después se imprime como un renglón mudo.
  if (input.customerName !== undefined) patch.customer_name = input.customerName.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone.trim() || null;
  if (input.deliveryName !== undefined) patch.delivery_name = input.deliveryName.trim() || null;

  if (input.issuedAt !== undefined) {
    const issuedDate = new Date(input.issuedAt);
    if (isNaN(issuedDate.getTime())) {
      throw new BadRequestError('Fecha de factura inválida.');
    }
    if (issuedDate.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestError('La fecha de factura no puede ser futura.');
    }
    patch.created_at = issuedDate.toISOString();
  }

  // Las líneas se reemplazan enteras: no tienen identidad estable en el formulario para hacer un diff.
  let subtotal = existing.subtotal ?? 0;
  if (input.items) {
    subtotal = round(
      input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
      2,
    );

    const { error: delError } = await db.from('invoice_items').delete().eq('invoice_id', id);
    if (delError) throw delError;

    const itemCreatedAt = (patch.created_at as string) || existing.created_at;

    const { error: insError } = await db.from('invoice_items').insert(
      input.items.map((it) => ({
        invoice_id: id,
        sku: it.productName,
        quantity: it.quantity,
        unit_price: round(it.unitPrice, 2),
        line_total: round(it.quantity * it.unitPrice, 2),
        ...(itemCreatedAt ? { created_at: itemCreatedAt } : {}),
      })),
    );
    if (insError) throw insError;

    patch.subtotal = subtotal;
  } else if (patch.created_at) {
    // Si no cambiaron las líneas pero sí la fecha, sincronizar created_at en invoice_items
    await db.from('invoice_items').update({ created_at: patch.created_at }).eq('invoice_id', id);
  }

  // El total se recalcula si cambió CUALQUIERA de sus tres componentes.
  if (input.items || input.deliveryFee !== undefined) {
    const deliveryFee =
      input.deliveryFee !== undefined ? round(input.deliveryFee, 2) : (existing.delivery_fee ?? 0);
    patch.delivery_fee = deliveryFee;
    // El descuento se acota al subtotal nuevo: si se borraron líneas, un
    // descuento fijo mayor al subtotal dejaría el total en negativo.
    const discount = Math.min(existing.discount ?? 0, subtotal);
    patch.discount = discount;
    patch.total = round(subtotal - discount + deliveryFee, 2);
  }

  if (Object.keys(patch).length === 0) {
    const { data, error } = await db.from('invoices').select(INVOICE_COLUMNS).eq('id', id).single();
    if (error) throw error;
    return toInvoice(data as unknown as InvoiceRow);
  }

  const { data, error } = await db
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select(INVOICE_COLUMNS)
    .single();
  if (error) throw error;
  return toInvoice(data as unknown as InvoiceRow);
}

export interface TicketData {
  /** Código impreso en el ticket: `GS-PR-12`. */
  ticketNumber: string;
  createdAt: string;
  customer: {
    name: string;
    phone?: string;
  };
  sellerName?: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  deliveryName?: string;
  total: number;
  method: string;
}

export async function getInvoiceTicket(invoiceId: string, access: InvoiceAccess): Promise<TicketData | null> {
  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .select('id, invoice_number, invoice_code, method, delivery_fee, total, created_at, sale_id, customer_name, phone, subtotal, discount, delivery_name, seller_uid')
    .eq('id', invoiceId)
    .maybeSingle();
  if (invoiceError) throw invoiceError;
  if (!invoice) return null;
  // Mismo 404 que "no existe": ver la nota de canAccessInvoice.
  if (!canAccessInvoice(invoice.seller_uid, access)) return null;

  const { data: invoiceItems, error: itemsError } = await db
    .from('invoice_items')
    .select('sku, quantity, unit_price, line_total')
    .eq('invoice_id', invoice.id);
  if (itemsError) throw itemsError;

  let sellerName = 'Caja'; // Por defecto, porque nace unlinked

  // Si ya está ligada, el vendedor "real" es quien registró la venta. Si no,
  // pero Caja igual le asignó un vendedor al emitirla, mostramos ese.
  const sellerUidForName = invoice.sale_id
    ? (
        await db.from('orders').select('seller_uid').eq('id', invoice.sale_id).maybeSingle()
      ).data?.seller_uid ?? null
    : invoice.seller_uid;

  // Solo el nombre de `profiles`: en el ticket no tiene que salir un correo.
  if (sellerUidForName) {
    const { data: profile } = await db
      .from('profiles')
      .select('name')
      .eq('id', sellerUidForName)
      .maybeSingle();
    if (profile?.name?.trim()) sellerName = profile.name.trim();
  }

  const items = (invoiceItems || []).map((item) => ({
    productName: item.sku || 'Producto',
    quantity: item.quantity,
    unitPrice: item.unit_price ?? 0,
    lineTotal: item.line_total ?? 0,
  }));

  return {
    ticketNumber: invoice.invoice_code ?? formatInvoiceCode(invoice.invoice_number),
    createdAt: invoice.created_at,
    customer: {
      name: invoice.customer_name || 'Cliente General',
      phone: invoice.phone || undefined,
    },
    sellerName,
    items,
    subtotal: invoice.subtotal || 0,
    discount: invoice.discount || 0,
    deliveryFee: invoice.delivery_fee || 0,
    deliveryName: invoice.delivery_name || undefined,
    total: invoice.total || 0,
    method: invoice.method || 'efectivo',
  };
}
