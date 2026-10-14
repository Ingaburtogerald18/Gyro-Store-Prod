// Constantes y helpers compartidos por las piezas de la vista de Personal
// (extraídas de admin.usuarios.tsx). Un solo lugar para el mapa de roles y las
// utilidades de perfil que consumen la card, el detalle y el hook de acciones.
import type { AppRole, UserProfile } from "~/state/api/users-api";
import type { UpdateProfileInput } from "@shared/schemas";

export const ROLE_LABELS: Record<AppRole, string> = {
  global_admin: "Administrador general",
  admin: "Admin",
  seller: "Vendedor",
  cashier: "Cajero",
  logistics_admin: "Logística (Admin)",
  logistics_customer: "Logística (Lectura)",
};

export const isProtectedUser = (user: UserProfile) => user.isProtected === true;

// Formulario vacío del modal de edición y de «Mi perfil». `bank_account` arranca
// en null: un empleado sin cuenta cargada no debe mostrar un banco elegido por
// defecto. `avatar_url` también, para que el picker muestre las iniciales.
export const EMPTY_PROFILE_FORM: UpdateProfileInput = {
  name: "",
  phone: "",
  personal_email: "",
  bank_account: null,
  avatar_url: null,
};

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
