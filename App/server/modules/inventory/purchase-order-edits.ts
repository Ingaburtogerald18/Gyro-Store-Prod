// Alta, edición, líneas y borrado de órdenes de compra.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import { isMissingColumn } from '../orders/order-persistence';
import { nameForVariant, type CatalogLink } from './inventory-links';
import { nextPurchaseCodes } from './inventory';
import { updatePurchase } from './inventory-edits';
import { dropCreatedProducts, resolveTemplateLink } from '../catalog/template-products';
import type { AddPurchaseOrderLinesInput, NewPurchaseOrderInput, PurchaseOrderLineInput, UpdatePurchaseOrderInput } from '../../../shared/schemas';
import { isUniqueViolation, normalizeOrderNumber, requireOrdersTable } from './purchase-order-common';
import { assertOrderNumberFree, getPurchaseOrder, type PurchaseOrder } from './purchase-orders';
import { assertInvoiceNumberFree, dropInvoiceIfUnused, resolveInvoiceId } from './purchase-invoices';
import { resolveSupplierId } from './suppliers';

// ── Líneas ──

interface PreparedLine {
  productName: string;
  category: string | null;
  quantity: number;
  costUnit: number;
  taxUnit: number;
  link: CatalogLink | null;
}

/**
 * Resuelve cada línea contra su plantilla (crea el producto del catálogo, sin publicar) y le da
 * el nombre de los lotes de su variante. Si algo falla, borra los productos que creó.
 */
async function prepareLines(
  lines: PurchaseOrderLineInput[],
  taxUnit: number,
): Promise<{ prepared: PreparedLine[]; createdProductIds: string[] }> {
  const prepared: PreparedLine[] = [];
  const createdProductIds: string[] = [];
  try {
    for (const line of lines) {
      const { link, created } = await resolveTemplateLink(line);
      if (created) createdProductIds.push(link.catalogItemId);
      const named = await nameForVariant(link);
      prepared.push({
        productName: named.productName,
        category: named.categoryId,
        quantity: line.quantity,
        costUnit: line.costUnit,
        taxUnit,
        link,
      });
    }
  } catch (err) {
    await dropCreatedProducts(createdProductIds);
    throw err;
  }
  return { prepared, createdProductIds };
}

/** Códigos GS-IN correlativos: si otra compra tomó los mismos al mismo tiempo, se piden de nuevo. */
async function insertLines(
  order: { id: string; orderNumber: string; purchaseDate: string },
  lines: PreparedLine[],
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const codes = await nextPurchaseCodes(lines.length);
    const rows = lines.map((line, i) => ({
      code: codes[i],
      lot: order.orderNumber,
      order_id: order.id,
      product_name: line.productName,
      category: line.category,
      purchase_date: order.purchaseDate,
      quantity: line.quantity,
      costo_china_usd: line.costUnit,
      impuesto_unit_usd: line.taxUnit,
      status: 'china',
      catalog_item_id: line.link?.catalogItemId ?? null,
      variant_key: line.link ? line.link.variantKey : null,
    }));

    let { error } = await db.from('purchases').insert(rows);
    // Si faltan las columnas del vínculo con el catálogo, las líneas se guardan igual con el nombre.
    if (isMissingColumn(error)) {
      const plain = rows.map(({ catalog_item_id: _c, variant_key: _v, ...rest }) => rest);
      ({ error } = await db.from('purchases').insert(plain));
    }
    if (isUniqueViolation(error)) continue;
    if (error) throw error;
    return;
  }
  throw new BadRequestError('No se pudieron asignar los códigos de las líneas. Probá de nuevo.');
}

export async function audit(entityId: string, action: string, authorUid: string | undefined, before: unknown, after: unknown) {
  await db.from('audit_logs').insert({
    entity: 'purchase_orders',
    entity_id: entityId,
    action,
    reason: 'Órdenes de compra desde panel',
    author_uid: authorUid ?? null,
    before: before ?? null,
    after: after ?? null,
  });
}

export async function createPurchaseOrder(input: NewPurchaseOrderInput, authorUid?: string): Promise<PurchaseOrder> {
  await requireOrdersTable();
  const orderNumber = normalizeOrderNumber(input.orderNumber);
  await assertOrderNumberFree(orderNumber);
  if (input.newInvoice) await assertInvoiceNumberFree(input.newInvoice.invoiceNumber);
  const { prepared, createdProductIds } = await prepareLines(input.lines, input.taxUnit);
  try {
    return await insertOrder(input, orderNumber, prepared, authorUid);
  } catch (err) {
    await dropCreatedProducts(createdProductIds);
    throw err;
  }
}

