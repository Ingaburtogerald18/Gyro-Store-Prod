// Editar y anular ventas.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { reserveForItems, consumeReservation, releaseReservations, releaseConsumedReservations } from '../inventory/inventory-fifo';
import { formatInvoiceCode, voidInvoice } from '../invoices/invoices';
import { BadRequestError } from '../../utils/http-error';
import { computeOrderLineSnapshot } from './commission';
import type { UpdateSaleInput } from '../../../shared/schemas';
import { recordCommissionAdjustment } from './seller-payments';
import type { RegisteredSale } from './sales-register';
import { estimateLineCost, inventoryForEdit, logBelowMinMargin, resolveContact, resolveOverrideSeller } from './sales-helpers';
import { approveSale } from './sales-approval';

// ── Modificación y Anulación ──

// Vuelta atrás de updateSale si algo falla después de liberar el stock. Si la restauración también
// falla, queda en auditoría para revisarla a mano.
async function restoreSaleAfterFailedEdit(
  orderId: string,
  order: Record<string, any>,
  oldItemRows: Record<string, unknown>[],
  reservationStatus: 'active' | 'consumed',
  authorUid: string,
): Promise<void> {
  try {
    await releaseReservations(orderId);
    await db.from('order_items').delete().eq('order_id', orderId);
    if (oldItemRows.length) {
      const { error } = await db.from('order_items').insert(oldItemRows);
      if (error) throw error;
    }
    const { error: orderError } = await db
      .from('orders')
      .update({
        status: order.status,
        total: order.total,
        phone: order.phone,
        contact_id: order.contact_id,
        seller_uid: order.seller_uid,
        seller_email: order.seller_email,
        week_of: order.week_of,
        created_at: order.created_at,
      })
      .eq('id', orderId);
    if (orderError) throw orderError;

    const oldLines = (oldItemRows as { sku: string | null; quantity: number }[])
      .filter((it) => it.sku)
      .map((it) => ({ productName: it.sku as string, quantity: it.quantity }));
    await reserveForItems(orderId, oldLines);
    if (reservationStatus === 'consumed') await consumeReservation(orderId);
  } catch (restoreErr) {
    console.error(`[sales] No se pudo restaurar la venta ${orderId} tras una edición fallida:`, restoreErr);
    await db.from('audit_logs').insert({
      entity: 'orders',
      entity_id: orderId,
      action: 'edit_rollback_failed',
      reason: `La edición falló y no se pudo restaurar la venta: revisar líneas y stock reservado. ${
        restoreErr instanceof Error ? restoreErr.message : ''
      }`.trim(),
      author_uid: authorUid,
    });
  }
}

