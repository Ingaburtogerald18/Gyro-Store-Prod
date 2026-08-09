// PostgREST devuelve una relación embebida many-to-one como objeto o como
// array de un elemento según cómo detecte la FK — este normalizador cubre
// ambos casos. Único lugar para ese patrón (antes vivía copiado en
// adminCatalog.ts, sales.ts e installments.ts).
export function firstOfEmbed<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
