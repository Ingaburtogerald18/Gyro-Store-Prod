export type TableDensity = 'normal' | 'compact';
export const DENSITY_KEY = 'gyro.table.density';
export const isDensity = (value: unknown): value is TableDensity => value === 'normal' || value === 'compact';
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === 'string');

export function isVisibility(value: unknown): value is Record<string, boolean> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'boolean');
}

export interface TableView {
  search?: string;
  sorting: { id: string; desc: boolean }[];
  columns: Record<string, boolean>;
}

export function isTableView(value: unknown): value is TableView {
  if (!value || typeof value !== 'object') return false;
  const view = value as TableView;
  return (view.search === undefined || typeof view.search === 'string') && isVisibility(view.columns) &&
    Array.isArray(view.sorting) && view.sorting.every((sort) =>
      !!sort && typeof sort.id === 'string' && typeof sort.desc === 'boolean');
}

/** Keep old plain-string density values compatible. Other preferences use JSON. */
export function decodePreference<T>(raw: string | null, fallback: T, validate: (value: unknown) => value is T): T {
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return validate(value) ? value : fallback;
  } catch {
    return validate(raw) ? raw : fallback;
  }
}