async function insertOrder(
  input: NewPurchaseOrderInput,
  orderNumber: string,
  prepared: PreparedLine[],
  authorUid?: string,
): Promise<PurchaseOrder> {
  const supplierId = await resolveSupplierId(input.supplierId, input.newSupplier);
  const invoiceId = await resolveInvoiceId(input.invoiceId, input.newInvoice, authorUid);

  const { data: order, error } = await db
    .from('purchase_orders')
    .insert({
      order_number: orderNumber,
      purchase_date: input.purchaseDate,
      supplier_id: supplierId ?? null,
      invoice_id: invoiceId ?? null,
      package_photos: input.packagePhotos ?? [],
      notes: input.notes ?? '',
      created_by: authorUid ?? null,
    })
    .select('id')
    .single();
  if (error) {
    // Una factura nueva que no llegó a tener orden no queda suelta.
    await dropInvoiceIfUnused(input.newInvoice ? invoiceId : null);
    if (isUniqueViolation(error)) {
      throw new BadRequestError(`La orden ${orderNumber} ya está registrada: elegila para agregarle el producto.`);
    }
    throw error;
  }

  try {
    await insertLines({ id: order.id as string, orderNumber, purchaseDate: input.purchaseDate }, prepared);
  } catch (err) {
    // Sin líneas la orden no sirve: se borra para que se pueda volver a cargar.
    await db.from('purchase_orders').delete().eq('id', order.id);
    await dropInvoiceIfUnused(input.newInvoice ? invoiceId : null);
    throw err;
  }

  const created = await getPurchaseOrder(order.id as string);
  if (!created) throw new Error('La orden se creó pero no se pudo leer de vuelta.');
  await audit(created.id, 'create', authorUid, null, { ...created, lines: input.lines });
  return created;
}

export async function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
  authorUid?: string,
): Promise<PurchaseOrder | null> {
  await requireOrdersTable();
  const { data: existing, error: fetchError } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return null;

  // Guardar desde el panel confirma el número: deja de ser provisional y pasa
  // a contar para la regla de "no registrar dos veces la misma orden".
  const orderNumber = normalizeOrderNumber(input.orderNumber);
  await assertOrderNumberFree(orderNumber, id);

  const patch: Record<string, unknown> = {
    order_number: orderNumber,
    number_provisional: false,
    purchase_date: input.purchaseDate,
  };
  if (input.newInvoice) await assertInvoiceNumberFree(input.newInvoice.invoiceNumber);
  const supplierId = await resolveSupplierId(input.supplierId, input.newSupplier);
  if (supplierId !== undefined) patch.supplier_id = supplierId;
  const invoiceId = await resolveInvoiceId(input.invoiceId, input.newInvoice, authorUid);
  if (invoiceId !== undefined) patch.invoice_id = invoiceId;
  if (input.packagePhotos !== undefined) patch.package_photos = input.packagePhotos;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await db.from('purchase_orders').update(patch).eq('id', id);
  if (error) {
    await dropInvoiceIfUnused(input.newInvoice ? invoiceId : null);
    if (isUniqueViolation(error)) throw new BadRequestError(`La orden ${orderNumber} ya está registrada.`);
    throw error;
  }
  // La factura que dejó de usar, si no la usa otra orden.
  if (invoiceId !== undefined && existing.invoice_id && existing.invoice_id !== invoiceId) {
    await dropInvoiceIfUnused(existing.invoice_id);
  }

  // Las líneas llevan el número y la fecha de su orden.
  const linePatch: Record<string, unknown> = {};
  if (orderNumber !== existing.order_number) linePatch.lot = orderNumber;
  if (input.purchaseDate !== existing.purchase_date) linePatch.purchase_date = input.purchaseDate;
  if (Object.keys(linePatch).length) {
    const { error: linesError } = await db.from('purchases').update(linePatch).eq('order_id', id);
    if (linesError) throw linesError;
  }
  if (input.taxUnit !== undefined) await setOrderTax(id, input.taxUnit, authorUid);

  const updated = await getPurchaseOrder(id);
  await audit(id, 'update', authorUid, existing, updated);
  return updated;
}

/** Mismo impuesto en todas las líneas; las que ya llegaron recalculan su costo. */
async function setOrderTax(orderId: string, taxUnit: number, authorUid?: string): Promise<void> {
  const { data, error } = await db.from('purchases').select('id, impuesto_unit_usd').eq('order_id', orderId);
  if (error) throw error;
  for (const line of (data ?? []) as { id: string; impuesto_unit_usd: number | string | null }[]) {
    if (Number(line.impuesto_unit_usd ?? 0) === taxUnit) continue;
    await updatePurchase(line.id, { taxUnit }, authorUid, { fromOrder: true });
  }
}

export async function addPurchaseOrderLines(
  id: string,
  input: AddPurchaseOrderLinesInput,
  authorUid?: string,
): Promise<PurchaseOrder | null> {
  await requireOrdersTable();
  const { data: order, error } = await db
    .from('purchase_orders')
    .select('id, order_number, purchase_date')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const current = await getPurchaseOrder(id);
  const taxUnit = current?.lineCount ? current.taxUnit ?? 0 : input.taxUnit ?? 0;
  const { prepared, createdProductIds } = await prepareLines(input.lines, taxUnit);
  try {
    await insertLines(
      { id: order.id as string, orderNumber: order.order_number as string, purchaseDate: order.purchase_date as string },
      prepared,
    );
  } catch (err) {
    await dropCreatedProducts(createdProductIds);
    throw err;
  }
  const updated = await getPurchaseOrder(id);
  await audit(id, 'add_lines', authorUid, null, { lines: input.lines });
  return updated;
}

/** Solo una orden sin líneas: las líneas se borran una por una (con sus reglas). */
export async function deletePurchaseOrder(id: string, authorUid?: string): Promise<boolean> {
  await requireOrdersTable();
  const { data: existing, error } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!existing) return false;

  const { count, error: countError } = await db
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new BadRequestError(`La orden tiene ${count} producto(s). Eliminalos primero.`);
  }

  const { error: deleteError } = await db.from('purchase_orders').delete().eq('id', id);
  if (deleteError) throw deleteError;
  await dropInvoiceIfUnused(existing.invoice_id);
  await audit(id, 'delete', authorUid, existing, null);
  return true;
}
