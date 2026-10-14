// Recepción de una orden en Nicaragua: simulación y alta de los lotes en bodega.
import { db } from '../../core/supabase';
import { getFinancialConfig } from '../settings/app-config';
import { costPurchaseOnArrival, round, type PurchaseCosting } from '../finance/costing';
import { BadRequestError } from '../../utils/http-error';
import type { ReceivePurchaseOrderInput, SimulatePurchaseOrderReceiptInput } from '../../../shared/schemas';
import { requireOrdersTable } from './purchase-order-common';
import { audit } from './purchase-order-edits';

interface ReceiptLineRow {
  id: string;
  order_id: string;
  code: string;
  product_name: string;
  status: string;
  quantity: number;
  quantity_sold: number;
  quantity_reserved: number;
  costo_china_usd: number | string | null;
  impuesto_unit_usd: number | string | null;
  suggested_price: number | string | null;
}

interface ReceiptPlanLine {
  purchaseId: string;
  orderId: string;
  code: string;
  productName: string;
  ordered: number;
  received: number;
  salePrice?: number;
  previousSuggestedPrice: number | null;
  costing: PurchaseCosting;
}

interface ReceiptPlan {
  lines: ReceiptPlanLine[];
  totalUnits: number;
  shippingUnit: number;
  exchangeRate: number;
}

/** La orden de la ruta más las que llegaron en el mismo envío, sin repetir. */
function receiptOrderIds(orderId: string, extra: string[] | undefined): string[] {
  return [...new Set([orderId, ...(extra ?? [])])];
}

/**
 * Valida lo recibido y costea cada línea. El envío se reparte entre todas las unidades de la llegada,
 * de todas las órdenes del envío.
 */
async function planReceipt(orderIds: string[], input: SimulatePurchaseOrderReceiptInput): Promise<ReceiptPlan> {
  await requireOrdersTable();
  const { data: rows, error } = await db
    .from('purchases')
    .select('id, order_id, code, product_name, status, quantity, quantity_sold, quantity_reserved, costo_china_usd, impuesto_unit_usd, suggested_price')
    .in('order_id', orderIds);
  if (error) throw error;
  const byId = new Map(((rows ?? []) as ReceiptLineRow[]).map((row) => [row.id, row]));
  if (byId.size === 0) throw new BadRequestError('La orden no existe o no tiene productos.');

  const seen = new Set<string>();
  for (const line of input.lines) {
    const row = byId.get(line.purchaseId);
    if (!row) throw new BadRequestError('Uno de los productos no pertenece a las órdenes de este envío.');
    if (seen.has(line.purchaseId)) throw new BadRequestError(`${row.code} viene repetido.`);
    seen.add(line.purchaseId);
    if (row.status === 'received') throw new BadRequestError(`${row.code} ya fue recibido.`);
    const committed = row.quantity_sold + row.quantity_reserved;
    if (line.receivedQuantity < committed) {
      throw new BadRequestError(`${row.code} ya tiene ${committed} unidad(es) apartadas: no puede recibir menos.`);
    }
  }

  const totalUnits = input.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const shippingUnit = totalUnits > 0 ? round(input.shippingTotalUsd / totalUnits, 4) : 0;
  const config = await getFinancialConfig();
  const exchangeRate = input.exchangeRate ?? config.exchangeRate;

  const lines = input.lines.map((line): ReceiptPlanLine => {
    const row = byId.get(line.purchaseId)!;
    return {
      purchaseId: row.id,
      orderId: row.order_id,
      code: row.code,
      productName: row.product_name,
      ordered: row.quantity,
      received: line.receivedQuantity,
      salePrice: line.salePrice,
      previousSuggestedPrice: row.suggested_price == null ? null : Number(row.suggested_price),
      costing: costPurchaseOnArrival(
        {
          quantity: line.receivedQuantity,
          costoChinaUsd: Number(row.costo_china_usd ?? 0),
          impuestoUnitUsd: Number(row.impuesto_unit_usd ?? 0),
          envioUnitUsd: shippingUnit,
          exchangeRate,
        },
        config,
      ),
    };
  });

  return { lines, totalUnits, shippingUnit, exchangeRate };
}

