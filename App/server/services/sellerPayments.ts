// Pago de comisiones a vendedores y su cuenta corriente.
//
// Portado de v1 (`server/routes/sales/payments.js` + `services/balance.js`),
// que en v2 no tenía equivalente: `order_status` ya contemplaba 'paid' pero
// nada lo ponía.
//
// La regla de fondo: un lote de pago es INMUTABLE. Registra lo que se entregó,
// y no se reescribe nunca. Si después se edita una venta ya pagada, la
// diferencia de comisión se anota como un AJUSTE y se salda en el próximo
// corte — así el histórico sigue cuadrando con lo que realmente salió de caja.
//
// Diferencias con v1, deliberadas:
//   · el comprobante llega como URL ya subida a `POST /api/upload`, en vez de
//     multipart en esta ruta: v2 ya centraliza las subidas ahí.
//   · no se manda correo. v2 no tiene servicio de email (v1 usaba
//     `services/email.js`); se devuelve el link de WhatsApp y avisa el humano.
import { db } from '../supabase';
import { round } from './finance';
import { BadRequestError } from '../utils/httpError';

// Nombre de respaldo cuando el vendedor no tiene uno cargado. `split` puede
// devolver un arreglo vacío en teoría, así que el email entero es el último
// recurso — nunca `undefined`, que dejaría la fila sin etiqueta en el panel.
function defaultSellerName(email: string): string {
  return email.split('@')[0] || email;
}

// ============================================================================
// ── Ajustes (cuenta corriente) ──
// ============================================================================

