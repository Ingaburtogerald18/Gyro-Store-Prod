// Ventas (MVP Hito 3, doc 09 ítem 60): cotizar, registrar, aprobar, rechazar,
// listar. Sin fotos de recibo, sin venta vía ticket de factura (invoice.ts
// todavía no existe), sin edición post-aprobación ni pago de comisiones por
// lotes — eso queda fuera de este pase (ver el plan acordado). Solo
// inventario NATIVO (`purchases` vía FIFO). El módulo de inventario migrado se
// eliminó en 0016: nunca fue vendible desde acá.
//
// Reciclaje de v1 (server/routes/sales/{quotes,register,manage,list}.js +
// services/{commission,sales}.js): se recicla el algoritmo de semana ISO
// (getISOWeekString → getIsoWeek, puro, sin Firebase) y la idea de "una sola
// función/cadena para cotizar y para aprobar". El resto se reescribe: v1
// resolvía costo por FIFO propio (services/sales.js, Firestore) — acá se
// consumen las funciones FIFO que ya existen en inventory.ts
// (reserveForItems/consumeReservation/releaseReservations), no se
// reimplementan. La agrupación "una venta por código+precio" de v1
// (distributeReservations) se reemplaza por una regla más simple: un
// producto no puede repetirse en dos líneas de la misma venta (Zod, shared/
// schemas.ts), así toda reserva de un `order_id` para un `product_name` dado
// pertenece sin ambigüedad a un solo order_item — no hace falta esa
// distribución.
import { db } from '../supabase';
import { round, computeCosteFinal } from './finance';
import { getFinancialConfig } from './appConfig';
import { 
  getAvailableInventory, 
  reserveForItems,
  consumeReservation,
  releaseReservations,
  releaseConsumedReservations,
  type InventoryRow,
} from './inventory';
import { formatInvoiceCode, linkInvoiceToSale, parseInvoiceCode, voidInvoice } from './invoice';
import { BadRequestError } from '../utils/httpError';
import { computeLineCommission, computeOrderLineSnapshot } from './commission';
import type { SaleLineInput, RegisterSaleInput, UpdateSaleInput } from '../../shared/schemas';
import { firstOfEmbed } from '../utils/firstOfEmbed';
import { recordCommissionAdjustment } from './sellerPayments';
import { enqueueApprovedSale } from './spoOutbox';
import { getIsoWeek } from '../utils/isoWeek';

// `getIsoWeek` (doc 03 B.4: orders.week_of agrupa pagos de comisión) vive ahora
// en utils/isoWeek.ts: lo comparte con las carpetas semanales de comprobantes en
// SharePoint, y dos copias del mismo cálculo terminan divergiendo justo en el
// borde de fin de año, que es donde más duele.

// ── Productos vendibles (cotizador) ──

export interface SellableProduct {
  productName: string;
  price: number;
  stock: number;
  /** Código del primer lote disponible. El que se muestra junto al nombre. */
  code: string | null;
  /** Todos los códigos de lote con stock: el buscador matchea contra cualquiera. */
  codes: string[];
}

