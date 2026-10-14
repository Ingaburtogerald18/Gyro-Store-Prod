// Cadena utilidad → salary → comisión → ganancia + mayoreo (Docs/03-Finanzas.md §4-5).
// Funciones puras, sin DB ni Express — mismo espíritu que costing.ts. Se usan
// tanto para el cotizador (estimación) como para la aprobación (snapshot que
// se congela en order_items): misma función, dos momentos distintos.
//
// Sin utilidad no hay comisión. El tramo se busca por la utilidad neta de la
// línea, no por el total de la venta (Docs/03-Finanzas.md §4).
import type { FinancialConfig } from '../../../shared/schemas';
import { distributePozos, round } from '../finance/costing';

// ── Mayoreo (Docs/03-Finanzas.md §5) ──

export interface WholesaleResult {
  price: number;
  discountPercent: number;
  // Desde el tramo más alto configurado, el servidor avisa en vez de aplicar
  // el descuento a ciegas ("mejor hacé una cotización"). Se deriva del tramo
  // más alto en vez de hardcodear "12": Docs/03-Finanzas.md §9 dice que estos tramos son
  // editables desde el panel, así que el aviso debe moverse con ellos.
  warning: boolean;
}

// Se aplica el tramo con el `minQty` más alto que la cantidad todavía cumple
// (Docs/03-Finanzas.md §5: "se aplica el tramo más alto que cumpla"). El descuento pega
// sobre el precio BASE/tentativo del producto, nunca sobre el sugerido
// matemático (Docs/03-Finanzas.md §5, decisión §10.2).
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

// Reciclado de v1 (calcularComisionYPorcentaje): sin utilidad neta positiva no
// hay comisión — pagar sobre una pérdida no tiene sentido de negocio, y la
// tabla de Docs/03-Finanzas.md §4 no cubre valores ≤ 0 explícitamente.
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

  // ── La misma cadena, POR UNIDAD ──
  // El desglose del panel muestra ambas columnas, y el tramo de comisión sale
  // del valor unitario: sin exponerlo, el porcentaje parecería salir de la nada.
  utilidadBrutaUnit: number;
  salaryUnit: number;
  utilidadNetaUnit: number;
  comisionUnit: number;
  gananciaTiendaUnit: number;
}

// Docs/03-Finanzas.md §4: Utilidad bruta → Salary (20%) → Utilidad neta → Comisión (tramo
// por Utilidad neta) → Ganancia tienda. Los pozos se recogen del Costo F/U de
// las unidades de esta línea (Docs/03-Finanzas.md §2).
//
// ── El tramo se busca por la utilidad neta de UNA UNIDAD ──
// Antes se buscaba por la utilidad neta de la línea COMPLETA (ya multiplicada),
// y eso castigaba el volumen: vender 5 unidades juntas empujaba la utilidad a un
// tramo más alto y le BAJABA el porcentaje al vendedor. Ahora la cadena se
// calcula por unidad y recién al final se multiplica, así que el porcentaje no
// depende de cuántas unidades entren en la misma línea.
//
// Con cantidad 1 ambos métodos dan idéntico — por eso las planillas históricas
// de referencia (todas de cantidad 1) siguen cuadrando.
//
// ── Redondeo ──
// La cadena unitaria se calcula SIN redondear y se redondea al presentar. Dos
// excepciones deliberadas:
//   · `utilidadNetaUnit` se redondea ANTES de buscar el tramo, para que el
//     tramo sea reproducible y no dependa de decimales invisibles cuando el
//     valor cae justo en el borde (200.001 vs 200.00).
//   · El último término de cada identidad se deriva por RESTA en vez de
//     redondearse aparte, para que las filas del panel cierren exactamente:
//         utilidadNeta   === utilidadBruta − salary
//         gananciaTienda === utilidadNeta  − comision
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

  // ── Totales ──
  // Se multiplica el valor SIN redondear y se redondea el total: redondear cada
  // unitario y luego multiplicar acumularía deriva con cantidades altas.
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
  // El precio que manda es EL DEL FORMULARIO.
  //
  // Mayoreo RETIRADO: el descuento por volumen ya NO se aplica ni se avisa. Los
  // descuentos ahora se dan con un código de descuento al facturar. Se conservan
  // `applyWholesaleDiscount` y la config (`wholesaleDiscounts`) dormidos, para
  // reactivarlo restaurando la rama `input.applyWholesale === true`.
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
