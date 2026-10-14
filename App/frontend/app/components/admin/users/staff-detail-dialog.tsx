// Ficha de un compañero, solo lectura, sin formulario: no es el diálogo del admin con los botones
// apagados. La cuenta bancaria ni llega desde /api/staff/directory.
import type { AppRole, UserProfile } from '~/state/api/users-api';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { StatusBadge } from '~/components/ui/status-badge';
import { ROLE_LABELS, getInitials } from './constants';

function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {/* Un guion y no un hueco: el campo vacío tiene que leerse como "no cargó
          el dato", no como un error de renderizado. */}
      <span className="break-all text-sm text-foreground sm:text-right">
        {value || <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

export function StaffDetailDialog({
  user,
  onClose,
}: {
  user: UserProfile | null;
  onClose: () => void;
}) {
  const role = (user?.roles?.[0] || 'seller') as AppRole;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-10">
          <DialogTitle>Ficha del compañero</DialogTitle>
          <DialogDescription>Datos de contacto del equipo. Solo lectura.</DialogDescription>
        </DialogHeader>

        {user && (
          <div className="grid gap-5">
            <div className="flex flex-col items-center gap-2">
              <Avatar className="size-20">
                <AvatarImage
                  src={user.avatar_url ?? undefined}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="font-heading text-2xl font-bold uppercase">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="font-heading text-sm font-semibold text-foreground">{user.name}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {ROLE_LABELS[role] || role}
                </Badge>
                {user.deleted_at ? (
                  <StatusBadge status="error" label="De Baja" />
                ) : (
                  <StatusBadge status="success" label="Activo" />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border px-3">
              <DataRow label="Teléfono" value={user.phone} />
              <DataRow label="Correo personal" value={user.personal_email} />
              <DataRow label="Correo corporativo" value={user.email} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="cancel" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