export async function listSellableProducts(): Promise<SellableProduct[]> {
  const rows = await getAvailableInventory();
  const byProduct = new Map<string, SellableProduct>();

  for (const row of rows) {
    const existing = byProduct.get(row.productName);
    if (existing) {
      existing.stock += row.available;
      // Un mismo producto puede venir de varios lotes, cada uno con su código.
      // Se acumulan TODOS para que buscar por cualquiera de ellos encuentre el
      // producto; el que se muestra es el primero (`code`).
      if (row.code && !existing.codes.includes(row.code)) existing.codes.push(row.code);
    } else {
      byProduct.set(row.productName, {
        productName: row.productName,
        price: row.suggestedPrice ?? 0,
        stock: row.available,
        code: row.code ?? null,
        codes: row.code ? [row.code] : [],
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
}

// Estimación de costo (solo lectura, no reserva nada): promedio ponderado del
// coste final / Costo F/U de los lotes FIFO que cubrirían `quantity` unidades
// de `productName`, usando el mismo orden (purchase_date asc) que expone
// getAvailableInventory. No es una reimplementación del FIFO de reserva/venta
// — es una lectura de lo que YA devuelve inventory.ts, sin mutar nada.
function estimateLineCost(
  productName: string,
  quantity: number,
  availableRows: InventoryRow[],
): { costeFinal: number; costoFU: number; available: number } {
  const lots = availableRows.filter((row) => row.productName === productName);
  const available = lots.reduce((sum, lot) => sum + (lot.available ?? 0), 0);

  let remaining = quantity;
  let costeFinalWeighted = 0;
  let costoFUWeighted = 0;
  let taken = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const lotAvailable = lot.available ?? 0;
    if (lotAvailable <= 0) continue;
    const take = Math.min(lotAvailable, remaining);
    const costeFinal = computeCosteFinal(lot.costRealCordobas ?? 0, lot.costoFijoCordobas ?? 0);
    costeFinalWeighted += costeFinal * take;
    costoFUWeighted += (lot.costoFijoCordobas ?? 0) * take;
    taken += take;
    remaining -= take;
  }

  return {
    costeFinal: taken > 0 ? round(costeFinalWeighted / taken, 2) : 0,
    costoFU: taken > 0 ? round(costoFUWeighted / taken, 2) : 0,
    available,
  };
}

// ── Cotizador (no persiste, no reserva) ──

export interface QuoteLine {
  productName: string;
  quantity: number;
  precioUnit: number;
  /** Costo de UNA unidad. */
  costeFinalSnap?: number;
  /** Costo de todas las unidades (`costeFinalSnap × quantity`). */
  costoTotal?: number;
  utilidadBruta?: number;
  salary?: number;
  utilidadNeta?: number;
  comision: number;
  comisionPercent: number;
  gananciaTienda?: number;

  // La cadena por unidad: el panel muestra unitario y total lado a lado, y el
  // tramo de `comisionPercent` sale del valor UNITARIO.
  utilidadBrutaUnit?: number;
  salaryUnit?: number;
  utilidadNetaUnit?: number;
  comisionUnit?: number;
  gananciaTiendaUnit?: number;

  wholesale: { discountPercent: number; warning: boolean };
  available: number;
  insufficientStock: boolean;
  belowMinMargin?: boolean;
}

export interface QuoteResult {
  lines: QuoteLine[];
  total: number;
  totalComision: number;
  totalGananciaTienda?: number;
}

export async function quoteSale(items: SaleLineInput[]): Promise<QuoteResult> {
  const [config, availableRows] = await Promise.all([getFinancialConfig(), getAvailableInventory()]);

  const lines = items.map((item) => {
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

    return {
      productName: item.productName,
      quantity: snapshot.quantity,
      precioUnit: snapshot.precioUnit,
      costeFinalSnap: snapshot.costeFinalSnap,
      costoTotal: snapshot.costoTotal,
      utilidadBruta: snapshot.utilidadBruta,
      salary: snapshot.salary,
      utilidadNeta: snapshot.utilidadNeta,
      comision: snapshot.comision,
      comisionPercent: snapshot.comisionPercent,
      gananciaTienda: snapshot.gananciaTienda,
      utilidadBrutaUnit: snapshot.utilidadBrutaUnit,
      salaryUnit: snapshot.salaryUnit,
      utilidadNetaUnit: snapshot.utilidadNetaUnit,
      comisionUnit: snapshot.comisionUnit,
      gananciaTiendaUnit: snapshot.gananciaTiendaUnit,
      wholesale: snapshot.wholesale,
      available: estimate.available,
      insufficientStock: estimate.available < item.quantity,
      belowMinMargin: snapshot.precioUnit < round(snapshot.costeFinalSnap * (config.minMarginMultiplier ?? 1.15), 2),
    };
  });

  return {
    lines,
    total: round(
      lines.reduce((sum, line) => sum + line.precioUnit * line.quantity, 0),
      2,
    ),
    totalComision: round(
      lines.reduce((sum, line) => sum + line.comision, 0),
      2,
    ),
    totalGananciaTienda: round(
      lines.reduce((sum, line) => sum + line.gananciaTienda, 0),
      2,
    ),
  };
}

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
      .select('id, status, customer_name, phone, total, discount, seller_uid')
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

    const minPrice = round(snapshot.costeFinalSnap * minMargin, 2);
    if (snapshot.precioUnit < minPrice) {
      throw new BadRequestError(
        `El precio de venta para "${item.productName}" está por debajo del margen mínimo. El mínimo aceptable es C$ ${minPrice.toFixed(2)}.`,
      );
    }

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

  let contactId: string | null = null;
  if (finalCustomerName || finalPhone) {
    if (finalPhone) {
      const { data, error } = await db
        .from('contacts')
        .upsert({ phone: finalPhone, name: finalCustomerName || null }, { onConflict: 'phone' })
        .select('id')
        .single();
      if (!error && data) contactId = data.id;
    } else if (finalCustomerName) {
      const { data, error } = await db
        .from('contacts')
        .insert({ name: finalCustomerName })
        .select('id')
        .single();
      if (!error && data) contactId = data.id;
    }
  }

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
      const { data } = await db.from('profiles').select('email').eq('id', input.overrideSellerId).maybeSingle();
      if (data) {
        finalSellerUid = input.overrideSellerId;
        finalSellerEmail = data.email;
      }
    } else if (input.overrideSellerName) {
      finalSellerUid = null;
      finalSellerEmail = input.overrideSellerName;
    }
  }

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
    })
    .select('id, status, total')
    .single();
  if (orderError) throw orderError;

  try {
    const { error: itemsError } = await db.from('order_items').insert(
      pricedLines.map((line) => ({
        order_id: order.id,
        // Sin catalog_item_id real en purchases todavía (mismo límite del
        // FIFO, ver inventory.ts): se guarda el nombre de producto en `sku`.
        sku: line.productName,
        quantity: line.quantity,
        precio_unit: line.precioUnit,
        // Snapshot financiero ESTIMADO (costo FIFO estimado sobre el stock
        // disponible). Deja ver la comisión apenas se registra, sin esperar la
        // aprobación — es lo que el vendedor/admin necesita para decidir.
        // `approveSale` lo RE-CONGELA con el costo real de los lotes consumidos
        // (doc 11, regla de oro): el pago siempre sale de esos valores finales,
        // nunca de este estimado.
        coste_final_snap: line.snapshot.costeFinalSnap,
        utilidad_bruta: line.snapshot.utilidadBruta,
        salary: line.snapshot.salary,
        utilidad_neta: line.snapshot.utilidadNeta,
        comision: line.snapshot.comision,
        ganancia_tienda: line.snapshot.gananciaTienda,
        pozos: line.snapshot.pozos,
      })),
    );
    if (itemsError) throw itemsError;

    await reserveForItems(
      order.id,
      pricedLines.map((line) => ({ productName: line.productName, quantity: line.quantity })),
    );
  } catch (err) {
    // reserveForItems ya se compensa a sí misma si falla a mitad de camino;
    // esto cubre que haya fallado el insert de order_items en cambio.
    await releaseReservations(order.id);
    await db.from('orders').delete().eq('id', order.id);
    throw err;
  }

  if (invoiceIdToLink) {
    await linkInvoiceToSale(invoiceIdToLink, order.id);
  }

  return { id: order.id, status: order.status, total: order.total };
}

