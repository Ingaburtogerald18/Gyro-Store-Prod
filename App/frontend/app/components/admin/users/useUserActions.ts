// Acciones de personal (cambiar rol / dar de baja / restaurar / eliminar) con
// su mutation + toast + chequeo de usuario protegido. Lo comparten la card de
// usuario y el diálogo de detalle, para no duplicar los handlers en cada uno.
import { toast } from "sonner";
import {
  useUpdateUserRolesMutation,
  useSuspendUserMutation,
  useRestoreUserMutation,
  useDeleteUserMutation,
  useDeletePendingInviteMutation,
  type AppRole,
  type UserProfile,
} from "~/store/api/usersApi";
import { ROLE_LABELS, isProtectedUser } from "./constants";

const PROTECTED_MSG =
  "Operación denegada: Este usuario está protegido por el sistema.";

export function useUserActions() {
  const [updateRoles] = useUpdateUserRolesMutation();
  const [suspendUser] = useSuspendUserMutation();
  const [restoreUser] = useRestoreUserMutation();
  const [deleteUser] = useDeleteUserMutation();
  const [deletePendingInvite] = useDeletePendingInviteMutation();

  const changeRole = async (user: UserProfile, newRole: AppRole) => {
    if (isProtectedUser(user)) {
      toast.error(PROTECTED_MSG);
      return;
    }
    try {
      await updateRoles({ email: user.email, roles: [newRole] }).unwrap();
      toast.success(`Rol actualizado a ${ROLE_LABELS[newRole]}`);
    } catch (error: any) {
      toast.error(error?.data?.error || `Error al actualizar el rol de ${user.name}`);
    }
  };

  const suspend = async (user: UserProfile) => {
    if (isProtectedUser(user)) {
      toast.error(PROTECTED_MSG);
      return;
    }
    try {
      await suspendUser(user.id).unwrap();
      toast.success(`${user.name} ha sido dado de baja.`);
    } catch (error: any) {
      toast.error(error?.data?.error || `Error al dar de baja a ${user.name}`);
    }
  };

  const restore = async (user: UserProfile) => {
    try {
      await restoreUser(user.id).unwrap();
      toast.success(`${user.name} ha sido restaurado y ahora está activo.`);
    } catch (error: any) {
      toast.error(error?.data?.error || `Error al restaurar a ${user.name}`);
    }
  };

  const remove = async (user: UserProfile) => {
    if (isProtectedUser(user)) {
      toast.error(PROTECTED_MSG);
      return;
    }
    try {
      if (user.pending) {
        // Sin fila real en `profiles`: es una invitación, no una cuenta —
        // "eliminar" acá es cancelarla por correo, no borrar un id.
        await deletePendingInvite(user.email).unwrap();
        toast.success(`Invitación de ${user.name} cancelada.`);
      } else {
        await deleteUser(user.id).unwrap();
        toast.success(`${user.name} ha sido borrado de la base de datos.`);
      }
    } catch (error: any) {
      toast.error(error?.data?.error || `Error al borrar a ${user.name}`);
    }
  };

  return { changeRole, suspend, restore, remove };
}
