// Lo que ofrece el header de la tienda. El menú de escritorio, el avatar y el ☰ del celular leen de
// acá: cambian la presentación, no la lista.
import {
  CustomerSupportIcon,
  DashboardSquare01Icon,
  Edit02Icon,
  GridViewIcon,
  Login03Icon,
  Mail01Icon,
  PackageIcon,
  PackageMovingIcon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons';
import { categoryMode, type LandingConfig } from '@shared/schemas';
import { CATALOG_PATH, categoriesWithProducts } from './catalog-query';
import { isAdminRole, isStaffRole } from './roles';
import { STORE_PAGES } from './store-pages';

export const CATALOG_LINK = { label: 'Todo el catálogo', to: CATALOG_PATH, icon: GridViewIcon } as const;

// «Mis pedidos» no pide cuenta: lista los de este navegador y busca por número y teléfono.
export const STORE_LINKS = [
  { label: 'Mis pedidos', to: STORE_PAGES.orders, icon: PackageIcon },
  { label: 'Ayuda', to: STORE_PAGES.help, icon: CustomerSupportIcon },
  { label: 'Compras por mayor', to: STORE_PAGES.wholesale, icon: PackageMovingIcon },
  { label: 'Contacto', to: STORE_PAGES.contact, icon: Mail01Icon },
] as const;

// Solo sin sesión del personal; con sesión van sus herramientas. Dice que es del equipo para que nadie
// crea que comprar o consultar un pedido pide cuenta.
export const STAFF_ACCESS = {
  label: 'Acceso del personal',
  hint: 'Solo para el equipo de la tienda',
  to: '/login',
  icon: Login03Icon,
} as const;

export type StaffAction =
  | { id: 'admin' | 'profile'; label: string; to: string; icon: typeof PackageIcon }
  | { id: 'editor'; label: string; icon: typeof PackageIcon };

const ADMIN_CENTER: StaffAction = { id: 'admin', label: 'Centro de administración', to: '/admin', icon: DashboardSquare01Icon };
// Abre el editor completo (Portada, Productos, Combos y Carrito), no solo la portada.
const STORE_EDITOR: StaffAction = { id: 'editor', label: 'Editar tienda', icon: Edit02Icon };
const PROFILE: StaffAction = { id: 'profile', label: 'Mi perfil', to: '/admin/mi-perfil', icon: UserCircleIcon };

/** Herramientas del personal; vacío para visitantes y clientes. El editor se abre desde la portada. */
export function staffActions(role: string | null | undefined, { onHome }: { onHome: boolean }): StaffAction[] {
  if (!isStaffRole(role)) return [];
  return isAdminRole(role) && onHome ? [ADMIN_CENTER, STORE_EDITOR, PROFILE] : [ADMIN_CENTER, PROFILE];
}

/**
 * Categorías del header según la zona que eligió el dueño (automática, elegidas u oculta), sin las
 * que no tienen productos. No se recorta: lo que no entra en la fila va a «Más categorías».
 */
export function headerCategories<T extends { id: string }>(
  landing: Pick<LandingConfig, 'headerCategories' | 'headerCategoriesMode'> | null | undefined,
  categories: T[],
  counts: Record<string, number> | undefined,
): T[] {
  const mode = categoryMode(landing?.headerCategoriesMode, landing?.headerCategories);
  if (mode === 'hidden') return [];
  const chosen = mode === 'auto'
    ? categories
    : (landing?.headerCategories ?? [])
        .map((id) => categories.find((c) => c.id === id))
        .filter((c): c is T => Boolean(c));
  return categoriesWithProducts(chosen, counts);
}

/**
 * Categorías del ☰ del celular: las del header y, si el dueño eligió algunas, después las demás que tienen
 * productos (una categoría nueva no queda sin acceso en el celular). Con la zona oculta, ninguna.
 */
export function menuCategories<T extends { id: string }>(
  landing: Pick<LandingConfig, 'headerCategories' | 'headerCategoriesMode'> | null | undefined,
  categories: T[],
  counts: Record<string, number> | undefined,
): T[] {
  const header = headerCategories(landing, categories, counts);
  if (categoryMode(landing?.headerCategoriesMode, landing?.headerCategories) !== 'custom') return header;
  const shown = new Set(header.map((c) => c.id));
  return [...header, ...categoriesWithProducts(categories, counts).filter((c) => !shown.has(c.id))];
}

/**
 * Cuántos enlaces entran en `available` px, en orden. Si no entran todos, deja lugar para el botón
 * «Más categorías» (`moreWidth`). `gap` es el espacio entre elementos.
 */
export function fittingCount(widths: number[], available: number, moreWidth: number, gap: number): number {
  let used = 0;
  for (let i = 0; i < widths.length; i++) used += widths[i]! + (i > 0 ? gap : 0);
  if (used <= available) return widths.length;

  let count = 0;
  used = moreWidth;
  while (count < widths.length && used + widths[count]! + gap <= available) {
    used += widths[count]! + gap;
    count++;
  }
  return count;
}