// ── Aprobar / Rechazar ──

interface PurchaseEmbed {
  product_name: string;
  coste_final: number | null;
  costo_f_u: number | null;
}

// Consume las reservas (reservado → vendido en purchases, vía inventory.ts) y
// congela el snapshot financiero de doc 11 §4 en cada order_item. El costo
// por línea sale de los lotes que stock_reservations realmente asignó a esa
// venta (promedio ponderado si abarcó más de un lote).
export async function approveSale(orderId: string): Promise<boolean> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return false;
  if (order.status !== 'pending_approval') {
    throw new BadRequestError('Solo se aprueban ventas pendientes.');
  }

  const { data: itemRows, error: itemsError } = await db
    .from('order_items')
    .select('id, sku, quantity, precio_unit')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;
  const items = (itemRows ?? []) as unknown as {
    id: string;
    sku: string;
    quantity: number;
    precio_unit: number | null;
  }[];

  const { data: reservationRows, error: reservationsError } = await db
    .from('stock_reservations')
    .select('quantity, purchases(product_name, coste_final, costo_f_u)')
    .eq('order_id', orderId)
    .eq('status', 'active');
  if (reservationsError) throw reservationsError;
  const reservations = (reservationRows ?? []) as unknown as {
    quantity: number;
    purchases: PurchaseEmbed | PurchaseEmbed[] | null;
  }[];

  const config = await getFinancialConfig();
  await consumeReservation(orderId);

  for (const item of items) {
    const lots = reservations
      .map((r) => ({ quantity: r.quantity, purchase: firstOfEmbed(r.purchases) }))
      .filter((r) => r.purchase?.product_name === item.sku);
    const takenQty = lots.reduce((sum, lot) => sum + lot.quantity, 0);

    const costeFinal =
      takenQty > 0
        ? round(lots.reduce((sum, lot) => sum + (lot.purchase?.coste_final ?? 0) * lot.quantity, 0) / takenQty, 2)
        : 0;
    const costoFU =
      takenQty > 0
        ? round(lots.reduce((sum, lot) => sum + (lot.purchase?.costo_f_u ?? 0) * lot.quantity, 0) / takenQty, 2)
        : 0;

    // Mayoreo ya quedó fijado en precio_unit al registrar: acá solo corre la
    // cadena utilidad→salary→comisión→ganancia (doc 11 §4), no se reevalúa.
    const commission = computeLineCommission(
      { precioUnit: item.precio_unit ?? 0, quantity: item.quantity, costeFinal, costoFU },
      config,
    );

    const { error: updateItemError } = await db
      .from('order_items')
      .update({
        coste_final_snap: costeFinal,
        utilidad_bruta: commission.utilidadBruta,
        salary: commission.salary,
        utilidad_neta: commission.utilidadNeta,
        comision: commission.comision,
        ganancia_tienda: commission.gananciaTienda,
        pozos: commission.pozos,
      })
      .eq('id', item.id);
    if (updateItemError) throw updateItemError;
  }

  const { error: updateOrderError } = await db
    .from('orders')
    .update({ status: 'approved', week_of: getIsoWeek(new Date()) })
    .eq('id', orderId);
  if (updateOrderError) throw updateOrderError;

  // Espejo en SharePoint (doc: Docs/17 y la sección `spo_outbox` del schema). Solo se
  // ENCOLA: la subida a Graph la hace un worker aparte. Va después del update
  // porque una venta que no llegó a quedar 'approved' no tiene nada que espejar,
  // y `enqueueApprovedSale` no lanza nunca — si el outbox falla, la aprobación
  // igual se completa. Se espera (await) porque es un insert local de una fila:
  // dejarlo suelto solo cambiaría milisegundos por una promesa sin dueño.
  await enqueueApprovedSale(orderId);

  return true;
}

