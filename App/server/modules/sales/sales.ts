// Ventas: cotizar, registrar, aprobar, rechazar y listar, sobre el FIFO de
// inventory.ts. Un producto no puede repetirse en dos líneas de una venta, así
// cada reserva de un `order_id` + `product_name` pertenece a un solo order_item.
import { db } from '../../core/supabase';
import { round, computeCosteFinal } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { 
  getAvailableInventory, 
  getCurrentInventory,
  reserveForItems,
  consumeReservation,
  releaseReservations,
  releaseConsumedReservations,
  type InventoryRow,
} from '../inventory/inventory';
import {
  attachInvoiceToSale,
  claimInvoice,
  formatInvoiceCode,
  parseInvoiceCode,
  releaseInvoiceClaim,
  unlinkInvoiceFromSale,
  voidInvoice,
} from '../invoices/invoices';
import { fetchAllRows } from '../../utils/fetch-all-rows';
import { BadRequestError } from '../../utils/http-error';
import { computeLineCommission, computeOrderLineSnapshot } from './commission';
import type { SaleLineInput, RegisterSaleInput, UpdateSaleInput } from '../../../shared/schemas';
import { firstOfEmbed } from '../../utils/first-of-embed';
import { recordCommissionAdjustment } from './seller-payments';
import { enqueueApprovedSale } from '../sharepoint/spo-outbox';
import { getIsoWeek } from '../../utils/iso-week';
import { resolveVariantPrice } from '../catalog/catalog-presenter';

// `getIsoWeek` (Docs/02-Arquitectura.md §6: orders.week_of agrupa pagos de comisión) vive ahora
// en utils/iso-week.ts: lo comparte con las carpetas semanales de comprobantes en
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
  /** De dónde sale `price`: la variante del catálogo (lo normal) o el lote (sin vínculo). */
  priceSource: 'catalog' | 'lot';
}

interface CatalogPriceRow {
  id: string;
  price: number | null;
  base_price: number | null;
  is_promo: boolean;
  variant_mappings: Record<string, unknown> | null;
}

