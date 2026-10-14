import { useCallback, useSyncExternalStore } from 'react';
import { decodePreference } from '~/lib/ui-preferences';

const EVENT = 'gyro:preference';
// Storage can be unavailable. Preferences still work for the current session.
const memory = new Map<string, string>();

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useLocalPreference<T>(key: string, fallback: T, validate: (value: unknown) => value is T) {
  const snapshot = useCallback(() => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try { return window.localStorage.getItem(key); }
    catch { return memory.get(key) ?? null; }
  }, [key]);
  // Server and first hydration render always agree, regardless of stored values.
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const setValue = useCallback((value: T) => {
    const serialized = JSON.stringify(value);
    try { window.localStorage.setItem(key, serialized); memory.delete(key); }
    catch { memory.set(key, serialized); }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [decodePreference(raw, fallback, validate), setValue] as const;
}