// Libera el stock reservado y deja un rastro en audit_logs (no hay columna de
// motivo en `orders`, pero la tabla de auditoría ya existe para esto).
export async function rejectSale(orderId: string, reason: string, rejectedBy: string): Promise<boolean> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return false;
  if (order.status !== 'pending_approval') {
    throw new BadRequestError('Solo se pueden rechazar ventas pendientes.');
  }

  await releaseReservations(orderId);

  const { error: updateError } = await db.from('orders').update({ status: 'rejected' }).eq('id', orderId);
  if (updateError) throw updateError;

  const { error: auditError } = await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_rejected',
    reason,
    author_uid: rejectedBy,
  });
  if (auditError) throw auditError;

  return true;
}

// ── Listado ──

export interface SaleListItem {
  id: string;
  status: string;
  saleOrigin: string;
  sellerUid: string | null;
  sellerEmail: string;
  /** Nombre registrado en `profiles`. Vacío si la cuenta nunca lo completó. */
  sellerName: string;
  weekOf: string | null;
  phone: string | null;
  total: number;
  /** Suma de `order_items.salary` (Fondo de Empresa, 20% de utilidad bruta). */
  totalSalary: number;
  /** Suma de `order_items.comision` de TODAS las líneas de la venta. */
  totalComision: number;
  /** Suma de `order_items.ganancia_tienda`. `routes/sales.ts` la recorta para no-admins. */
  totalGananciaTienda: number;
  /** Correlativo de la factura con que se registró la venta (`invoices.sale_id`). Null si no tiene. */
  invoiceNumber: number | null;
  /** Código legible de esa factura: `GS-PR-12`. Null si no tiene. */
  invoiceCode: string | null;
  /** Costo de envío si la venta tiene factura con delivery. 0 si no tiene. */
  deliveryFee: number;
  createdAt: string;
}

