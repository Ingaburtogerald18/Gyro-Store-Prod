// Registro de una venta: valida, reserva stock FIFO y la deja pendiente de aprobación.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { getAvailableInventory } from '../inventory/inventory';
import { reserveForItems, releaseReservations } from '../inventory/inventory-fifo';
import { attachInvoiceToSale, claimInvoice, formatInvoiceCode, parseInvoiceCode, releaseInvoiceClaim } from '../invoices/invoices';
import { BadRequestError } from '../../utils/http-error';
import { computeOrderLineSnapshot } from './commission';
import type { RegisterSaleInput } from '../../../shared/schemas';
import { estimateLineCost, logBelowMinMargin, resolveContact, resolveOverrideSeller } from './sales-helpers';

// ── Registro (reserva FIFO real) ──

export interface RegisteredSale {
  id: string;
  status: string;
  total: number;
}

export async function registerSale(
  input: RegisterSaleInput,
  seller: { uid: string; email: string; isAdmin?: boolean, isGlobalAdmin?: boolean },
): Promise<RegisteredSale> {
  const [config, availableRows] = await Promise.all([getFinancialConfig(), getAvailableInventory()]);
  const minMargin = config.minMarginMultiplier ?? 1.15;

  if (!input.invoiceNumber && !seller.isGlobalAdmin) {
    throw new BadRequestError('El código de factura es obligatorio para registrar la venta (excepción: global_admin).');
  }

  let customCreatedAt: string | undefined = undefined;
  if (input.soldAt) {
    const soldDate = new Date(input.soldAt);
    if (isNaN(soldDate.getTime())) {
      throw new BadRequestError('Fecha de venta inválida.');
    }
    if (soldDate.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestError('La fecha de venta no puede ser futura.');
    }
    customCreatedAt = soldDate.toISOString();
  }

  let finalItems = input.items;
  let finalCustomerName = input.customerName;
  let finalPhone = input.phone;
  let invoiceIdToLink: number | null = null;
  // Importe REALMENTE cobrado cuando la venta nace de una factura: es el total
  // de la factura, que ya tiene aplicado el descuento (manual y/o por código).
  let invoiceTotal: number | null = null;
  // Vendedor al que Caja le emitió el ticket. Manda sobre quien registra la
  // venta (ver la resolución del vendedor más abajo).
  let invoiceSellerUid: string | null = null;

  if (input.invoiceNumber) {
    // El vendedor tipea lo que ve impreso ("GS-PR-12"); acá se resuelve al
    // correlativo numérico, que es por lo que se busca en la tabla.
    const invoiceNumber = parseInvoiceCode(input.invoiceNumber);
    if (invoiceNumber === null) {
      throw new BadRequestError(`Código de factura inválido. Se espera algo como ${formatInvoiceCode(1)}.`);
    }

    const { data: existing, error: invError } = await db
      .from('invoices')
      .select('id, status, customer_name, phone, total, discount, seller_uid, created_at')
      .eq('invoice_number', invoiceNumber)
      .maybeSingle();

    if (invError) throw invError;
    if (!existing) throw new BadRequestError(`La factura ${formatInvoiceCode(invoiceNumber)} no existe.`);
    if (existing.status !== 'unlinked') throw new BadRequestError('Esta factura ya está vinculada o anulada.');

    invoiceIdToLink = invoiceNumber;
    finalCustomerName = existing.customer_name || input.customerName;
    finalPhone = existing.phone || input.phone;
    invoiceTotal = existing.total ?? null;
    invoiceSellerUid = existing.seller_uid ?? null;

    if (!customCreatedAt && existing.created_at) {
      customCreatedAt = existing.created_at;
    }

    const { data: invItems, error: itemsError } = await db
      .from('invoice_items')
      .select('sku, quantity, unit_price')
      .eq('invoice_id', existing.id);

    if (itemsError) throw itemsError;
    if (!invItems || invItems.length === 0) throw new BadRequestError('La factura no tiene productos.');

    // ── El descuento de la factura se PRORRATEA sobre las líneas ──
    // El cliente pagó menos, así que el precio efectivo de cada unidad es menor.
    // Bajarlo acá — antes de `computeOrderLineSnapshot` — hace que TODA la
    // cadena financiera (utilidad bruta → salary → utilidad neta → comisión →
    // ganancia tienda) se recalcule sobre lo realmente cobrado, sin tocar
    // `commission.ts`. Si no se prorratea, la tienda paga comisión sobre plata
    // que nunca entró.
    //
    // Se reparte proporcional al peso de cada línea: una línea que es el 70% del
    // subtotal absorbe el 70% del descuento.
    const rawSubtotal = round(
      invItems.reduce((sum, it) => sum + it.quantity * (it.unit_price ?? 0), 0),
      2,
    );
    const invoiceDiscount = round(existing.discount ?? 0, 2);
    const discountFactor =
      rawSubtotal > 0 ? Math.max(0, (rawSubtotal - invoiceDiscount) / rawSubtotal) : 1;

    finalItems = invItems.map((item) => ({
      productName: item.sku!,
      quantity: item.quantity,
      // Se redondea el UNITARIO: es lo que se congela en `order_items.precio_unit`
      // y lo que se audita después, así que tiene que ser una cifra exacta.
      salePrice: round((item.unit_price ?? 0) * discountFactor, 2),
      applyWholesale: false,
    }));
  }

  // Precio final por línea (con mayoreo ya aplicado si corresponde): es lo
  // que se congela en order_items.precio_unit y lo que usa la cadena de
  // comisión al aprobar — el mayoreo no se vuelve a evaluar después.
  const pricedLines = finalItems.map((item) => {
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

  // Si la venta viene de una factura, el total es EL DE LA FACTURA: es lo que el
  // cliente pagó de verdad, con el descuento ya aplicado. Antes se recalculaba
  // sumando las líneas, así que una venta con código de descuento quedaba
  // registrada por el importe SIN descontar y descuadraba contra `invoices` y
  // contra el arqueo de caja.
  //
  // La comisión ya viene descontada: `finalItems` trae los precios con el
  // descuento prorrateado, así que `precio_unit` — que es lo que usa
  // `approveSale` para la cadena de comisión — ya refleja lo cobrado.
  const linesTotal = round(
    pricedLines.reduce((sum, line) => sum + line.precioUnit * line.quantity, 0),
    2,
  );
  const total = invoiceTotal ?? linesTotal;

  const contactId = await resolveContact(finalCustomerName, finalPhone);

  // ── A nombre de quién queda la venta ──
  // Por defecto, quien la está registrando. PERO si la venta nace de una factura
  // que Caja emitió a nombre de un vendedor, manda ESE vendedor: el ticket de
  // papel ya dice de quién es la venta y a quién se le debe la comisión.
  //
  // Antes `invoices.seller_uid` se ignoraba acá y la venta quedaba siempre a
  // nombre de quien la tipeaba. Como los admin registran facturas ajenas (el
  // vendedor no siempre entra al sistema), la venta —y la comisión— terminaban
  // acreditadas al admin, en silencio y sin que nadie tocara nada.
  let finalSellerUid: string | null = seller.uid;
  let finalSellerEmail: string = seller.email;

  if (invoiceSellerUid) {
    const { data: invoiceSeller } = await db
      .from('profiles')
      .select('email')
      .eq('id', invoiceSellerUid)
      .maybeSingle();

    // La FK de `invoices.seller_uid` es `on delete set null`, así que un uid
    // asignado siempre tiene perfil. Si aun así no aparece, se corta: caer al
    // usuario actual sería exactamente el bug que este bloque arregla.
    if (!invoiceSeller?.email) {
      throw new BadRequestError(
        'No se pudo resolver el vendedor asignado a esta factura. Revisá su perfil antes de registrar la venta.',
      );
    }

    // Un override que CONTRADICE a la factura se rechaza en vez de ignorarse en
    // silencio: el editor ya muestra (y bloquea) el vendedor de la factura, así
    // que esto solo llega desde la API directa o un formulario desactualizado.
    // Para arreglar una factura mal asignada se edita la venta ya registrada,
    // que exige motivo y queda asentado — cambiar el dueño de una comisión no
    // debería poder hacerse sin dejar rastro.
    const overrideContradiceFactura =
      (!!input.overrideSellerId && input.overrideSellerId !== invoiceSellerUid) ||
      !!input.overrideSellerName;
    if (seller.isAdmin && overrideContradiceFactura) {
      throw new BadRequestError(
        `La factura ${formatInvoiceCode(invoiceIdToLink!)} ya está asignada a un vendedor, así que la venta se registra a su nombre. Si el ticket quedó mal asignado, registrá la venta y corregí el vendedor editándola.`,
      );
    }

    finalSellerUid = invoiceSellerUid;
    finalSellerEmail = invoiceSeller.email;
  } else if (seller.isAdmin) {
    if (input.overrideSellerId) {
      const chosen = await resolveOverrideSeller(input.overrideSellerId);
      finalSellerUid = chosen.uid;
      finalSellerEmail = chosen.email;
    } else if (input.overrideSellerName) {
      finalSellerUid = null;
      finalSellerEmail = input.overrideSellerName;
    }
  }

  // La factura se toma ANTES de crear la venta (ver `claimInvoice`): si otro
  // registro ya la tomó, se corta acá sin haber reservado nada.
  if (invoiceIdToLink) await claimInvoice(invoiceIdToLink);

  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      status: 'pending_approval',
      sale_origin: 'native',
      seller_uid: finalSellerUid,
      seller_email: finalSellerEmail,
      phone: finalPhone ?? null,
      contact_id: contactId,
      total,
      ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
    })
    .select('id, status, total')
    .single();
  if (orderError) {
    if (invoiceIdToLink) await releaseInvoiceClaim(invoiceIdToLink);
    throw orderError;
  }

  try {
    const { error: itemsError } = await db.from('order_items').insert(
      pricedLines.map((line) => ({
        order_id: order.id,
        // Sin catalog_item_id real en purchases todavía (mismo límite del
        // FIFO, ver inventory-fifo.ts): se guarda el nombre de producto en `sku`.
        sku: line.productName,
        quantity: line.quantity,
        precio_unit: line.precioUnit,
        // Snapshot financiero ESTIMADO (costo FIFO estimado sobre el stock
        // disponible). Deja ver la comisión apenas se registra, sin esperar la
        // aprobación — es lo que el vendedor/admin necesita para decidir.
        // `approveSale` lo RE-CONGELA con el costo real de los lotes consumidos
        // (Docs/03-Finanzas.md, regla de oro): el pago siempre sale de esos valores finales,
        // nunca de este estimado.
        coste_final_snap: line.snapshot.costeFinalSnap,
        utilidad_bruta: line.snapshot.utilidadBruta,
        salary: line.snapshot.salary,
        utilidad_neta: line.snapshot.utilidadNeta,
        comision: line.snapshot.comision,
        ganancia_tienda: line.snapshot.gananciaTienda,
        pozos: line.snapshot.pozos,
        ...(customCreatedAt ? { created_at: customCreatedAt } : {}),
      })),
    );
    if (itemsError) throw itemsError;

    await reserveForItems(
      order.id,
      pricedLines.map((line) => ({ productName: line.productName, quantity: line.quantity })),
    );

    if (invoiceIdToLink) await attachInvoiceToSale(invoiceIdToLink, order.id);
  } catch (err) {
    // reserveForItems ya se compensa a sí misma si falla a mitad de camino;
    // esto cubre que haya fallado el insert de order_items o el ligado de la
    // factura. La factura vuelve a quedar libre: el ticket sigue siendo válido.
    await releaseReservations(order.id);
    await db.from('orders').delete().eq('id', order.id);
    if (invoiceIdToLink) await releaseInvoiceClaim(invoiceIdToLink);
    throw err;
  }

  await logBelowMinMargin(
    order.id,
    pricedLines.map((l) => ({ productName: l.productName, precioUnit: l.precioUnit, costeFinal: l.snapshot.costeFinalSnap })),
    minMargin,
    seller.uid,
  );

  if (customCreatedAt) {
    await db.from('audit_logs').insert({
      entity: 'orders',
      entity_id: order.id,
      action: 'manual_date',
      reason: `Fecha manual: ${customCreatedAt}`,
      author_uid: seller.uid,
    });
  }

  return { id: order.id, status: order.status, total: order.total };
}
