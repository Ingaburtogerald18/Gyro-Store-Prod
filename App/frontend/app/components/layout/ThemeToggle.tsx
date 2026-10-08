// Interruptor de tema claro/oscuro para el topbar del admin.
//
// El hook `useTheme` existía desde el Hito 1 pero no estaba expuesto en ninguna
// parte del panel: el tema claro estaba completo y calibrado, y no había forma
// de llegar a él sin abrir las herramientas del navegador.
import { Moon02Icon, Sun01Icon } from '@hugeicons/core-free-icons';

import { HugeIcon } from '~/components/ui/icon';
import { useTheme } from '~/hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // El label dice a dónde VA, no dónde está: es lo que el usuario necesita
      // saber antes de apretar.
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
      className="grid size-11 place-items-center rounded-xl border border-border bg-card text-primary-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <HugeIcon icon={isDark ? Sun01Icon : Moon02Icon} size={18} strokeWidth={2} />
    </button>
  );
}