/**
 * Una venta con sus líneas. Lo que el drawer de detalle necesita.
 *
 * Las líneas traen la cadena financiera COMPLETA de doc 11 §4 (utilidad bruta →
 * salary → utilidad neta → comisión → ganancia) más el reparto en pozos, tal
 * como quedó congelada en `order_items`. No se recalcula nada: doc 11 §1 dice
 * que cambiar un costo o un % después no reescribe ventas viejas, así que el
 * detalle tiene que mostrar lo que pasó ese día, no lo que pasaría hoy.
 */
export interface SaleWithItems extends SaleListItem {
  items: {
    productName: string;
    quantity: number;
    salePrice: number;
    /** Costo de una unidad. Solo para admin: la ruta lo recorta. */
    costeFinalSnap?: number;
    /** Costo de TODAS las unidades de la línea. */
    costoTotal?: number;
    utilidadBruta?: number;
    salary?: number;
    utilidadNeta?: number;
    comision?: number;
    /**
     * Tramo de comisión aplicado, en tanto por uno. Solo para admin: junto con
     * `comision` permite despejar la utilidad neta y de ahí el costo, así que
     * filtra lo mismo que `costeFinalSnap`.
     */
    comisionPercent?: number;
    gananciaTienda?: number;
    /** El reparto del Costo F/U de esta línea en los 7 pozos (doc 11 §2). */
    pozos?: Record<string, number>;

    // ── La misma cadena, POR UNIDAD ──
    // Es de donde sale el tramo de comisión (se busca por la utilidad neta
    // UNITARIA, ver commission.ts), así que sin estos valores el porcentaje
    // parece salir de la nada. En la base solo viven los totales: acá se
    // dividen entre la cantidad.
    utilidadBrutaUnit?: number;
    salaryUnit?: number;
    utilidadNetaUnit?: number;
    comisionUnit?: number;
    gananciaTiendaUnit?: number;
  }[];
}

/**
 * Una venta por id, con sus líneas.
 *
 * Faltaba: no existía ningún endpoint que devolviera una venta individual —
 * `GET /api/sales` responde el listado sin `items`. Sin esto no se puede abrir
 * el detalle de una venta desde un enlace (`?sale=<id>`), ni precargar el
 * editor para corregirla, ni que una notificación apunte al registro exacto.
 *
 * SENSIBLE: los campos financieros por línea son la estructura de costos de la
 * tienda. La ruta los recorta para quien no es admin, igual que en `/quote`.
 */
