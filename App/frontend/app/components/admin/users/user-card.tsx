// Card de un usuario en la grilla de Personal (extraída de admin.usuarios.tsx).
// Presentacional: recibe el usuario y callbacks; no toca la API.
import { HugeIcon } from "~/components/ui/icon";
import {
  Delete02Icon,
  Mail01Icon,
  PieChartIcon,
  Shield01Icon,
  SmartPhone01Icon,
  Time02Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import type { AppRole, UserProfile } from "~/state/api/users-api";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { StatusBadge } from "~/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { ROLE_LABELS, isProtectedUser, getInitials } from "./constants";

export function UserCard({
  user,
  isAdmin,
  onEdit,
  onPerformance,
  onDelete,
  onChangeRole,
  onView,
}: {
  user: UserProfile;
  isAdmin: boolean;
  onEdit: () => void;
  onPerformance: () => void;
  /** Solo para invitaciones pendientes: cancela la reserva de rol. */
  onDelete: () => void;
  /** Ídem: el rol de una invitación se corrige acá porque no tiene ficha. */
  onChangeRole: (role: AppRole) => void;
  /**
   * Abre la ficha de SOLO LECTURA. Solo para quien no administra: el admin usa
   * `onEdit`, que abre el diálogo con formulario y acciones.
   */
  onView?: () => void;
}) {
  const isDeleted = !!user.deleted_at;
  const isProtected = isProtectedUser(user);
  const role = user.roles[0] || "seller";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      {/* Cabecera: avatar + info */}
      <div className="flex items-start gap-3">
        <Avatar size="lg">
          <AvatarImage src={user.avatar_url ?? undefined} alt={user.name} referrerPolicy="no-referrer" />
          <AvatarFallback className="font-heading text-sm font-bold uppercase">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-heading text-sm font-semibold text-foreground">
              {user.name}
            </span>
            {isProtected && (
              <HugeIcon
                icon={Shield01Icon}
                size={14}
                strokeWidth={2}
                className="shrink-0 text-warning"
                aria-label="Protegido por el sistema"
              />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Badges: rol + estado */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {ROLE_LABELS[role as AppRole] || role}
        </Badge>
        {user.pending ? (
          <StatusBadge status="pending" label="Pendiente" />
        ) : isDeleted ? (
          <StatusBadge status="error" label="De Baja" />
        ) : (
          <StatusBadge status="success" label="Activo" />
        )}
      </div>

      {user.pending && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <HugeIcon icon={Time02Icon} size={14} strokeWidth={2} className="shrink-0" aria-hidden />
          Se activa solo cuando inicie sesión con Microsoft por primera vez.
        </p>
      )}

      {/* Contacto: solo en la vista de directorio. Para el admin sería ruido —
          ya tiene la ficha completa a un click— pero para el resto del staff es
          LO ÚNICO que vienen a buscar acá, y obligarlos a abrir un diálogo por
          persona para leer un teléfono convierte el directorio en un trámite. */}
      {!isAdmin && !user.pending && (user.phone || user.personal_email) && (
        <div className="-mt-1 grid gap-1 text-xs text-muted-foreground">
          {user.phone && (
            <p className="flex items-center gap-1.5">
              <HugeIcon icon={SmartPhone01Icon} size={14} strokeWidth={2} className="shrink-0" aria-hidden />
              <span className="truncate">{user.phone}</span>
            </p>
          )}
          {user.personal_email && (
            <p className="flex items-center gap-1.5">
              <HugeIcon icon={Mail01Icon} size={14} strokeWidth={2} className="shrink-0" aria-hidden />
              <span className="truncate">{user.personal_email}</span>
            </p>
          )}
        </div>
      )}

      {/* Ficha de solo lectura para quien no administra. Sin cambiar rol, sin dar
          de baja y sin cuenta bancaria — esos datos ni llegan al navegador. */}
      {!isAdmin && onView && (
        <div className="flex items-center border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onView} className="flex-1 gap-1.5">
            <HugeIcon icon={UserSettings01Icon} size={16} strokeWidth={2} aria-hidden />
            Ver ficha
          </Button>
        </div>
      )}

      {/* Acciones */}
      {isAdmin && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          {/* Pendiente: no hay cuenta real todavía, así que ni "Editar"
              (perfil/banco) ni "Rendimiento" (ventas) tienen nada que
              mostrar. Solo el rol reservado, que se puede corregir o
              cancelar — dos botones SEPARADOS y visibles, no uno escondiendo
              al otro adentro de un menú (ahí no se encontraba "Cancelar"). */}
          {user.pending ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5">
                    <HugeIcon icon={UserSettings01Icon} size={16} strokeWidth={2} aria-hidden />
                    Cambiar rol
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {Object.entries(ROLE_LABELS).map(([roleKey, label]) => (
                    <DropdownMenuItem
                      key={roleKey}
                      onClick={() => onChangeRole(roleKey as AppRole)}
                      className="cursor-pointer"
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
                className="flex-1 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                Cancelar invitación
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="flex-1 gap-1.5"
              >
                <HugeIcon icon={UserSettings01Icon} size={16} strokeWidth={2} aria-hidden />
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onPerformance}
                className="flex-1 gap-1.5"
              >
                <HugeIcon icon={PieChartIcon} size={16} strokeWidth={2} aria-hidden />
                Rendimiento
              </Button>
            </>
          )}
          {/* Acá vivía un menú «⋮» con el rol y las acciones de baja/eliminación.
              Se fue entero: la tarjeta es para RECONOCER a alguien y entrar a su
              ficha, no para administrarlo de refilón. Todo lo administrativo está
              en la sección «Administración» del diálogo, en un solo lugar y con el
              estado actual a la vista. Lo único que sigue teniendo acción propia
              acá es la invitación pendiente, que no tiene ficha a la que entrar. */}
        </div>
      )}
    </div>
  );
}
