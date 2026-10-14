export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'gyro:theme';
/** Rutas del panel y del acceso del personal (mismo criterio que `areaFor` en root.tsx). */
const ADMIN_PATH = /^\/(admin|login|auth)(\/|$)/;

/** La tienda arranca en claro (logo y fotos claras) y el panel en oscuro, si la persona no eligió. */
export function defaultThemeFor(pathname: string): Theme {
  return ADMIN_PATH.test(pathname) ? 'dark' : 'light';
}

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

// Corre antes del primer paint, con la misma validación que restoreTheme (sin regex: en un template
// literal las barras escapadas se pierden). Si localStorage lanza, usa el valor por defecto.
export const THEME_INIT_SCRIPT = `(function(){var t=["admin","login","auth"].indexOf(location.pathname.split("/")[1])>-1?"dark":"light";try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})();`;
