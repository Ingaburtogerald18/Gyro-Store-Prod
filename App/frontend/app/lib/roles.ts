// Roles del personal: una sola lista de nombres para la tienda y el panel.
import type { AppRole } from '~/state/api/users-api';

export const ROLE_LABELS: Record<AppRole, string> = {
  global_admin: 'Administrador general',
  admin: 'Administrador',
  seller: 'Vendedor',
  cashier: 'Cajero',
  logistics_admin: 'Logística',
  logistics_customer: 'Logística (lectura)',
};

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role as AppRole]) || 'Colaborador';
}

/** Tener sesión no alcanza: el cliente también inicia sesión y no es personal. */
export function isStaffRole(role: string | null | undefined): boolean {
  return role != null && role !== 'customer';
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'global_admin';
}
