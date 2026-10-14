// Facturas de proveedor ligadas a las órdenes de compra.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import type { PurchaseInvoiceInput } from '../../../shared/schemas';
import { escapeLike, isUniqueViolation, requireOrdersTable } from './purchase-order-common';

// ============================================================================
// ── Facturas ──
// ============================================================================

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  fileUrl: string | null;
  totalUsd: number | null;
  notes: string;
  createdAt: string;
  /** Órdenes que cubre (una factura puede cubrir varias). */
  orders: { id: string; orderNumber: string }[];
  /** Suma de los productos de TODAS sus órdenes: costo + impuesto (USD). */
  linesTotalUsd: number;
  /** El total no coincide con la suma (mientras se cargan productos, falta). */
  mismatch: boolean;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  file_url: string | null;
  total_usd: number | string | null;
  notes: string | null;
  created_at: string;
}

export const INVOICE_COLUMNS = 'id, invoice_number, file_url, total_usd, notes, created_at';

function invoiceRow(input: PurchaseInvoiceInput) {
  return {
    invoice_number: input.invoiceNumber.trim(),
    file_url: input.fileUrl ?? null,
    total_usd: input.totalUsd ?? null,
    notes: input.notes?.trim() ?? '',
  };
}

export async function assertInvoiceNumberFree(invoiceNumber: string, excludeId?: string): Promise<void> {
  const number = invoiceNumber.trim();
  if (!number) return;
  let query = db.from('purchase_invoices').select('id').ilike('invoice_number', escapeLike(number));
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (data && data.length > 0) {
    throw new BadRequestError(`La factura ${number} ya está cargada: elegila de la lista en vez de subirla otra vez.`);
  }
}

/**
 * La factura de una orden: una ya cargada (`invoiceId`, quizás de otra orden de
 * la misma compra) o una nueva. `null` = sin factura; `undefined` = no se toca.
 */
export async function resolveInvoiceId(
  invoiceId: string | null | undefined,
  newInvoice: PurchaseInvoiceInput | undefined,
  authorUid: string | undefined,
): Promise<string | null | undefined> {
  if (newInvoice) {
    await assertInvoiceNumberFree(newInvoice.invoiceNumber);
    const { data, error } = await db
      .from('purchase_invoices')
      .insert({ ...invoiceRow(newInvoice), created_by: authorUid ?? null })
      .select('id')
      .single();
    if (isUniqueViolation(error)) {
      throw new BadRequestError(`La factura ${newInvoice.invoiceNumber.trim()} ya está cargada: elegila de la lista.`);
    }
    if (error) throw error;
    return data.id as string;
  }
  if (invoiceId) {
    const { data, error } = await db.from('purchase_invoices').select('id').eq('id', invoiceId).maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('La factura elegida ya no existe.');
    return invoiceId;
  }
  return invoiceId;
}

/** Una factura que ya no cubre ninguna orden se borra (no aparece en la lista). */
export async function dropInvoiceIfUnused(invoiceId: string | null | undefined): Promise<void> {
  if (!invoiceId) return;
  const { count, error } = await db
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId);
  if (error) throw error;
  if ((count ?? 0) === 0) await db.from('purchase_invoices').delete().eq('id', invoiceId);
}

/** Corrige número, archivo o total de una factura (vale para todas sus órdenes). */
export async function updatePurchaseInvoice(
  id: string,
  input: PurchaseInvoiceInput,
  authorUid?: string,
): Promise<boolean> {
  await requireOrdersTable();
  const { data: existing, error: fetchError } = await db
    .from('purchase_invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;
  await assertInvoiceNumberFree(input.invoiceNumber, id);
  const { error } = await db.from('purchase_invoices').update(invoiceRow(input)).eq('id', id);
  if (isUniqueViolation(error)) throw new BadRequestError(`La factura ${input.invoiceNumber.trim()} ya está cargada.`);
  if (error) throw error;
  await db.from('audit_logs').insert({
    entity: 'purchase_invoices',
    entity_id: id,
    action: 'update',
    reason: 'Órdenes de compra desde panel',
    author_uid: authorUid ?? null,
    before: existing,
    after: invoiceRow(input),
  });
  return true;
}