export async function updateSale(
  orderId: string,
  input: UpdateSaleInput,
  user: { uid: string; email: string; roles: string[] },
): Promise<RegisteredSale> {
  const { data: order, error: orderError } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new BadRequestError('Venta no encontrada.');

  if (!['pending_approval', 'approved', 'paid'].includes(order.status)) {
    throw new BadRequestError(`No se puede editar una venta en estado ${order.status}.`);
  }
  if (order.status !== 'pending_approval' && !input.reason) {
    throw new BadRequestError('El motivo de edición es obligatorio para ventas ya procesadas.');
  }

  // Pendiente → sus unidades están reservadas; aprobada/pagada → vendidas.
  const reservationStatus: 'active' | 'consumed' = order.status === 'pending_approval' ? 'active' : 'consumed';
  const [config, availableRows] = await Promise.all([
    getFinancialConfig(),
    inventoryForEdit(orderId, reservationStatus),
  ]);
  const minMargin = config.minMarginMultiplier ?? 1.15;

  const pricedLines = input.items.map((item) => {
    const estimate = estimateLineCost(item.productName, item.quantity, availableRows);
    const snapshot = computeOrderLineSnapshot(
      {
        sku: item.productName,
        quantity: item.quantity,
        basePrice: item.salePrice,
        costeFinal: estimate.costeFinal,
        costoFU: estimate.costoFU,
        applyWholesale: item.applyWholesale,
      },
      config,
    );

    return { productName: item.productName, quantity: item.quantity, precioUnit: snapshot.precioUnit, snapshot };
  });

  // El stock se valida antes de tocar nada; las unidades de esta venta cuentan como disponibles.
  for (const line of pricedLines) {
    const available = availableRows
      .filter((row) => row.productName === line.productName)
      .reduce((sum, row) => sum + (row.available ?? 0), 0);
    if (line.quantity > available) {
      throw new BadRequestError(
        `Stock insuficiente de "${line.productName}": hay ${available} unidad(es) contando las de esta venta.`,
      );
    }
  }

  const linesTotal = round(
    pricedLines.reduce((sum, line) => sum + line.precioUnit * line.quantity, 0),
    2,
  );

  // La factura de la venta se corrige con ella: es el papel que ve el cliente. `limit(1)` para no
  // romper si hubiera dos filas apuntando a la venta.
  const { data: linkedInvoices } = await db
    .from('invoices')
    .select('id, invoice_number, invoice_code, status, subtotal, discount, delivery_fee, total')
    .eq('sale_id', orderId)
    .order('invoice_number', { ascending: false })
    .limit(1);
  const invoice = (linkedInvoices ?? [])[0] as
    | {
        id: string;
        invoice_number: number;
        invoice_code: string | null;
        status: string;
        subtotal: number | null;
        discount: number | null;
        delivery_fee: number | null;
        total: number | null;
      }
    | undefined;
  // Una factura anulada ya no describe nada que cobrar: para el total y para la
  // sincronización cuenta como si la venta no tuviera factura.
  const activeInvoice = invoice && invoice.status !== 'void' ? invoice : undefined;

  // Líneas anteriores: sirven para el ajuste de comisión, para saber si cambiaron los productos
  // y para restaurarlas tal cual si la edición falla.
  const { data: oldItemRows, error: oldItemsError } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);
  if (oldItemsError) throw oldItemsError;
  const oldItems = (oldItemRows ?? []) as unknown as {
    sku: string | null;
    quantity: number;
    precio_unit: number | null;
    comision: number | null;
  }[];

  const oldComision =
    order.status === 'paid'
      ? oldItems.reduce((sum, it) => sum + (Number(it.comision) || 0), 0)
      : 0;

  const lineKey = (sku: string, quantity: number, price: number) => `${sku}|${quantity}|${price.toFixed(2)}`;
  const keysBefore = oldItems
    .map((it) => lineKey(it.sku ?? '', it.quantity, Number(it.precio_unit) || 0))
    .sort();
  const keysAfter = pricedLines.map((l) => lineKey(l.productName, l.quantity, l.precioUnit)).sort();
  const linesChanged =
    keysBefore.length !== keysAfter.length || keysBefore.some((k, i) => k !== keysAfter[i]);

  // Con descuento, `precio_unit` ya está prorrateado: devolver un cambio a la factura no cierra al
  // centavo, así que se corta la edición.
  const invoiceHasDiscount = (activeInvoice?.discount ?? 0) > 0;
  if (activeInvoice && linesChanged && invoiceHasDiscount) {
    const code = activeInvoice.invoice_code ?? formatInvoiceCode(activeInvoice.invoice_number);
    throw new BadRequestError(
      `Esta venta salió de la factura ${code}, que lleva un descuento aplicado. Cambiar los productos o ` +
        'sus precios obligaría a repartir ese descuento de nuevo sobre un documento ya emitido: anulá la ' +
        'factura y emitila otra vez.',
    );
  }

  // La condición es que venta y factura no coincidan, no que esta edición tocara las líneas:
  // así se reparan solas las que ya estaban descuadradas.
  let invoiceOutOfSync = false;
  if (activeInvoice && !invoiceHasDiscount) {
    const { data: invItemRows } = await db
      .from('invoice_items')
      .select('sku, quantity, unit_price')
      .eq('invoice_id', activeInvoice.id);
    const keysInvoice = ((invItemRows ?? []) as unknown as {
      sku: string | null;
      quantity: number;
      unit_price: number | null;
    }[])
      .map((it) => lineKey(it.sku ?? '', it.quantity, Number(it.unit_price) || 0))
      .sort();
    invoiceOutOfSync =
      keysInvoice.length !== keysAfter.length || keysInvoice.some((k, i) => k !== keysAfter[i]);
  }

  // El total de una venta facturada es el de la factura (incluye el envío). Con descuento se conserva
  // tal cual: rearmarlo desde líneas prorrateadas puede mover un centavo.
  let newTotal = linesTotal;
  if (activeInvoice) {
    newTotal = invoiceHasDiscount
      ? (activeInvoice.total ?? linesTotal)
      : round(linesTotal + (activeInvoice.delivery_fee ?? 0), 2);
  }

  // ── Contacto y vendedor: se resuelven antes de tocar nada ──
  // Un vendedor inexistente tiene que cortar acá, no a mitad de la edición.
  let contactId: string | null = order.contact_id ?? null;
  if (input.customerName || input.phone) {
    // Edición explícita de un admin: si corrige el nombre, se corrige.
    contactId = (await resolveContact(input.customerName, input.phone, { overwriteName: true })) ?? contactId;
  } else if (input.customerName === '' && input.phone === '') {
    contactId = null;
  }

  const isAdmin = user.roles.includes('admin') || user.roles.includes('global_admin');

  // Si no es admin, mantenemos los valores originales de la base de datos (por eso no incluimos los campos en el update).
  // Si es admin, evaluamos los overrides.
  const updatePayload: any = {
    total: newTotal,
    phone: input.phone || null,
    contact_id: contactId,
    status: 'pending_approval',
  };

  if (input.soldAt) {
    const soldDate = new Date(input.soldAt);
    if (isNaN(soldDate.getTime())) {
      throw new BadRequestError('Fecha de venta inválida.');
    }
    if (soldDate.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestError('La fecha de venta no puede ser futura.');
    }
    updatePayload.created_at = soldDate.toISOString();
  }

  if (isAdmin) {
    if (input.overrideSellerId) {
      const chosen = await resolveOverrideSeller(input.overrideSellerId);
      updatePayload.seller_uid = chosen.uid;
      updatePayload.seller_email = chosen.email;
    } else if (input.overrideSellerName) {
      updatePayload.seller_uid = null;
      updatePayload.seller_email = input.overrideSellerName;
    }
  }

  // Sin transacción: si algo falla entre liberar y volver a reservar, se restaura la venta como estaba.
  if (reservationStatus === 'active') {
    await releaseReservations(orderId);
  } else {
    await releaseConsumedReservations(orderId);
  }

  const itemCreatedAt = updatePayload.created_at || order.created_at;

  try {
    const { error: updError } = await db
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);
    if (updError) throw updError;

    const { error: delItemsError } = await db.from('order_items').delete().eq('order_id', orderId);
    if (delItemsError) throw delItemsError;

    const { error: itemsError } = await db.from('order_items').insert(
      pricedLines.map((line) => ({
        order_id: orderId,
        sku: line.productName,
        quantity: line.quantity,
        precio_unit: line.precioUnit,
        // La edición vuelve la venta a pendiente: se guarda el snapshot estimado y approveSale lo re-congela.
        coste_final_snap: line.snapshot.costeFinalSnap,
        utilidad_bruta: line.snapshot.utilidadBruta,
        salary: line.snapshot.salary,
        utilidad_neta: line.snapshot.utilidadNeta,
        comision: line.snapshot.comision,
        ganancia_tienda: line.snapshot.gananciaTienda,
        pozos: line.snapshot.pozos,
        ...(itemCreatedAt ? { created_at: itemCreatedAt } : {}),
      })),
    );
    if (itemsError) throw itemsError;

    await reserveForItems(
      orderId,
      pricedLines.map((line) => ({ productName: line.productName, quantity: line.quantity })),
    );
  } catch (err) {
    await restoreSaleAfterFailedEdit(orderId, order, oldItemRows ?? [], reservationStatus, user.uid);
    throw err;
  }

  // La factura se actualiza después de mover el stock: si la reserva falla, el papel sigue igual.
  // Las líneas se reemplazan enteras, como en updateInvoice.
  if (activeInvoice && invoiceOutOfSync) {
    const { error: delInvItemsError } = await db
      .from('invoice_items')
      .delete()
      .eq('invoice_id', activeInvoice.id);
    if (delInvItemsError) throw delInvItemsError;

    const { error: insInvItemsError } = await db.from('invoice_items').insert(
      pricedLines.map((line) => ({
        invoice_id: activeInvoice.id,
        sku: line.productName,
        quantity: line.quantity,
        unit_price: line.precioUnit,
        line_total: round(line.precioUnit * line.quantity, 2),
        ...(updatePayload.created_at ? { created_at: updatePayload.created_at } : {}),
      })),
    );
    if (insInvItemsError) throw insInvItemsError;

    const { error: invError } = await db
      .from('invoices')
      .update({
        subtotal: linesTotal,
        total: newTotal,
        ...(updatePayload.created_at ? { created_at: updatePayload.created_at } : {}),
      })
      .eq('id', activeInvoice.id);
    if (invError) throw invError;

    // Entrada propia, con `entity_id` de la factura: quien audita Facturación
    // busca por el id del documento, no por el de la venta que lo movió.
    await db.from('audit_logs').insert({
      entity: 'invoices',
      entity_id: activeInvoice.id,
      action: 'invoice_synced_from_sale',
      reason: input.reason || 'Edición de la venta ligada',
      author_uid: user.uid,
      before: { subtotal: activeInvoice.subtotal, total: activeInvoice.total },
      after: { subtotal: linesTotal, total: newTotal },
    });
  } else if (activeInvoice && updatePayload.created_at) {
    await db.from('invoices').update({ created_at: updatePayload.created_at }).eq('id', activeInvoice.id);
    await db.from('invoice_items').update({ created_at: updatePayload.created_at }).eq('invoice_id', activeInvoice.id);
  }

  if (order.status === 'approved' || order.status === 'paid') {
    try {
      await approveSale(orderId);
    } catch (err) {
      // El stock ya quedó reservado con las líneas nuevas: la venta queda
      // pendiente y se aprueba a mano. Se avisa en vez de fallar en silencio.
      const detail = err instanceof Error ? err.message : '';
      throw new BadRequestError(
        `Los cambios se guardaron, pero la venta no se pudo volver a aprobar y quedó en Pendientes. Aprobala desde ahí.${detail ? ` (${detail})` : ''}`,
      );
    }

    // Re-aprobar no la mueve de semana: sigue en el corte de comisiones donde
    // ya estaba (approveSale pone la semana actual).
    const restore: Record<string, unknown> = {};
    if (order.week_of) restore.week_of = order.week_of;
    if (order.status === 'paid') restore.status = 'paid';
    if (Object.keys(restore).length) {
      const { error: restoreError } = await db.from('orders').update(restore).eq('id', orderId);
      if (restoreError) throw restoreError;
    }

    if (order.status === 'paid') {
      const { data: newItems } = await db.from('order_items').select('comision').eq('order_id', orderId);
      const newComision = (newItems || []).reduce((sum, it) => sum + (Number(it.comision) || 0), 0);
      const reason = input.reason || 'Edición post-pago';
      const newSellerEmail: string = updatePayload.seller_email ?? order.seller_email;
      const newSellerUid: string | null =
        'seller_uid' in updatePayload ? updatePayload.seller_uid : order.seller_uid;

      if (newSellerEmail === order.seller_email) {
        await recordCommissionAdjustment({
          sellerEmail: order.seller_email,
          sellerUid: order.seller_uid,
          orderId: orderId,
          comisionVieja: oldComision,
          comisionNueva: newComision,
          reason,
          createdBy: user.uid,
        });
      } else {
        // Cambió el vendedor de una venta pagada: al anterior se le descuenta lo cobrado y al nuevo se acredita.
        await recordCommissionAdjustment({
          sellerEmail: order.seller_email,
          sellerUid: order.seller_uid,
          orderId: orderId,
          comisionVieja: oldComision,
          comisionNueva: 0,
          reason: `${reason} (venta reasignada)`,
          createdBy: user.uid,
        });
        await recordCommissionAdjustment({
          sellerEmail: newSellerEmail,
          sellerUid: newSellerUid,
          orderId: orderId,
          comisionVieja: 0,
          comisionNueva: newComision,
          reason: `${reason} (venta reasignada)`,
          createdBy: user.uid,
        });
      }
    }
  }

  await logBelowMinMargin(
    orderId,
    pricedLines.map((l) => ({ productName: l.productName, precioUnit: l.precioUnit, costeFinal: l.snapshot.costeFinalSnap })),
    minMargin,
    user.uid,
  );

  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_updated',
    reason: input.reason || 'Edición de venta',
    author_uid: user.uid,
  });

  if (updatePayload.created_at && updatePayload.created_at !== order.created_at) {
    await db.from('audit_logs').insert({
      entity: 'orders',
      entity_id: orderId,
      action: 'manual_date',
      reason: `Fecha manual modificada en edición: ${updatePayload.created_at}`,
      author_uid: user.uid,
    });
  }

  return { id: orderId, status: order.status === 'pending_approval' ? 'pending_approval' : order.status, total: newTotal };
}