export async function getSaleById(id: string): Promise<SaleWithItems | null> {
  const { data: order, error } = await db
    .from('orders')
    .select('id, status, sale_origin, seller_uid, seller_email, week_of, phone, total, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!order) return null;

  const row = order as unknown as {
    id: string;
    status: string;
    sale_origin: string;
    seller_uid: string | null;
    seller_email: string;
    week_of: string | null;
    phone: string | null;
    total: number | null;
    created_at: string;
  };

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select(
      'sku, quantity, precio_unit, coste_final_snap, utilidad_bruta, salary, utilidad_neta, comision, ganancia_tienda, pozos',
    )
    .eq('order_id', id);

  if (itemsError) throw itemsError;

  // Igual que en `listSales`: el nombre sale de una segunda query y no de un
  // embed. Un dato secundario no puede tumbar la respuesta entera.
  let sellerName = '';
  if (row.seller_uid) {
    const { data: profile } = await db
      .from('profiles')
      .select('name')
      .eq('id', row.seller_uid)
      .maybeSingle();
    if (profile?.name?.trim()) sellerName = profile.name.trim();
  }

  const itemRows = (items ?? []) as unknown as {
    sku: string | null;
    quantity: number;
    precio_unit: number | null;
    coste_final_snap: number | null;
    utilidad_bruta: number | null;
    salary: number | null;
    utilidad_neta: number | null;
    comision: number | null;
    ganancia_tienda: number | null;
    pozos: Record<string, number> | null;
  }[];

  // Factura con que se registró la venta (`invoices.sale_id`). Segunda query,
  // no embed (mismo criterio que el nombre del vendedor arriba). `limit(1)` en
  // vez de `maybeSingle` para no reventar si por un caso raro hubiera más de
  // una fila apuntando a la venta.
  let invoiceNumber: number | null = null;
  let invoiceCode: string | null = null;
  let deliveryFee = 0;
  const { data: linkedInvoices } = await db
    .from('invoices')
    .select('invoice_number, invoice_code, delivery_fee')
    .eq('sale_id', id)
    .order('invoice_number', { ascending: false })
    .limit(1);
  const linkedInvoice = (linkedInvoices ?? [])[0] as { invoice_number: number; invoice_code: string | null; delivery_fee: number | null } | undefined;
  if (linkedInvoice) {
    invoiceNumber = linkedInvoice.invoice_number;
    invoiceCode = linkedInvoice.invoice_code ?? formatInvoiceCode(linkedInvoice.invoice_number);
    deliveryFee = linkedInvoice.delivery_fee ?? 0;
  }

  return {
    id: row.id,
    status: row.status,
    saleOrigin: row.sale_origin,
    sellerUid: row.seller_uid,
    sellerEmail: row.seller_email,
    sellerName,
    weekOf: row.week_of,
    phone: row.phone,
    total: row.total ?? 0,
    totalSalary: itemRows.reduce((sum, it) => sum + (it.salary ?? 0), 0),
    totalComision: itemRows.reduce((sum, it) => sum + (it.comision ?? 0), 0),
    totalGananciaTienda: itemRows.reduce((sum, it) => sum + (it.ganancia_tienda ?? 0), 0),
    invoiceNumber,
    invoiceCode,
    deliveryFee,
    createdAt: row.created_at,
    items: itemRows.map((it) => {
      const quantity = it.quantity;
      const costeFinalSnap = it.coste_final_snap ?? 0;
      const utilidadBruta = it.utilidad_bruta ?? 0;
      const salary = it.salary ?? 0;
      const utilidadNeta = it.utilidad_neta ?? 0;
      const comision = it.comision ?? 0;
      const gananciaTienda = it.ganancia_tienda ?? 0;

      // `order_items` guarda los TOTALES de la línea; los unitarios se derivan.
      // `quantity` no puede ser 0 (CHECK en la tabla), así que no hace falta
      // guardarse de la división.
      const perUnit = (total: number) => round(total / quantity, 2);

      return {
        productName: it.sku ?? '',
        quantity,
        salePrice: it.precio_unit ?? 0,
        costeFinalSnap,
        costoTotal: round(costeFinalSnap * quantity, 2),
        utilidadBruta,
        salary,
        utilidadNeta,
        comision,
        // No hay columna `comision_percent`: se despeja del par que sí está.
        // Sin utilidad neta positiva la comisión es 0 por regla de negocio
        // (`computeCommissionPercent`), y ahí la división no tiene sentido.
        // Se redondea a 4 decimales para que un tramo del 30% se lea 0.3 y no
        // 0.29997 — el ruido lo mete el redondeo a centavos de `comision`.
        comisionPercent: utilidadNeta > 0 ? round(comision / utilidadNeta, 4) : 0,
        gananciaTienda,
        pozos: it.pozos ?? undefined,
        utilidadBrutaUnit: perUnit(utilidadBruta),
        salaryUnit: perUnit(salary),
        utilidadNetaUnit: perUnit(utilidadNeta),
        comisionUnit: perUnit(comision),
        gananciaTiendaUnit: perUnit(gananciaTienda),
      };
    }),
  };
}

export async function listSales(filters: { sellerEmail?: string; status?: string }): Promise<SaleListItem[]> {
  let query = db
    .from('orders')
    .select('id, status, sale_origin, seller_uid, seller_email, week_of, phone, total, created_at')
    .order('created_at', { ascending: false });

  if (filters.sellerEmail) query = query.eq('seller_email', filters.sellerEmail);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    status: string;
    sale_origin: string;
    seller_uid: string | null;
    seller_email: string;
    week_of: string | null;
    phone: string | null;
    total: number | null;
    created_at: string;
  }[];

  // El nombre del vendedor se resuelve con una SEGUNDA query y no con un embed
  // de PostgREST (`profiles!seller_uid(name)`): el embed depende de que
  // PostgREST tenga la FK en su caché de esquema, y cuando no la tiene falla con
  // PGRST200 y se lleva puesto el listado ENTERO. Acá el nombre es un dato
  // secundario — si no se puede resolver, la venta igual tiene que listarse.
  const uids = [...new Set(rows.map((r) => r.seller_uid).filter((id): id is string => !!id))];
  const namesByUid = new Map<string, string>();

  if (uids.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, name').in('id', uids);
    for (const p of (profiles ?? []) as { id: string; name: string | null }[]) {
      if (p.name?.trim()) namesByUid.set(p.id, p.name.trim());
    }
  }

  // Comisión y ganancia de tienda TOTALES de la venta: una venta puede tener
  // varias líneas, cada una con su propio tramo. Se suman con una TERCERA
  // query en lote (mismo criterio que el nombre del vendedor arriba) y no con
  // un JOIN/embed: si la venta no tiene líneas todavía, quedan en 0 y la
  // venta igual se lista. `ganancia_tienda` viaja en la misma fila que
  // `comision` — no hace falta una cuarta query para sumarla aparte.
  const orderIds = rows.map((r) => r.id);
  const salaryByOrderId = new Map<string, number>();
  const comisionByOrderId = new Map<string, number>();
  const gananciaTiendaByOrderId = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: items } = await db
      .from('order_items')
      .select('order_id, salary, comision, ganancia_tienda')
      .in('order_id', orderIds);
    for (const it of (items ?? []) as { order_id: string; salary: number | null; comision: number | null; ganancia_tienda: number | null }[]) {
      salaryByOrderId.set(it.order_id, (salaryByOrderId.get(it.order_id) ?? 0) + (it.salary ?? 0));
      comisionByOrderId.set(it.order_id, (comisionByOrderId.get(it.order_id) ?? 0) + (it.comision ?? 0));
      gananciaTiendaByOrderId.set(it.order_id, (gananciaTiendaByOrderId.get(it.order_id) ?? 0) + (it.ganancia_tienda ?? 0));
    }
  }

  // Nº de factura con que se registró cada venta (`invoices.sale_id`). CUARTA
  // query en lote, mismo criterio que las de arriba (nunca embed): si no se
  // resuelve, la venta igual se lista, solo que sin código de factura.
  const invoiceBySaleId = new Map<string, { number: number; code: string; deliveryFee: number }>();
  if (orderIds.length > 0) {
    const { data: invoices } = await db
      .from('invoices')
      .select('sale_id, invoice_number, invoice_code, delivery_fee')
      .in('sale_id', orderIds);
    for (const inv of (invoices ?? []) as { sale_id: string | null; invoice_number: number; invoice_code: string | null; delivery_fee: number | null }[]) {
      if (!inv.sale_id) continue;
      invoiceBySaleId.set(inv.sale_id, {
        number: inv.invoice_number,
        code: inv.invoice_code ?? formatInvoiceCode(inv.invoice_number),
        deliveryFee: inv.delivery_fee ?? 0,
      });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    saleOrigin: row.sale_origin,
    sellerUid: row.seller_uid,
    sellerEmail: row.seller_email,
    sellerName: (row.seller_uid && namesByUid.get(row.seller_uid)) || '',
    weekOf: row.week_of,
    phone: row.phone,
    total: row.total ?? 0,
    totalSalary: salaryByOrderId.get(row.id) ?? 0,
    totalComision: comisionByOrderId.get(row.id) ?? 0,
    // Solo la ve admin/global_admin: routes/sales.ts la recorta para un
    // vendedor común, igual que ya hace con `gananciaTienda` en `/quote` y en
    // el detalle de una venta (getSaleById no la trae en absoluto).
    totalGananciaTienda: gananciaTiendaByOrderId.get(row.id) ?? 0,
    invoiceNumber: invoiceBySaleId.get(row.id)?.number ?? null,
    invoiceCode: invoiceBySaleId.get(row.id)?.code ?? null,
    deliveryFee: invoiceBySaleId.get(row.id)?.deliveryFee ?? 0,
    createdAt: row.created_at,
  }));
}

