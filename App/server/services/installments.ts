// Cuotas (MVP Hito 3, doc 09 ítem 63): agenda el cobro de una venta YA
// aprobada (server/services/sales.ts) — modelo delgado, igual que
// invoice.ts. `installments.order_id` envuelve un `orders` existente; no hay
// líneas/FIFO/comisión propios acá, eso ya lo congeló sales.ts. `payments`
// es una tabla hija real (no un array embebido): amountPaid/amountPending se
// calculan sumándola, no se guardan desnormalizados.
//
// Reciclaje de v1 (server/services/installments.js): `createInstallment`
// (arma sus propias líneas, corre FIFO y comisión) se descarta — acá el plan
// solo agenda el cobro de una venta que ya pasó por todo eso. `registerPayment`
// y `cancelInstallment` se reciclan case tal cual (misma regla: no se cancela
// un plan con pagos ya registrados). `nextPaymentDate` por cuota no existe en
// el schema v2 (solo `first_due`): `getPendingInstallments` ordena por esa
// fecha en vez de una "próxima cuota" calculada.
import { db } from '../supabase';
import { round } from './finance';
import { firstOfEmbed } from '../utils/firstOfEmbed';
import { BadRequestError } from '../utils/httpError';
import type { CreateInstallmentPlanInput, RegisterInstallmentPaymentInput } from '../../shared/schemas';

export interface InstallmentPayment {
  id: string;
  amount: number;
  method: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface InstallmentPlan {
  id: string;
  orderId: string;
  // De la orden vinculada (doc 03: orders.phone/seller_email) — sin esto la
  // lista de planes solo mostraría un UUID, nada de a quién le vendieron.
  phone: string | null;
  sellerEmail: string | null;
  total: number;
  numCuotas: number;
  firstDue: string;
  status: string;
  amountPaid: number;
  amountPending: number;
  payments: InstallmentPayment[];
  createdAt: string;
  updatedAt: string;
}

interface PaymentEmbedRow {
  id: string;
  amount: number | null;
  method: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
}

interface OrderEmbed {
  phone: string | null;
  seller_email: string | null;
}

interface InstallmentRow {
  id: string;
  order_id: string;
  total: number | null;
  num_cuotas: number;
  first_due: string;
  status: string;
  created_at: string;
  updated_at: string;
  // payments.installment_id → installments.id es many-to-one desde payments,
  // así que embebido desde acá siempre es un array (a diferencia de
  // orders, many-to-one desde installments, que sí necesita
  // firstOfEmbed — ver utils/firstOfEmbed.ts).
  payments: PaymentEmbedRow[];
  orders: OrderEmbed | OrderEmbed[] | null;
}

const INSTALLMENT_COLUMNS =
  'id, order_id, total, num_cuotas, first_due, status, created_at, updated_at, payments(id, amount, method, paid_at, note, created_at), orders(phone, seller_email)';

function toPayment(row: PaymentEmbedRow): InstallmentPayment {
  return {
    id: row.id,
    amount: row.amount ?? 0,
    method: row.method,
    paidAt: row.paid_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

function toInstallmentPlan(row: InstallmentRow): InstallmentPlan {
  const payments = (row.payments ?? [])
    .map(toPayment)
    .sort((a, b) => (a.paidAt ?? a.createdAt).localeCompare(b.paidAt ?? b.createdAt));
  const amountPaid = round(
    payments.reduce((sum, p) => sum + p.amount, 0),
    2,
  );
  const total = row.total ?? 0;
  const amountPending = round(Math.max(0, total - amountPaid), 2);
  const order = firstOfEmbed(row.orders);

  return {
    id: row.id,
    orderId: row.order_id,
    phone: order?.phone ?? null,
    sellerEmail: order?.seller_email ?? null,
    total,
    numCuotas: row.num_cuotas,
    firstDue: row.first_due,
    status: row.status,
    amountPaid,
    amountPending,
    payments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getInstallmentPlan(id: string): Promise<InstallmentPlan | null> {
  const { data, error } = await db.from('installments').select(INSTALLMENT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toInstallmentPlan(data as unknown as InstallmentRow) : null;
}

export async function listInstallments(status?: string): Promise<InstallmentPlan[]> {
  let query = db.from('installments').select(INSTALLMENT_COLUMNS).order('first_due', { ascending: true });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as InstallmentRow[]).map(toInstallmentPlan);
}

export async function createInstallmentPlan(input: CreateInstallmentPlanInput): Promise<InstallmentPlan> {
  // Independientes entre sí (una lee orders, la otra installments): en paralelo.
  const [orderResult, existingResult] = await Promise.all([
    db.from('orders').select('id, status, total').eq('id', input.orderId).maybeSingle(),
    db.from('installments').select('id').eq('order_id', input.orderId).maybeSingle(),
  ]);
  if (orderResult.error) throw orderResult.error;
  if (existingResult.error) throw existingResult.error;

  const order = orderResult.data;
  if (!order) {
    throw new BadRequestError('Venta no encontrada.');
  }
  if (order.status !== 'approved') {
    throw new BadRequestError('Solo se puede poner en cuotas una venta aprobada.');
  }
  if (existingResult.data) {
    throw new BadRequestError('Esta venta ya tiene un plan de cuotas.');
  }

  const { data: created, error: insertError } = await db
    .from('installments')
    .insert({
      order_id: input.orderId,
      total: order.total,
      num_cuotas: input.numCuotas,
      first_due: input.firstDue,
      status: 'active',
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  const plan = await getInstallmentPlan(created.id);
  if (!plan) throw new BadRequestError('El plan se creó pero no se pudo leer de vuelta.');
  return plan;
}

export async function registerInstallmentPayment(
  installmentId: string,
  input: RegisterInstallmentPaymentInput,
): Promise<{ amountPaid: number; amountPending: number; completed: boolean } | null> {
  // Lectura angosta: acá solo hace falta el status, no el plan completo
  // (pagos + orden embebidos) — eso se trae una sola vez más abajo, después
  // de insertar, para calcular el resultado real.
  const { data: existing, error: existingError } = await db
    .from('installments')
    .select('status')
    .eq('id', installmentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return null;
  if (existing.status === 'completed') {
    throw new BadRequestError('Este plan de cuotas ya está completamente pagado.');
  }

  const { error: paymentError } = await db.from('payments').insert({
    installment_id: installmentId,
    amount: input.amount,
    method: input.method ?? null,
    paid_at: new Date().toISOString(),
    note: input.note ?? null,
  });
  if (paymentError) throw paymentError;

  const updated = await getInstallmentPlan(installmentId);
  if (!updated) throw new BadRequestError('El pago se registró pero no se pudo releer el plan.');

  const completed = updated.amountPending <= 0;
  if (completed && updated.status !== 'completed') {
    const { error: statusError } = await db
      .from('installments')
      .update({ status: 'completed' })
      .eq('id', installmentId);
    if (statusError) throw statusError;
  }

  return { amountPaid: updated.amountPaid, amountPending: updated.amountPending, completed };
}

// Reciclado tal cual de v1: no se cancela un plan con pagos ya registrados.
export async function cancelInstallmentPlan(id: string): Promise<boolean> {
  const plan = await getInstallmentPlan(id);
  if (!plan) return false;
  if (plan.payments.length > 0) {
    throw new BadRequestError('No se puede cancelar un plan de cuotas con pagos registrados.');
  }

  const { error } = await db.from('installments').delete().eq('id', id);
  if (error) throw error;
  return true;
}
