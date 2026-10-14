// `data-theme` en <html> es la fuente visual; Redux solo lo refleja. El script anti-flash de root.tsx
// aplica el tema antes del primer paint.
import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectTheme, themeSet, type Theme } from '~/state/slices/ui-slice';
import { applyTheme, isTheme, restoreTheme } from '~/lib/theme';

export { THEME_STORAGE_KEY } from '~/lib/theme';

export function useTheme() {
  const theme = useAppSelector(selectTheme);
  const dispatch = useAppDispatch();

  const setTheme = useCallback(
    (next: Theme) => {
      applyTheme(next);
      dispatch(themeSet(next));
    },
    [dispatch],
  );

  const toggleTheme = useCallback(() => {
    // Leer el tema aplicado evita alternar desde un estado Redux desfasado.
    const current = document.documentElement.dataset.theme;
    const applied = isTheme(current) ? current : restoreTheme();
    setTheme(applied === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
