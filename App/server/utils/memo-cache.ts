// Copia en memoria con vencimiento y sin consultas duplicadas: dos visitas a la vez esperan la misma
// lectura. Un error no se guarda, y un techo de entradas evita que ids inventados llenen la memoria.
const memos = new Set<{ clear(): void }>();

export function createMemo(ttlMs: number, maxEntries = 500) {
  const entries = new Map<string, { at: number; value: Promise<unknown> }>();

  const memo = {
    get<T>(key: string, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;

      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      const value = load();
      entries.set(key, { at: Date.now(), value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
  memos.add(memo);
  return memo;
}

/** Borra todas las copias: lo llama index.ts después de cada escritura que sale bien. */
export function clearMemos() {
  for (const memo of memos) memo.clear();
}