// Precio de venta por código de lote, según la variante del catálogo a la que
// pertenece (decisión 2026-10-07: el precio vive en el catálogo; el del lote
// solo sugiere). Mismo cálculo que la tienda, promoción incluida.
async function catalogPriceByCode(rows: InventoryRow[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await db.from('catalog_items').select('id, price, base_price, is_promo, variant_mappings');
  if (error) throw error;
  const items = new Map(((data ?? []) as unknown as CatalogPriceRow[]).map((item) => [item.id, item]));

  const priceOf = (item: CatalogPriceRow, key: string) => {
    const entry = (item.variant_mappings ?? {})[key] as Record<string, unknown> | undefined;
    const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : undefined);
    return resolveVariantPrice(item, entry ? { price: num(entry.price), promoPrice: num(entry.promoPrice) } : undefined).price;
  };

  // 1) Vínculo por columna (migración 0022).
  for (const row of rows) {
    const item = row.catalogItemId ? items.get(row.catalogItemId) : undefined;
    if (item) out.set(row.code, priceOf(item, row.variantKey ?? ''));
  }
  // 2) Vínculo cargado a mano en el editor de Catálogo.
  for (const item of items.values()) {
    for (const [key, entry] of Object.entries(item.variant_mappings ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const codes = (entry as { codes?: unknown }).codes;
      if (!Array.isArray(codes)) continue;
      for (const code of codes) {
        if (typeof code === 'string' && !out.has(code)) out.set(code, priceOf(item, key));
      }
    }
  }
  return out;
}

export async function listSellableProducts(): Promise<SellableProduct[]> {
  const rows = await getAvailableInventory();
  const catalogPrices = await catalogPriceByCode(rows);
  const byProduct = new Map<string, SellableProduct>();

  for (const row of rows) {
    const existing = byProduct.get(row.productName);
    if (existing) {
      existing.stock += row.available;
      // Un mismo producto puede venir de varios lotes, cada uno con su código.
      // Se acumulan TODOS para que buscar por cualquiera de ellos encuentre el
      // producto; el que se muestra es el primero (`code`).
      if (row.code && !existing.codes.includes(row.code)) existing.codes.push(row.code);
      if (existing.priceSource === 'lot' && catalogPrices.has(row.code)) {
        existing.price = catalogPrices.get(row.code)!;
        existing.priceSource = 'catalog';
      }
    } else {
      const catalogPrice = catalogPrices.get(row.code);
      byProduct.set(row.productName, {
        productName: row.productName,
        price: catalogPrice ?? row.suggestedPrice ?? 0,
        priceSource: catalogPrice !== undefined ? 'catalog' : 'lot',
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

// ── Margen mínimo ──
// Un precio por debajo del mínimo ya no bloquea el registro: la venta entra
// marcada y el admin decide al aprobar. Bloquear tenía dos problemas: rebotaba
// facturas ya cobradas con un descuento grande, y le permitía al vendedor
// tantear precios hasta encontrar el costo (mínimo = costo × multiplicador).
function isBelowMinMargin(precioUnit: number, costeFinal: number, minMargin: number): boolean {
  return costeFinal > 0 && precioUnit < round(costeFinal * minMargin, 2);
}

async function logBelowMinMargin(
  orderId: string,
  lines: { productName: string; precioUnit: number; costeFinal: number }[],
  minMargin: number,
  authorUid: string,
): Promise<void> {
  const below = lines.filter((l) => isBelowMinMargin(l.precioUnit, l.costeFinal, minMargin));
  if (!below.length) return;
  await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'below_min_margin',
    reason: below
      .map((l) => `${l.productName}: C$ ${l.precioUnit.toFixed(2)} (mínimo C$ ${round(l.costeFinal * minMargin, 2).toFixed(2)})`)
      .join(' · '),
    author_uid: authorUid,
  });
}

// ── Contacto del cliente ──
// Antes se hacía `upsert` por teléfono con el nombre de ESTA venta: una venta
// sin nombre le borraba el nombre al contacto, y una con otro nombre lo
// renombraba. Y una venta con nombre pero sin teléfono creaba un contacto
// nuevo cada vez. Ahora:
//   · con teléfono: se reusa el contacto; el nombre solo se completa si estaba
//     vacío, o se corrige si `overwriteName` (edición explícita de un admin).
//   · solo nombre: se reusa un contacto sin teléfono con el mismo nombre.
// Best-effort: un fallo acá no frena la venta, que igual guarda el teléfono.
async function resolveContact(
  rawName: string | null | undefined,
  rawPhone: string | null | undefined,
  opts: { overwriteName?: boolean } = {},
): Promise<string | null> {
  const name = rawName?.trim() || null;
  const phone = rawPhone?.trim() || null;
  if (!name && !phone) return null;

  try {
    if (phone) {
      const findByPhone = () =>
        db.from('contacts').select('id, name').eq('phone', phone).maybeSingle();
      let { data: existing } = await findByPhone();
      if (!existing) {
        const { data: created, error } = await db
          .from('contacts')
          .insert({ phone, name })
          .select('id, name')
          .single();
        if (!error && created) return created.id as string;
        // Otro registro lo creó entre medio (unique por teléfono): se relee.
        ({ data: existing } = await findByPhone());
        if (!existing) return null;
      }
      const currentName = (existing.name as string | null)?.trim() || null;
      if (name && (!currentName || (opts.overwriteName && currentName !== name))) {
        await db.from('contacts').update({ name }).eq('id', existing.id);
      }
      return existing.id as string;
    }

    const { data: sameName } = await db
      .from('contacts')
      .select('id')
      .is('phone', null)
      .ilike('name', name!.replace(/[%_\\]/g, (c) => `\\${c}`))
      .limit(1);
    if (sameName && sameName.length > 0) return (sameName[0] as { id: string }).id;

    const { data: created } = await db.from('contacts').insert({ name }).select('id').single();
    return (created?.id as string) ?? null;
  } catch (err) {
    console.error('[sales] No se pudo resolver el contacto del cliente:', err);
    return null;
  }
}

// ── Vendedor elegido por el admin ──
// Antes, si el id no se encontraba, la venta quedaba a nombre de quien la
// registraba, sin aviso: la comisión terminaba en la persona equivocada.
async function resolveOverrideSeller(sellerId: string): Promise<{ uid: string; email: string }> {
  const { data, error } = await db.from('profiles').select('email').eq('id', sellerId).maybeSingle();
  if (error) throw error;
  if (!data?.email) {
    throw new BadRequestError('El vendedor elegido no existe o no tiene correo. Elegí otro o recargá la lista.');
  }
  return { uid: sellerId, email: data.email as string };
}

// ── Inventario visto desde una venta que se está editando ──
// Las unidades que la propia venta ya tiene reservadas (o vendidas, si estaba
// aprobada) cuentan como disponibles: se van a devolver antes de volver a
// reservar. Sin esto el editor estimaba el costo y validaba el stock sin esas
// unidades, y editar el precio de una venta que se llevó el último lote
// daba "stock insuficiente".
async function inventoryForEdit(
  orderId: string,
  reservationStatus: 'active' | 'consumed',
): Promise<InventoryRow[]> {
  const [rows, { data, error }] = await Promise.all([
    getCurrentInventory(),
    db
      .from('stock_reservations')
      .select('purchase_id, quantity')
      .eq('order_id', orderId)
      .eq('status', reservationStatus),
  ]);
  if (error) throw error;

  const own = new Map<string, number>();
  for (const r of (data ?? []) as { purchase_id: string; quantity: number }[]) {
    own.set(r.purchase_id, (own.get(r.purchase_id) ?? 0) + Number(r.quantity));
  }

  return rows
    .map((row) => ({ ...row, available: (row.available ?? 0) + (own.get(row.id) ?? 0) }))
    .filter((row) => row.available > 0);
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
        // FIFO, ver inventory.ts): se guarda el nombre de producto en `sku`.
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

// ── Aprobar / Rechazar ──

interface PurchaseEmbed {
  product_name: string;
  coste_final: number | null;
  costo_f_u: number | null;
}

// Consume las reservas (reservado → vendido en purchases, vía inventory.ts) y
// congela el snapshot financiero de Docs/03-Finanzas.md §4 en cada order_item. El costo
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
    // 'consumed' también: si un intento anterior de aprobar se cortó a mitad
    // de camino, esas reservas ya se movieron a vendido pero siguen siendo
    // parte del costo de esta venta.
    .in('status', ['active', 'consumed']);
  if (reservationsError) throw reservationsError;
  const reservations = (reservationRows ?? []) as unknown as {
    quantity: number;
    purchases: PurchaseEmbed | PurchaseEmbed[] | null;
  }[];

  // Cada reserva tiene que corresponder a una línea (por el nombre del lote).
  // Si alguna no calza —un lote renombrado después de registrar la venta—, esa
  // línea se aprobaría con costo 0 y la comisión y los pozos saldrían
  // inflados, congelados así para siempre. Mejor frenar y avisar.
  const itemNames = new Set(items.map((item) => item.sku));
  const orphan = reservations.find((r) => !itemNames.has(firstOfEmbed(r.purchases)?.product_name ?? ''));
  if (orphan) {
    const lotName = firstOfEmbed(orphan.purchases)?.product_name ?? 'sin nombre';
    throw new BadRequestError(
      `No se puede costear la venta: el lote "${lotName}" no coincide con ningún producto de la venta (¿se renombró en Inventario?). Devolvele el nombre original o editá la venta.`,
    );
  }

  // Y cada línea tiene que tener TODAS sus unidades reservadas. Si una edición
  // o un registro se cortó a mitad de camino, la línea quedaría con menos
  // unidades costeadas que vendidas (o con costo 0 si no tiene ninguna).
  const reservedByName = new Map<string, number>();
  for (const r of reservations) {
    const name = firstOfEmbed(r.purchases)?.product_name ?? '';
    reservedByName.set(name, (reservedByName.get(name) ?? 0) + r.quantity);
  }
  const uncovered = items.find((item) => (reservedByName.get(item.sku) ?? 0) < item.quantity);
  if (uncovered) {
    const reserved = reservedByName.get(uncovered.sku) ?? 0;
    throw new BadRequestError(
      `No se puede aprobar: "${uncovered.sku}" tiene ${reserved} de ${uncovered.quantity} unidad(es) reservadas. Editá la venta para volver a reservar el stock, o rechazala.`,
    );
  }

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
    // cadena utilidad→salary→comisión→ganancia (Docs/03-Finanzas.md §4), no se reevalúa.
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

  const { data: approvedRow, error: updateOrderError } = await db
    .from('orders')
    .update({ status: 'approved', week_of: getIsoWeek(new Date()) })
    .eq('id', orderId)
    .eq('status', 'pending_approval') // otra aprobación simultánea ya la cerró
    .select('id')
    .maybeSingle();
  if (updateOrderError) throw updateOrderError;
  if (!approvedRow) return true;

  // Espejo en SharePoint (Docs/04-Comprobantes-SharePoint.md y la sección `spo_outbox` del schema). Solo se
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

  const { data: rejectedRow, error: updateError } = await db
    .from('orders')
    .update({ status: 'rejected' })
    .eq('id', orderId)
    .eq('status', 'pending_approval') // no rechazar una que se aprobó entre medio
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!rejectedRow) throw new BadRequestError('Solo se pueden rechazar ventas pendientes.');

  await releaseReservations(orderId);

  // La factura queda libre para registrar la venta corregida con el mismo
  // ticket. Antes quedaba "ligada" a una venta rechazada para siempre, y la
  // única salida era borrar la venta, que anula la factura.
  const freedInvoice = await unlinkInvoiceFromSale(orderId);

  const { error: auditError } = await db.from('audit_logs').insert({
    entity: 'orders',
    entity_id: orderId,
    action: 'sale_rejected',
    reason: freedInvoice ? `${reason} (factura ${freedInvoice} liberada)` : reason,
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
  /** Suma de `order_items.ganancia_tienda`. `modules/sales/sales-routes.ts` la recorta para no-admins. */
  totalGananciaTienda: number;
  /** Correlativo de la factura con que se registró la venta (`invoices.sale_id`). Null si no tiene. */
  invoiceNumber: number | null;
  /** Código legible de esa factura: `GS-PR-12`. Null si no tiene. */
  invoiceCode: string | null;
  /** Costo de envío si la venta tiene factura con delivery. 0 si no tiene. */
  deliveryFee: number;
  createdAt: string;
  isManualDate?: boolean;
  /** Alguna línea quedó por debajo del margen mínimo. Solo admin: la ruta lo recorta. */
  belowMinMargin?: boolean;
}

/**
 * Una venta con sus líneas. Lo que el drawer de detalle necesita.
 *
 * Las líneas traen la cadena financiera COMPLETA de Docs/03-Finanzas.md §4 (utilidad bruta →
 * salary → utilidad neta → comisión → ganancia) más el reparto en pozos, tal
 * como quedó congelada en `order_items`. No se recalcula nada: Docs/03-Finanzas.md §1 dice
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
    /** El reparto del Costo F/U de esta línea en los 7 pozos (Docs/03-Finanzas.md §2). */
    pozos?: Record<string, number>;
    /** Precio por debajo del margen mínimo. Solo admin: permite despejar el costo. */
    belowMinMargin?: boolean;

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

  const { data: manualDateLogs } = await db
    .from('audit_logs')
    .select('id')
    .eq('entity', 'orders')
    .eq('entity_id', id)
    .eq('action', 'manual_date')
    .limit(1);
  const isManualDate = Boolean(manualDateLogs && manualDateLogs.length > 0);

  const minMargin = (await getFinancialConfig()).minMarginMultiplier ?? 1.15;
  const lineBelowMin = (it: { precio_unit: number | null; coste_final_snap: number | null }) =>
    isBelowMinMargin(it.precio_unit ?? 0, it.coste_final_snap ?? 0, minMargin);

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
    isManualDate,
    belowMinMargin: itemRows.some(lineBelowMin),
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
        belowMinMargin: lineBelowMin(it),
        utilidadBrutaUnit: perUnit(utilidadBruta),
        salaryUnit: perUnit(salary),
        utilidadNetaUnit: perUnit(utilidadNeta),
        comisionUnit: perUnit(comision),
        gananciaTiendaUnit: perUnit(gananciaTienda),
      };
    }),
  };
}

