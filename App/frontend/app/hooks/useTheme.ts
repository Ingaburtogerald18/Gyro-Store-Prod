// Theming dark/light (doc 09 ítem 41, doc 05 §7). El atributo `data-theme` en
// <html> es la fuente visual (los tokens CSS flipean con él); Redux solo lo
// refleja para que cualquier componente pueda leerlo. El script anti-flash de
// root.tsx aplica el tema guardado ANTES del primer paint.
import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectTheme, themeSet, type Theme } from '~/store/slices/uiSlice';

export const THEME_STORAGE_KEY = 'gyro:theme';

export function useTheme() {
  const theme = useAppSelector(selectTheme);
  const dispatch = useAppDispatch();

  // Al montar, sincroniza Redux con lo que el script anti-flash ya dejó en <html>.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if ((current === 'light' || current === 'dark') && current !== theme) {
      dispatch(themeSet(current));
    }
    // Solo al montar: después el flujo es setTheme → DOM, nunca al revés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const setTheme = useCallback(
    (next: Theme) => {
      dispatch(themeSet(next));
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage bloqueado: el tema aplica igual, solo no persiste.
      }
    },
    [dispatch],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme };
}
