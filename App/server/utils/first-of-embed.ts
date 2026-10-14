// PostgREST devuelve una relación many-to-one como objeto o como array de uno, según detecte la FK.
export function firstOfEmbed<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