// Ids por consulta en los `.in(...)`: con cientos de ventas la URL de
// PostgREST se pasa de largo y la consulta falla.
const IN_CHUNK = 150;

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let k = 0; k < ids.length; k += IN_CHUNK) {
    const { data, error } = await run(ids.slice(k, k + IN_CHUNK));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

export async function listSales(filters: {
  sellerEmail?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<SaleListItem[]> {
  // Paginado: PostgREST corta en 1000 filas sin avisar, y "Todas" o
  // "Aprobadas" pasan ese número con el tiempo.
  type OrderRow = {
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
  const rows = await fetchAllRows<OrderRow>((from, to) => {
    let query = db
      .from('orders')
      .select('id, status, sale_origin, seller_uid, seller_email, week_of, phone, total, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.sellerEmail) query = query.eq('seller_email', filters.sellerEmail);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    return query.range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: unknown }>;
  });

  // El nombre del vendedor se resuelve con una SEGUNDA query y no con un embed
  // de PostgREST (`profiles!seller_uid(name)`): el embed depende de que
  // PostgREST tenga la FK en su caché de esquema, y cuando no la tiene falla con
  // PGRST200 y se lleva puesto el listado ENTERO. Acá el nombre es un dato
  // secundario — si no se puede resolver, la venta igual tiene que listarse.
  const uids = [...new Set(rows.map((r) => r.seller_uid).filter((id): id is string => !!id))];
  const namesByUid = new Map<string, string>();

  if (uids.length > 0) {
    try {
      const profiles = await inChunks<{ id: string; name: string | null }>(uids, (chunk) =>
        db.from('profiles').select('id, name').in('id', chunk) as unknown as PromiseLike<{
          data: { id: string; name: string | null }[] | null;
          error: unknown;
        }>,
      );
      for (const p of profiles) {
        if (p.name?.trim()) namesByUid.set(p.id, p.name.trim());
      }
    } catch (err) {
      console.error('[sales] No se pudieron resolver los nombres de vendedor:', err);
    }
  }

  // Comisión, fondo y ganancia TOTALES de cada venta (una venta puede tener
  // varias líneas, cada una con su tramo). A diferencia del nombre, acá un
  // error NO se traga: antes una consulta fallida mostraba comisión y ganancia
  // en 0 sin aviso, y las métricas de arriba sumaban de menos.
  const orderIds = rows.map((r) => r.id);
  const salaryByOrderId = new Map<string, number>();
  const comisionByOrderId = new Map<string, number>();
  const gananciaTiendaByOrderId = new Map<string, number>();
  const belowMinByOrderId = new Set<string>();
  if (orderIds.length > 0) {
    const minMargin = (await getFinancialConfig()).minMarginMultiplier ?? 1.15;
    type ItemRow = {
      order_id: string;
      salary: number | null;
      comision: number | null;
      ganancia_tienda: number | null;
      precio_unit: number | null;
      coste_final_snap: number | null;
    };
    const items = await inChunks<ItemRow>(orderIds, (chunk) =>
      db
        .from('order_items')
        .select('order_id, salary, comision, ganancia_tienda, precio_unit, coste_final_snap')
        .in('order_id', chunk) as unknown as PromiseLike<{ data: ItemRow[] | null; error: unknown }>,
    );
    for (const it of items) {
      salaryByOrderId.set(it.order_id, (salaryByOrderId.get(it.order_id) ?? 0) + (it.salary ?? 0));
      comisionByOrderId.set(it.order_id, (comisionByOrderId.get(it.order_id) ?? 0) + (it.comision ?? 0));
      gananciaTiendaByOrderId.set(it.order_id, (gananciaTiendaByOrderId.get(it.order_id) ?? 0) + (it.ganancia_tienda ?? 0));
      if (isBelowMinMargin(it.precio_unit ?? 0, it.coste_final_snap ?? 0, minMargin)) belowMinByOrderId.add(it.order_id);
    }
  }

  // Nº de factura con que se registró cada venta (`invoices.sale_id`). Mismo
  // criterio: si falla, se corta (el total sin delivery depende de esto).
  const invoiceBySaleId = new Map<string, { number: number; code: string; deliveryFee: number }>();
  if (orderIds.length > 0) {
    type InvRow = { sale_id: string | null; invoice_number: number; invoice_code: string | null; delivery_fee: number | null };
    const invoices = await inChunks<InvRow>(orderIds, (chunk) =>
      db
        .from('invoices')
        .select('sale_id, invoice_number, invoice_code, delivery_fee')
        .in('sale_id', chunk) as unknown as PromiseLike<{ data: InvRow[] | null; error: unknown }>,
    );
    for (const inv of invoices) {
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
    // Solo la ve admin/global_admin: modules/sales/sales-routes.ts la recorta para un
    // vendedor común, igual que ya hace con `gananciaTienda` en `/quote` y en
    // el detalle de una venta (getSaleById no la trae en absoluto).
    totalGananciaTienda: gananciaTiendaByOrderId.get(row.id) ?? 0,
    invoiceNumber: invoiceBySaleId.get(row.id)?.number ?? null,
    invoiceCode: invoiceBySaleId.get(row.id)?.code ?? null,
    deliveryFee: invoiceBySaleId.get(row.id)?.deliveryFee ?? 0,
    createdAt: row.created_at,
    belowMinMargin: belowMinByOrderId.has(row.id),
  }));
}

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
