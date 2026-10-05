export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'gyro:theme';
/** Rutas del panel y del acceso del personal (mismo criterio que `areaFor` en root.tsx). */
const ADMIN_PATH = /^\/(admin|login|auth)(\/|$)/;

/** Tema por defecto según el área, cuando la persona todavía no eligió uno.
 *  La tienda arranca en claro (el logo es blanco y luminoso, y las fotos de
 *  producto traen fondos claros); el panel sigue en oscuro. */
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

// Corre antes del primer paint. Mantener la misma validación que restoreTheme y
// el mismo criterio de área que defaultThemeFor (acá sin regex: dentro de un
// template literal las barras escapadas se pierden). El fallback se aplica
// también cuando localStorage lanza una excepción.
export const THEME_INIT_SCRIPT = `(function(){var t=["admin","login","auth"].indexOf(location.pathname.split("/")[1])>-1?"dark":"light";try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})();`;