export interface ReceiptPreview {
  totalUnits: number;
  shippingUnit: number;
  exchangeRate: number;
  lines: {
    purchaseId: string;
    code: string;
    productName: string;
    ordered: number;
    received: number;
    costoRealCs: number;
    costeFinal: number;
    precioSugerido: number;
  }[];
}

/** Lo que costaría cada línea con este envío y tasa, sin guardar nada. */
export async function simulatePurchaseOrderReceipt(
  orderId: string,
  input: SimulatePurchaseOrderReceiptInput,
): Promise<ReceiptPreview> {
  const plan = await planReceipt(receiptOrderIds(orderId, input.extraOrderIds), input);
  return {
    totalUnits: plan.totalUnits,
    shippingUnit: plan.shippingUnit,
    exchangeRate: plan.exchangeRate,
    lines: plan.lines.map((line) => ({
      purchaseId: line.purchaseId,
      code: line.code,
      productName: line.productName,
      ordered: line.ordered,
      received: line.received,
      costoRealCs: line.costing.costoRealCs,
      costeFinal: line.costing.costeFinal,
      precioSugerido: line.costing.precioSugerido,
    })),
  };
}

/**
 * Pasa a bodega lo recibido con el costeo y la tasa congelada. Cada UPDATE exige que la línea siga
 * en tránsito (nadie la recibe dos veces); si una falla, se deshacen las anteriores.
 */
export async function receivePurchaseOrder(
  orderId: string,
  input: ReceivePurchaseOrderInput,
  authorUid?: string,
): Promise<{ received: number; shippingUnit: number; exchangeRate: number }> {
  const orderIds = receiptOrderIds(orderId, input.extraOrderIds);
  const plan = await planReceipt(orderIds, input);
  const done: ReceiptPlanLine[] = [];

  try {
    for (const line of plan.lines) {
      const { costing } = line;
      const { data, error } = await db
        .from('purchases')
        .update({
          status: 'received',
          arrival_date: input.arrivalDate,
          envio_unit_usd: plan.shippingUnit,
          exchange_rate: plan.exchangeRate,
          costo_real_usd: costing.costoRealUsd,
          costo_real_cs: costing.costoRealCs,
          costo_f_u: costing.costoFU,
          coste_final: costing.costeFinal,
          suggested_price: line.salePrice ?? costing.precioSugerido,
          quantity: line.received,
          quantity_ordered: line.received === line.ordered ? null : line.ordered,
        })
        .eq('id', line.purchaseId)
        .eq('status', 'china')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new BadRequestError(`${line.code} ya fue recibido por otra persona. Recargá la página.`);
      }
      done.push(line);
    }
  } catch (err) {
    for (const line of done) {
      await db
        .from('purchases')
        .update({
          status: 'china',
          arrival_date: null,
          envio_unit_usd: 0,
          exchange_rate: null,
          costo_real_usd: null,
          costo_real_cs: null,
          costo_f_u: null,
          coste_final: null,
          suggested_price: line.previousSuggestedPrice,
          quantity: line.ordered,
          quantity_ordered: null,
        })
        .eq('id', line.purchaseId);
    }
    throw err;
  }

  // Una entrada por orden, con sus líneas y el envío completo del que formó parte.
  for (const id of orderIds) {
    const lines = plan.lines.filter((l) => l.orderId === id);
    if (lines.length === 0) continue;
    await audit(id, 'receive', authorUid, null, {
      arrivalDate: input.arrivalDate,
      shippingTotalUsd: input.shippingTotalUsd,
      shippingUnit: plan.shippingUnit,
      exchangeRate: plan.exchangeRate,
      shipmentOrderIds: orderIds,
      lines: lines.map((l) => ({ code: l.code, ordered: l.ordered, received: l.received, salePrice: l.salePrice ?? l.costing.precioSugerido })),
    });
  }

  return { received: done.length, shippingUnit: plan.shippingUnit, exchangeRate: plan.exchangeRate };
}
