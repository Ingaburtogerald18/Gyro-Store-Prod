export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'gyro:theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** Recupera la preferencia aun si React reconstruyó el elemento <html>. */
export function restoreTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage bloqueado: conservar el tema aplicado o usar el predeterminado.
  }
  const current = document.documentElement.dataset.theme;
  const theme = isTheme(saved) ? saved : isTheme(current) ? current : DEFAULT_THEME;
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage bloqueado: el tema aplica igual, solo no persiste.
  }
}

// Corre antes del primer paint. Mantener la misma validación que restoreTheme;
// el fallback se aplica también cuando localStorage lanza una excepción.
export const THEME_INIT_SCRIPT = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})();`;