export interface CommissionAdjustment {
  id: string;
  sellerEmail: string;
  sellerName: string;
  orderId: string | null;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface SellerBalance {
  sellerEmail: string;
  sellerName: string;
  /** >0 la tienda le debe · <0 el vendedor debe devolver */
  balance: number;
  count: number;
}

// Anota la diferencia de comisión al editar una venta YA pagada. Devuelve null
// si el delta redondeado es 0: un ajuste de cero ensucia el saldo sin aportar.
export async function recordCommissionAdjustment(input: {
  sellerEmail: string;
  sellerName?: string | null;
  sellerUid?: string | null;
  orderId?: string | null;
  comisionVieja: number;
  comisionNueva: number;
  reason?: string;
  createdBy?: string | null;
}): Promise<CommissionAdjustment | null> {
  const amount = round((input.comisionNueva || 0) - (input.comisionVieja || 0), 2);
  if (amount === 0) return null;

  const { data, error } = await db
    .from('commission_adjustments')
    .insert({
      seller_uid: input.sellerUid ?? null,
      seller_email: input.sellerEmail,
      seller_name: input.sellerName ?? defaultSellerName(input.sellerEmail),
      order_id: input.orderId ?? null,
      comision_vieja: round(input.comisionVieja || 0, 2),
      comision_nueva: round(input.comisionNueva || 0, 2),
      amount,
      reason: input.reason ?? '',
      created_by: input.createdBy ?? null,
      settled: false,
    })
    .select('id, seller_email, seller_name, order_id, amount, reason, created_at')
    .single();

  if (error) throw error;
  return {
    id: data.id as string,
    sellerEmail: data.seller_email as string,
    sellerName: (data.seller_name as string) ?? '',
    orderId: (data.order_id as string) ?? null,
    amount: Number(data.amount),
    reason: (data.reason as string) ?? '',
    createdAt: data.created_at as string,
  };
}

interface PendingRow {
  id: string;
  seller_email: string | null;
  seller_name: string | null;
  amount: number | null;
}

async function fetchPending(sellerEmail?: string): Promise<PendingRow[]> {
  let query = db
    .from('commission_adjustments')
    .select('id, seller_email, seller_name, amount')
    .eq('settled', false);
  if (sellerEmail) query = query.eq('seller_email', sellerEmail);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PendingRow[];
}

export async function getPendingBalance(
  sellerEmail: string,
): Promise<{ balance: number; adjustmentIds: string[]; sellerName: string }> {
  const rows = await fetchPending(sellerEmail);
  const balance = round(
    rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    2,
  );
  return {
    balance,
    adjustmentIds: rows.map((row) => row.id),
    sellerName: rows[0]?.seller_name ?? defaultSellerName(sellerEmail),
  };
}

// Saldos de TODOS los vendedores. Los que dan exactamente 0 se omiten: hay
// ajustes que se cancelan entre sí y mostrarlos como "saldo pendiente: 0"
// invita a emitir un pago vacío.
export async function listPendingBalances(): Promise<SellerBalance[]> {
  const rows = await fetchPending();
  const map = new Map<string, SellerBalance>();

  for (const row of rows) {
    const email = row.seller_email;
    if (!email) continue;
    const current = map.get(email) ?? {
      sellerEmail: email,
      sellerName: row.seller_name ?? defaultSellerName(email),
      balance: 0,
      count: 0,
    };
    current.balance += Number(row.amount) || 0;
    current.count += 1;
    map.set(email, current);
  }

  return [...map.values()]
    .map((entry) => ({ ...entry, balance: round(entry.balance, 2) }))
    .filter((entry) => entry.balance !== 0)
    .sort((a, b) => b.balance - a.balance);
}

async function settleAdjustments(ids: string[], paymentId: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await db
    .from('commission_adjustments')
    .update({ settled: true, settled_payment_id: paymentId, settled_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

// ============================================================================
// ── Lotes de pago ──
// ============================================================================

export interface CommissionPayment {
  id: string;
  sellerEmail: string;
  sellerName: string;
  orderIds: string[];
  grossComision: number;
  saldoAplicado: number;
  totalComision: number;
  isSettlement: boolean;
  paymentMethod: string;
  receiptUrl: string | null;
  noReceiptComment: string | null;
  createdAt: string;
}

const PAYMENT_COLUMNS =
  'id, seller_email, seller_name, order_ids, gross_comision, saldo_aplicado, total_comision, is_settlement, payment_method, receipt_url, no_receipt_comment, created_at';

interface PaymentRow {
  id: string;
  seller_email: string;
  seller_name: string | null;
  order_ids: string[] | null;
  gross_comision: number | null;
  saldo_aplicado: number | null;
  total_comision: number | null;
  is_settlement: boolean;
  payment_method: string;
  receipt_url: string | null;
  no_receipt_comment: string | null;
  created_at: string;
}

function toPayment(row: PaymentRow): CommissionPayment {
  return {
    id: row.id,
    sellerEmail: row.seller_email,
    sellerName: row.seller_name ?? defaultSellerName(row.seller_email),
    orderIds: row.order_ids ?? [],
    grossComision: Number(row.gross_comision) || 0,
    saldoAplicado: Number(row.saldo_aplicado) || 0,
    totalComision: Number(row.total_comision) || 0,
    isSettlement: row.is_settlement,
    paymentMethod: row.payment_method,
    receiptUrl: row.receipt_url,
    noReceiptComment: row.no_receipt_comment,
    createdAt: row.created_at,
  };
}

export async function listCommissionPayments(sellerEmail?: string): Promise<CommissionPayment[]> {
  let query = db.from('commission_payments').select(PAYMENT_COLUMNS).order('created_at', { ascending: false });
  if (sellerEmail) query = query.eq('seller_email', sellerEmail);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as PaymentRow[]).map(toPayment);
}

export interface PayCommissionInput {
  sellerEmail: string;
  orderIds: string[];
  paymentMethod: string;
  receiptUrl?: string | null;
  noReceiptComment?: string | null;
}

// Paga un conjunto de ventas aprobadas de un vendedor.
//
// Las ventas se leen y se validan ANTES de emitir el lote: solo se pagan las
// que están 'approved' y son de ese vendedor. Sin ese filtro, un id repetido o
// de otro vendedor inflaría el monto del lote.
export async function payCommissions(
  input: PayCommissionInput,
  createdBy: string | null,
): Promise<CommissionPayment> {
  if (!input.receiptUrl && !input.noReceiptComment) {
    throw new BadRequestError('Subí el comprobante o justificá por qué no lo hay.');
  }

  const orderIds = [...new Set(input.orderIds)];
  if (orderIds.length === 0) throw new BadRequestError('Elegí al menos una venta para pagar.');

  const { data: orderRows, error: ordersError } = await db
    .from('orders')
    .select('id, seller_uid, seller_email, status')
    .in('id', orderIds)
    .eq('seller_email', input.sellerEmail)
    .eq('status', 'approved');
  if (ordersError) throw ordersError;

  const orders = (orderRows ?? []) as unknown as {
    id: string;
    seller_uid: string | null;
    seller_email: string;
    status: string;
  }[];

  if (orders.length === 0) {
    throw new BadRequestError('Ninguna de esas ventas está aprobada y pendiente de pago para este vendedor.');
  }

  // La comisión sale del snapshot congelado en `order_items` al aprobar, NO se
  // recalcula: recalcular acá pagaría un monto distinto del que el vendedor vio
  // aprobado si la config financiera cambió en el medio (doc 11, regla de oro).
  const payableIds = orders.map((o) => o.id);
  const { data: itemRows, error: itemsError } = await db
    .from('order_items')
    .select('order_id, comision')
    .in('order_id', payableIds);
  if (itemsError) throw itemsError;

  const grossComision = round(
    ((itemRows ?? []) as unknown as { comision: number | null }[]).reduce(
      (sum, item) => sum + (Number(item.comision) || 0),
      0,
    ),
    2,
  );

  // El saldo pendiente se arrastra a este lote: si el vendedor tenía un ajuste
  // a favor se le suma, y si debía se le descuenta.
  const { balance, adjustmentIds, sellerName } = await getPendingBalance(input.sellerEmail);
  const totalComision = round(grossComision + balance, 2);

  const { data: payment, error: paymentError } = await db
    .from('commission_payments')
    .insert({
      seller_uid: orders[0]?.seller_uid ?? null,
      seller_email: input.sellerEmail,
      seller_name: sellerName,
      order_ids: payableIds,
      gross_comision: grossComision,
      saldo_aplicado: balance,
      total_comision: totalComision,
      is_settlement: false,
      payment_method: input.paymentMethod,
      receipt_url: input.receiptUrl ?? null,
      no_receipt_comment: input.noReceiptComment ?? null,
      created_by: createdBy,
    })
    .select(PAYMENT_COLUMNS)
    .single();
  if (paymentError) throw paymentError;

  const paymentId = (payment as unknown as PaymentRow).id;

  // El lote ya existe: si algo falla de acá en adelante queda un pago emitido
  // con ventas todavía en 'approved'. Es el lado seguro del error — se ve en el
  // panel y se corrige, en vez de marcar ventas como pagadas sin respaldo.
  const { error: statusError } = await db
    .from('orders')
    .update({ status: 'paid' })
    .in('id', payableIds);
  if (statusError) throw statusError;

  await settleAdjustments(adjustmentIds, paymentId);

  return toPayment(payment as unknown as PaymentRow);
}

// Salda el saldo suelto de un vendedor, sin esperar al próximo corte de ventas.
export async function settleSellerBalance(
  input: {
    sellerEmail: string;
    paymentMethod: string;
    receiptUrl?: string | null;
    noReceiptComment?: string | null;
  },
  createdBy: string | null,
): Promise<CommissionPayment> {
  if (!input.receiptUrl && !input.noReceiptComment) {
    throw new BadRequestError('Subí el comprobante o justificá por qué no lo hay.');
  }

  const { balance, adjustmentIds, sellerName } = await getPendingBalance(input.sellerEmail);
  if (balance === 0 || adjustmentIds.length === 0) {
    throw new BadRequestError('Este vendedor no tiene saldo pendiente.');
  }

  const { data: payment, error } = await db
    .from('commission_payments')
    .insert({
      seller_email: input.sellerEmail,
      seller_name: sellerName,
      order_ids: [],
      gross_comision: 0,
      saldo_aplicado: balance,
      total_comision: balance,
      is_settlement: true,
      payment_method: input.paymentMethod,
      receipt_url: input.receiptUrl ?? null,
      no_receipt_comment: input.noReceiptComment ?? null,
      created_by: createdBy,
    })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) throw error;

  await settleAdjustments(adjustmentIds, (payment as unknown as PaymentRow).id);
  return toPayment(payment as unknown as PaymentRow);
}

// ============================================================================
// ── Portal del vendedor ──
// ============================================================================

export interface SellerSummary {
  pendingApproval: { count: number; comision: number };
  approvedUnpaid: { count: number; comision: number };
  paid: { count: number; comision: number };
  balance: number;
}

// Resumen propio del vendedor: cuánto tiene por aprobar, aprobado sin cobrar y
// ya cobrado. Es la vista que el vendedor abre para saber qué le van a pagar.
export async function getSellerSummary(sellerEmail: string): Promise<SellerSummary> {
  const { data: orderRows, error } = await db
    .from('orders')
    .select('id, status')
    .eq('seller_email', sellerEmail)
    .in('status', ['pending_approval', 'approved', 'paid']);
  if (error) throw error;

  const orders = (orderRows ?? []) as unknown as { id: string; status: string }[];
  const byId = new Map(orders.map((o) => [o.id, o.status]));

  const comisionByOrder = new Map<string, number>();
  if (orders.length > 0) {
    const { data: itemRows, error: itemsError } = await db
      .from('order_items')
      .select('order_id, comision')
      .in('order_id', [...byId.keys()]);
    if (itemsError) throw itemsError;

    for (const item of (itemRows ?? []) as unknown as {
      order_id: string;
      comision: number | null;
    }[]) {
      comisionByOrder.set(
        item.order_id,
        (comisionByOrder.get(item.order_id) ?? 0) + (Number(item.comision) || 0),
      );
    }
  }

  const bucket = { pending_approval: { count: 0, comision: 0 }, approved: { count: 0, comision: 0 }, paid: { count: 0, comision: 0 } };
  for (const order of orders) {
    const slot = bucket[order.status as keyof typeof bucket];
    if (!slot) continue;
    slot.count += 1;
    slot.comision += comisionByOrder.get(order.id) ?? 0;
  }

  const { balance } = await getPendingBalance(sellerEmail);

  return {
    pendingApproval: { count: bucket.pending_approval.count, comision: round(bucket.pending_approval.comision, 2) },
    approvedUnpaid: { count: bucket.approved.count, comision: round(bucket.approved.comision, 2) },
    paid: { count: bucket.paid.count, comision: round(bucket.paid.comision, 2) },
    balance,
  };
}
