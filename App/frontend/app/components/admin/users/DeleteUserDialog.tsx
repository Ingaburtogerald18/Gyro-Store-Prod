// Diálogo de confirmación para eliminar un usuario permanentemente (extraído de
// admin.usuarios.tsx). Controlado por `user`: se abre cuando hay uno y ejecuta
// el borrado vía useUserActions.
import type { UserProfile } from "~/store/api/usersApi";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useUserActions } from "./useUserActions";

export function DeleteUserDialog({
  user,
  onClose,
}: {
  user: UserProfile | null;
  onClose: () => void;
}) {
  const { remove } = useUserActions();

  const handleConfirm = async () => {
    if (!user) return;
    await remove(user);
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user?.pending ? 'Cancelar invitación' : 'Borrar permanentemente'}</DialogTitle>
          <DialogDescription>
            {user?.pending ? (
              <>
                <strong>{user?.name}</strong> todavía no inició sesión — se le va a retirar el rol
                reservado. Si más adelante entra con Microsoft, va a quedar sin permisos hasta que
                se lo asignes de nuevo.
              </>
            ) : (
              <>
                ¿Seguro que deseas eliminar por completo a <strong>{user?.name}</strong> y todo su
                acceso? Esta acción borrará su perfil de la base de datos y no se puede deshacer.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {user?.pending ? 'Sí, cancelar invitación' : 'Sí, eliminar usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