// ── Modificación y Anulación ──

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

  const [config, availableRows] = await Promise.all([getFinancialConfig(), getAvailableInventory()]);
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

    const minPrice = round(snapshot.costeFinalSnap * minMargin, 2);
    if (snapshot.precioUnit < minPrice) {
      throw new BadRequestError(
        `El precio de venta para "${item.productName}" está por debajo del margen mínimo. El mínimo aceptable es C$ ${minPrice.toFixed(2)}.`,
      );
    }
    return { productName: item.productName, quantity: item.quantity, precioUnit: snapshot.precioUnit, snapshot };
  });

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
  const { data: oldItemRows } = await db
    .from('order_items')
    .select('sku, quantity, precio_unit, comision')
    .eq('order_id', orderId);
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

  if (order.status === 'pending_approval') {
    await releaseReservations(orderId);
  } else {
    await releaseConsumedReservations(orderId);
  }

  let contactId: string | null = order.contact_id ?? null;
  if (input.customerName || input.phone) {
    if (input.phone) {
      const { data, error } = await db
        .from('contacts')
        .upsert({ phone: input.phone, name: input.customerName || null }, { onConflict: 'phone' })
        .select('id')
        .single();
      if (!error && data) contactId = data.id;
    } else if (input.customerName) {
      const { data, error } = await db
        .from('contacts')
        .insert({ name: input.customerName })
        .select('id')
        .single();
      if (!error && data) contactId = data.id;
    }
  } else {
     if (input.customerName === '' && input.phone === '') {
       contactId = null;
     }
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

  if (isAdmin) {
    if (input.overrideSellerId) {
      const { data } = await db.from('profiles').select('email').eq('id', input.overrideSellerId).maybeSingle();
      if (data) {
        updatePayload.seller_uid = input.overrideSellerId;
        updatePayload.seller_email = data.email;
      }
    } else if (input.overrideSellerName) {
      updatePayload.seller_uid = null;
      updatePayload.seller_email = input.overrideSellerName;
    }
  }

  const { error: updError } = await db
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId);
  if (updError) throw updError;

  await db.from('order_items').delete().eq('order_id', orderId);

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
    })),
  );
  if (itemsError) throw itemsError;

  try {
    await reserveForItems(
      orderId,
      pricedLines.map((line) => ({ productName: line.productName, quantity: line.quantity })),
    );
  } catch (err) {
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
      })),
    );
    if (insInvItemsError) throw insInvItemsError;

    const { error: invError } = await db
      .from('invoices')
      .update({ subtotal: linesTotal, total: newTotal })
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
  }

  if (order.status === 'approved' || order.status === 'paid') {
    await approveSale(orderId);

    if (order.status === 'paid') {
      await db.from('orders').update({ status: 'paid' }).eq('id', orderId);
      const { data: newItems } = await db.from('order_items').select('comision').eq('order_id', orderId);
      const newComision = (newItems || []).reduce((sum, it) => sum + (Number(it.comision) || 0), 0);

      await recordCommissionAdjustment({
        sellerEmail: order.seller_email,
        sellerUid: order.seller_uid,
        orderId: orderId,
        comisionVieja: oldComision,
        comisionNueva: newComision,
        reason: input.reason || 'Edición post-pago',
        createdBy: user.uid,
      });
    }
  }

  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_updated',
    reason: input.reason || 'Edición de venta',
    author_uid: user.uid,
  });

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
    await voidInvoice(linkedInvoice.id, reason || 'Venta eliminada', user.uid);
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

  await db.from('order_items').delete().eq('order_id', orderId);
  await db.from('orders').delete().eq('id', orderId);

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
