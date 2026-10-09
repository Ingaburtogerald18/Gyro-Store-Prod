import type { IconSvgElement } from "@hugeicons/react";
import { Analytics01Icon, Coupon01Icon, CreditCardIcon, DashboardSquare01Icon, File01Icon, Package01Icon, PackageIcon, Settings02Icon, ShoppingBag01Icon, ShoppingCart02Icon, Store01Icon, UserMultiple02Icon, UserSettings01Icon } from "@hugeicons/core-free-icons";
export interface NavItem {
  name: string;
  to: string;
  icon: IconSvgElement;
  end?: boolean;
  external?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operación',
    items: [
      { name: 'Inventario', to: '/admin/inventario', icon: PackageIcon },
      { name: 'Ver tienda', to: '/', icon: Store01Icon, end: true, external: true },
      // Solo vendedor (ver el filtro de rol más abajo): sus facturas de solo
      // lectura, para copiar el número y registrar la venta en Ventas.
      { name: 'Mis Facturas', to: '/admin/mis-facturas', icon: File01Icon },
      { name: 'Ventas', to: '/admin/ventas', icon: ShoppingCart02Icon },
      { name: 'Pedidos web', to: '/admin/pedidos-web', icon: ShoppingBag01Icon },
      { name: 'Cuotas', to: '/admin/cuotas', icon: CreditCardIcon },
    ],
  },
  {
    label: 'Tienda',
    items: [
      { name: 'Catálogo', to: '/admin/catalogo', icon: Package01Icon },
      { name: 'Facturación', to: '/admin/facturacion', icon: File01Icon },
      { name: 'Códigos de descuento', to: '/admin/codigos-descuento', icon: Coupon01Icon },
    ],
  },
  {
    label: 'Análisis y sistema',
    items: [
      { name: 'Reportería', to: '/admin', icon: DashboardSquare01Icon, end: true },
      { name: 'CRM y clientes', to: '/admin/crm', icon: UserMultiple02Icon },
      { name: 'Analítica', to: '/admin/analitica', icon: Analytics01Icon },
      { name: 'Personal', to: '/admin/usuarios', icon: UserSettings01Icon },
      { name: 'Configuración', to: '/admin/configuracion', icon: Settings02Icon },
    ],
  },
];

export function allowedNavGroups(isAdmin: boolean, role: string | null) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.name === 'Mis Facturas') return role === 'seller';
      return isAdmin || ['Ventas', 'Pedidos web', 'Personal', 'Catálogo', 'CRM y clientes'].includes(item.name);
    }),
  })).filter((group) => group.items.length > 0);
}

export function currentNavItem(pathname: string, items: NavItem[]) {
  return items.find((item) => !item.external && (item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`)));
}
