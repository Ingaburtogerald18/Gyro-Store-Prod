// Mapa de roles y utilidades de perfil compartidos por la vista de Personal.
import type { UserProfile } from "~/state/api/users-api";
import type { UpdateProfileInput } from "@shared/schemas";

export { ROLE_LABELS } from "~/lib/roles";

export const isProtectedUser = (user: UserProfile) => user.isProtected === true;

// `bank_account` y `avatar_url` arrancan en null: sin banco elegido y con iniciales en el avatar.
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
