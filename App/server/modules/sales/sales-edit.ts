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

// Vuelta atrás de `updateSale` cuando algo falla después de liberar el stock:
// líneas, datos de la venta y reserva como estaban. Best-effort: si la propia
// restauración falla, queda asentado en auditoría para revisarlo a mano.
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

  // ── Stock: se valida ANTES de tocar nada ──
  // Las unidades de esta misma venta cuentan como disponibles (ver
  // `inventoryForEdit`). Antes la edición liberaba primero y fallaba después,
  // dejando la venta sin reserva y esas unidades libres en bodega.
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

  // ── La factura que emitió esta venta ──
  // `registerSale` puede haber nacido de una factura ya impresa, y esa factura
  // es el documento que ve el cliente y el que audita Facturación: si la venta
  // se corrige, tiene que corregirse con ella. Se busca ACÁ, antes de tocar
  // nada, porque de ella dependen el total y la validación de abajo.
  //
  // `limit(1)` y no `maybeSingle()` por el mismo motivo que en `getSaleById`:
  // si por un caso raro hubiera dos filas apuntando a la venta, la edición no
  // puede reventar por eso.
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

  // ── Líneas de ANTES, leídas una sola vez ──
  // Alimentan dos cosas: el ajuste de comisión post-pago y saber si la edición
  // tocó de verdad los productos. Si no los tocó (se corrigió el teléfono, el
  // vendedor…), la factura no tiene por qué moverse.
  // `*`: si la edición falla a mitad de camino, estas filas se restauran tal
  // cual (con su snapshot financiero congelado).
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

  // ── Descuento: no se puede repartir de nuevo sobre un papel ya impreso ──
  // Con descuento, `order_items.precio_unit` es el precio YA prorrateado por
  // `registerSale`, no el de lista que salió impreso. Devolver un cambio a
  // `invoice_items` exigiría des-prorratear, y eso no cierra al centavo. Antes
  // que escribir números inventados en un documento fiscal, se corta la edición.
  const invoiceHasDiscount = (activeInvoice?.discount ?? 0) > 0;
  if (activeInvoice && linesChanged && invoiceHasDiscount) {
    const code = activeInvoice.invoice_code ?? formatInvoiceCode(activeInvoice.invoice_number);
    throw new BadRequestError(
      `Esta venta salió de la factura ${code}, que lleva un descuento aplicado. Cambiar los productos o ` +
        'sus precios obligaría a repartir ese descuento de nuevo sobre un documento ya emitido: anulá la ' +
        'factura y emitila otra vez.',
    );
  }

  // ── ¿La factura quedó diciendo otra cosa que la venta? ──
  // La condición NO es "esta edición tocó las líneas" sino "las dos capas no
  // coinciden". La diferencia importa: las ventas que ya quedaron descuadradas
  // por la versión vieja de esta función se reparan solas la próxima vez que se
  // editen, en lugar de arrastrar el descuadre para siempre.
  //
  // Sin descuento el precio de la línea y el de lista son el mismo número, así
  // que la comparación es directa. Con descuento nunca van a coincidir por
  // diseño, y ahí la sincronización no aplica (el guard de arriba ya impidió que
  // las líneas cambiaran).
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

  // ── El total de una venta facturada es el de la factura ──
  // `linesTotal` es solo lo que suman los productos; la factura además cobra el
  // envío. Guardar `linesTotal` pelado le borraba el envío al total y dejaba la
  // orden descuadrada contra `invoices.total` — que es justo lo que pasó con
  // GS-PR-3, GS-PR-5 y GS-PR-9.
  //
  // Con descuento el total de la factura se conserva TAL CUAL en vez de
  // recomponerse: rearmarlo desde líneas prorrateadas puede mover un centavo por
  // redondeo, y las líneas ahí no cambiaron.
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

  // ── Mover stock y líneas, con vuelta atrás ──
  // Sin transacción real: si algo falla entre liberar y volver a reservar, se
  // restaura la venta como estaba (líneas, datos y reserva). Antes quedaba
  // pendiente, sin reserva, y al aprobarla esas líneas entraban con costo 0.
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
        // Igual que en registerSale: la edición vuelve la venta a
        // pending_approval, así que se re-guarda el snapshot estimado para que la
        // comisión se siga viendo. approveSale lo re-congela con el costo real.
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

  // ── La factura sigue a la venta ──
  // Va DESPUÉS de mover el stock: si la reserva falla, la factura no se tocó y
  // el papel sigue describiendo lo que la orden todavía dice.
  //
  // `invoiceOutOfSync` ya garantiza descuento en cero, así que el precio de la
  // línea y el de lista son el mismo número y no hay que des-prorratear nada. Se
  // reemplazan las líneas enteras (borrar + insertar) en vez de parchearlas,
  // igual que en `updateInvoice`: las filas no tienen identidad estable y
  // parchear por posición se rompe al borrar una del medio.
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
        // Cambió el vendedor de una venta ya pagada: al anterior se le
        // descuenta lo que cobró y al nuevo se le acredita lo suyo. Antes se
        // anotaba todo al anterior con la comisión del nuevo.
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

  // La venta puede tener una factura asociada (sale_id en invoices). La FK es
  // `on delete set null`, así que si no hacemos nada acá, borrar la orden deja
  // una factura en estado 'linked' con sale_id en null: un correlativo fiscal
  // que dice estar ligado a una venta que ya no existe. Se anula en cadena
  // (nunca se borra: el correlativo no se reutiliza, ver database/README.md).
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
