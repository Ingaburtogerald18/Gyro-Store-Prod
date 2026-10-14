// Utilidad → salario → comisión → ganancia, y mayoreo (Docs/03-Finanzas.md §4-5). Funciones puras,
// las mismas para el cotizador y para el snapshot al aprobar.
import type { FinancialConfig } from '../../../shared/schemas';
import { distributePozos, round } from '../finance/costing';

// ── Mayoreo (Docs/03-Finanzas.md §5) ──

export interface WholesaleResult {
  price: number;
  discountPercent: number;
  // Desde el tramo más alto se avisa («mejor hacé una cotización»). Se deriva de la configuración
  // porque los tramos se editan en el panel.
  warning: boolean;
}

// Aplica el tramo más alto que cumple la cantidad, sobre el precio cargado (Docs/03-Finanzas.md §5).
export function applyWholesaleDiscount(
  price: number,
  quantity: number,
  tiers: FinancialConfig['wholesaleDiscounts'],
): WholesaleResult {
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  const topTier = sorted[0];
  const tier = sorted.find((t) => quantity >= t.minQty);
  const discount = tier?.discount ?? 0;

  return {
    price: round(price * (1 - discount), 2),
    discountPercent: discount,
    warning: topTier !== undefined && quantity >= topTier.minQty,
  };
}

// ── Comisión (Docs/03-Finanzas.md §4) ──

function findCommissionTier(
  scale: FinancialConfig['commissionScale'],
  utilidadNeta: number,
): FinancialConfig['commissionScale'][number] {
  const sorted = [...scale].sort((a, b) => (a.maxProfit ?? Infinity) - (b.maxProfit ?? Infinity));
  const tier = sorted.find((t) => t.maxProfit === null || utilidadNeta <= t.maxProfit);
  if (!tier) {
    throw new Error(`No hay tramo de comisión configurado que cubra la utilidad neta ${utilidadNeta}.`);
  }
  return tier;
}

// Sin utilidad neta positiva no hay comisión: pagar sobre una pérdida no tiene sentido.
export function computeCommissionPercent(
  utilidadNeta: number,
  scale: FinancialConfig['commissionScale'],
): number {
  if (utilidadNeta <= 0) return 0;
  return findCommissionTier(scale, utilidadNeta).margin;
}

export interface LineCommissionInput {
  precioUnit: number;
  quantity: number;
  // C$, del lote FIFO consumido para esta línea (o promedio ponderado si
  // abarcó más de un lote — eso lo resuelve sales-approval.ts, no este archivo).
  costeFinal: number;
  // C$, ídem, para el reparto en los 7 pozos.
  costoFU: number;
}

export interface LineCommission {
  // ── Totales de la línea (unitario × cantidad) ──
  /** Costo real de TODAS las unidades. */
  costoTotal: number;
  utilidadBruta: number;
  salary: number;
  utilidadNeta: number;
  comision: number;
  comisionPercent: number;
  gananciaTienda: number;
  pozos: FinancialConfig['pozos'];

  // La misma cadena por unidad: el tramo sale del valor unitario y el panel lo muestra.
  utilidadBrutaUnit: number;
  salaryUnit: number;
  utilidadNetaUnit: number;
  comisionUnit: number;
  gananciaTiendaUnit: number;
}

// El tramo se busca por la utilidad neta de una unidad: por línea completa, vender más unidades juntas
// bajaba el porcentaje. Se redondea antes de buscar el tramo y el último término sale por resta.
export function computeLineCommission(input: LineCommissionInput, config: FinancialConfig): LineCommission {
  const { precioUnit, costeFinal, quantity } = input;

  // ── Cadena por unidad (sin redondear hasta el final) ──
  const utilidadBrutaUnitRaw = precioUnit - costeFinal;
  const salaryUnitRaw = utilidadBrutaUnitRaw * config.salaryPercentage;

  const utilidadBrutaUnit = round(utilidadBrutaUnitRaw, 2);
  const salaryUnit = round(salaryUnitRaw, 2);
  // Se deriva por resta de los ya redondeados: es el número que el panel muestra
  // Y el que decide el tramo, así que tiene que ser el mismo en los dos lados.
  const utilidadNetaUnit = round(utilidadBrutaUnit - salaryUnit, 2);

  const comisionPercent = computeCommissionPercent(utilidadNetaUnit, config.commissionScale);

  const comisionUnit = round(utilidadNetaUnit * comisionPercent, 2);
  const gananciaTiendaUnit = round(utilidadNetaUnit - comisionUnit, 2);

  // Se multiplica sin redondear y se redondea el total: redondear cada unitario acumularía deriva.
  const costoTotal = round(costeFinal * quantity, 2);
  const utilidadBruta = round(utilidadBrutaUnitRaw * quantity, 2);
  const salary = round(salaryUnitRaw * quantity, 2);
  const utilidadNeta = round(utilidadBruta - salary, 2);
  const comision = round(utilidadNeta * comisionPercent, 2);
  const gananciaTienda = round(utilidadNeta - comision, 2);

  const pozos = distributePozos(round(input.costoFU * quantity, 2), config.pozos);

  return {
    costoTotal,
    utilidadBruta,
    salary,
    utilidadNeta,
    comision,
    comisionPercent,
    gananciaTienda,
    pozos,
    utilidadBrutaUnit,
    salaryUnit,
    utilidadNetaUnit,
    comisionUnit,
    gananciaTiendaUnit,
  };
}

// ── Snapshot completo de línea (listo para order_items) ──

export interface OrderLineSnapshotInput {
  sku: string;
  quantity: number;
  // Precio base/tentativo del producto, ANTES de mayoreo.
  basePrice: number;
  costeFinal: number;
  costoFU: number;
  // El mayoreo es herramienta del cotizador (Docs/03-Finanzas.md §5), no automático:
  // quien llama decide si esta línea lo aplica. Default true.
  applyWholesale?: boolean;
}

export interface OrderLineSnapshot extends LineCommission {
  sku: string;
  quantity: number;
  precioUnit: number;
  costeFinalSnap: number;
  wholesale: { discountPercent: number; warning: boolean };
}

export function computeOrderLineSnapshot(
  input: OrderLineSnapshotInput,
  config: FinancialConfig,
): OrderLineSnapshot {
  // Manda el precio del formulario. El mayoreo está apagado: los descuentos van con código al facturar.
  // Para reactivarlo, volver a usar applyWholesaleDiscount cuando `input.applyWholesale` sea true.
  const wholesale = { price: round(input.basePrice, 2), discountPercent: 0, warning: false };

  const commission = computeLineCommission(
    {
      precioUnit: wholesale.price,
      quantity: input.quantity,
      costeFinal: input.costeFinal,
      costoFU: input.costoFU,
    },
    config,
  );

  return {
    sku: input.sku,
    quantity: input.quantity,
    precioUnit: wholesale.price,
    costeFinalSnap: input.costeFinal,
    wholesale: { discountPercent: wholesale.discountPercent, warning: wholesale.warning },
    ...commission,
  };
}