export async function deleteSale(orderId: string, reason: string, user: { uid: string; email: string; roles: string[] }) {
  const { data: order, error: orderError } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new BadRequestError('Venta no encontrada.');

  // La FK de la factura es `on delete set null`: sin esto quedaría «ligada» a una venta que no existe.
  // Se anula en cadena; nunca se borra.
  const { data: linkedInvoice } = await db
    .from('invoices')
    .select('id, status')
    .eq('sale_id', orderId)
    .maybeSingle();
  if (linkedInvoice && linkedInvoice.status !== 'void') {
    await voidInvoice(linkedInvoice.id, reason || 'Venta eliminada', user.uid, { allowLinked: true });
  }

  if (order.status === 'pending_approval') {
    await releaseReservations(orderId);
  } else {
    await releaseConsumedReservations(orderId);
  }

  let oldComision = 0;
  if (order.status === 'paid') {
    const { data: oldItems } = await db.from('order_items').select('comision').eq('order_id', orderId);
    oldComision = (oldItems || []).reduce((sum, it) => sum + (Number(it.comision) || 0), 0);
  }

  const { error: delItemsError } = await db.from('order_items').delete().eq('order_id', orderId);
  if (delItemsError) throw delItemsError;
  const { error: delOrderError } = await db.from('orders').delete().eq('id', orderId);
  if (delOrderError) throw delOrderError;

  if (order.status === 'paid') {
    await recordCommissionAdjustment({
      sellerEmail: order.seller_email,
      sellerUid: order.seller_uid,
      orderId: orderId,
      comisionVieja: oldComision,
      comisionNueva: 0,
      reason: reason || 'Venta eliminada',
      createdBy: user.uid,
    });
  }

  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_deleted',
    reason: reason || 'Venta anulada',
    author_uid: user.uid,
  });

  return true;
}
