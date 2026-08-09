// Cadena de costeo del inventario (doc 11 §1-3). Funciones puras, sin DB ni
// Express: dado el detalle de una compra al recibirla y la configuración
// financiera vigente, derivan costo real → Costo F/U → 7 pozos → coste final →
// PVP sugerido. `services/inventory.ts` las invoca al procesar una llegada y
// persiste el resultado en `purchases`/`products`.
import type { FinancialConfig } from '../../shared/schemas';

type Pozos = FinancialConfig['pozos'];

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Busca el tramo aplicable en una escala por `maxCost` (`null` = catch-all).
// No asume que `scale` venga ordenada: la ordena antes de buscar.
function findTier<T extends { maxCost: number | null }>(scale: T[], value: number): T {
  const sorted = [...scale].sort((a, b) => (a.maxCost ?? Infinity) - (b.maxCost ?? Infinity));
  const tier = sorted.find((t) => t.maxCost === null || value <= t.maxCost);
  if (!tier) {
    throw new Error(`No hay tramo configurado que cubra el valor ${value}.`);
  }
  return tier;
}

export interface PurchaseCostInput {
  quantity: number;
  costoChinaUsd: number;
  impuestoUnitUsd: number;
  envioUnitUsd: number;
  // Se congela por lote al recibir (doc 11 regla 4): quien llama pasa la tasa
  // vigente en ese momento, esta función no la lee de ningún lado.
  exchangeRate: number;
}

export interface CostoReal {
  preTotalUsd: number;
  totalCompraUsd: number;
  costoUnitOrigenUsd: number;
  costoRealUsd: number;
  costoRealCs: number;
}

// Doc 11 §1: Pre-Total → Total compra → Costo unitario origen → Costo real (USD/C$).
export function computeCostoReal(input: PurchaseCostInput): CostoReal {
  const { quantity, costoChinaUsd, impuestoUnitUsd, envioUnitUsd, exchangeRate } = input;

  const preTotalUsd = quantity * costoChinaUsd;
  const totalCompraUsd = preTotalUsd + quantity * impuestoUnitUsd;
  const costoUnitOrigenUsd = totalCompraUsd / quantity;
  const costoRealUsd = costoUnitOrigenUsd + envioUnitUsd;
  const costoRealCs = costoRealUsd * exchangeRate;

  return {
    preTotalUsd: round(preTotalUsd, 4),
    totalCompraUsd: round(totalCompraUsd, 4),
    costoUnitOrigenUsd: round(costoUnitOrigenUsd, 4),
    costoRealUsd: round(costoRealUsd, 4),
    costoRealCs: round(costoRealCs, 2),
  };
}

// Doc 11 §2: Costo Fijo Unitario por tramo de Costo real (C$).
export function computeCostoFU(costoRealCs: number, scale: FinancialConfig['costoFUScale']): number {
  return findTier(scale, costoRealCs).amount;
}

// Doc 11 §2: el Costo F/U se reparte en los 7 pozos según sus %. La suma de
// los % ya está validada al 100% por `financialConfigSchema`, así que el
// reparto cierra con `costoFU` salvo el redondeo a centavos de cada pozo.
export function distributePozos(costoFU: number, pozos: Pozos): Pozos {
  return {
    publicidad: round(costoFU * pozos.publicidad, 2),
    mantenimiento: round(costoFU * pozos.mantenimiento, 2),
    utiles: round(costoFU * pozos.utiles, 2),
    garantias: round(costoFU * pozos.garantias, 2),
    prestamos: round(costoFU * pozos.prestamos, 2),
    suscripciones: round(costoFU * pozos.suscripciones, 2),
    servicios: round(costoFU * pozos.servicios, 2),
  };
}

// Doc 11 §2: Coste final = Costo real (C$) + Costo F/U.
export function computeCosteFinal(costoRealCs: number, costoFU: number): number {
  return round(costoRealCs + costoFU, 2);
}

// Doc 11 §3: PVP sugerido = Coste final / (1 − margen), margen por tramo de
// Coste final. El tramo "< 50" del doc es un error de negocio (no vender tan
// barato); la salvaguarda vive en el dato de config (margin: 0 en ese tramo),
// no acá — esta función solo aplica el tramo que le llegue.
export function computePrecioSugerido(costeFinal: number, scale: FinancialConfig['marginScale']): number {
  const { margin } = findTier(scale, costeFinal);
  return round(costeFinal / (1 - margin), 2);
}

export interface PurchaseCosting extends CostoReal {
  costoFU: number;
  pozos: Pozos;
  costeFinal: number;
  precioSugerido: number;
}

// Encadena todo lo anterior: lo que `inventory.ts` llama al recibir una compra.
export function costPurchaseOnArrival(
  input: PurchaseCostInput,
  config: FinancialConfig,
): PurchaseCosting {
  const costoReal = computeCostoReal(input);
  const costoFU = computeCostoFU(costoReal.costoRealCs, config.costoFUScale);
  const pozos = distributePozos(costoFU, config.pozos);
  const costeFinal = computeCosteFinal(costoReal.costoRealCs, costoFU);
  const precioSugerido = computePrecioSugerido(costeFinal, config.marginScale);

  return { ...costoReal, costoFU, pozos, costeFinal, precioSugerido };
}
