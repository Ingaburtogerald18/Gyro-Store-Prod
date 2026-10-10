import type { VariantMappings } from '../../shared/schemas';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

// Mapeo variante → códigos de lote. Acepta la forma vieja de v1 (`skus`/`sku`,
// cuando el vínculo era contra un SKU compartido) para que los datos migrados
// sigan apareciendo en el editor en vez de verse como "sin vincular".
export function toVariantMappings(value: unknown): VariantMappings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: VariantMappings = {};
  for (const [combo, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const codes = [
      ...toStringArray(entry.codes),
      ...toStringArray(entry.skus),
      ...(typeof entry.sku === 'string' && entry.sku ? [entry.sku] : []),
    ];
    const price = positive(entry.price);
    const promoPrice = positive(entry.promoPrice);
    if (!codes.length && price === undefined && promoPrice === undefined) continue;
    out[combo] = {
      codes: [...new Set(codes)],
      ...(price !== undefined && { price }),
      ...(promoPrice !== undefined && { promoPrice }),
    };
  }
  return out;
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

// El editor no tiene campo de oferta por variante: si no manda promoPrice, se
// conserva el que ya estaba guardado en vez de borrarlo.
export function keepVariantPromos(next: VariantMappings, saved: VariantMappings): VariantMappings {
  const out: VariantMappings = {};
  for (const [combo, entry] of Object.entries(next)) {
    const savedPromo = saved[combo]?.promoPrice;
    out[combo] = entry.promoPrice === undefined && savedPromo !== undefined
      ? { ...entry, promoPrice: savedPromo }
      : entry;
  }
  return out;
}
