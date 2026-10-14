// Menú de acciones: en filas, un "⋯" discreto; en una tarjeta, el botón principal «Acciones».
import { HugeIcon } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { ArrowDown01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { cn } from "~/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "~/components/ui/dropdown-menu";
import React from "react";

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** Si se pasa, el ítem es un enlace externo (<a target="_blank">). */
  href?: string;
  /** Estilo destructivo (rojo). */
  danger?: boolean;
  disabled?: boolean;
  /** Dibuja un separador arriba del ítem (para agrupar). */
  separatorBefore?: boolean;
  /** Agrupa las acciones bajo un encabezado en el menú. */
  group?: string;
}

// Acepta cualquier valor falsy (false, "", 0, null, undefined) para poder incluir
// acciones condicionalmente con `cond && {...}` sin ensuciar el JSX.
type MaybeAction = RowAction | false | "" | 0 | null | undefined;

export function RowActionsMenu({
  actions,
  className,
  label = "Acciones",
  trigger = "icon",
}: {
  actions: MaybeAction[];
  className?: string;
  label?: string;
  trigger?: "icon" | "button";
}) {
  const items = actions.filter(Boolean) as RowAction[];
  
  if (items.length === 0) return null;

  const ungroupedItems = items.filter((a) => !a.group);
  const groupedItems = items.filter((a) => a.group);
  
  // Agrupar por nombre de grupo
  const groups: Record<string, RowAction[]> = {};
  for (const item of groupedItems) {
    if (!groups[item.group!]) groups[item.group!] = [];
    groups[item.group!].push(item);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "button" ? (
          <Button type="button" aria-label={label} className={cn("gap-1.5", className)}>
            Acciones
            <HugeIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title={label}
            aria-label={label}
            className={cn(
              "rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "data-[state=open]:bg-muted data-[state=open]:text-foreground",
              className,
            )}
          >
            <HugeIcon icon={MoreVerticalIcon} size={16} strokeWidth={2} />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {ungroupedItems.map((a, i) => (
          <RowActionItem key={`ungrouped-${i}`} action={a} />
        ))}
        {Object.entries(groups).map(([groupName, groupActions], i) => (
          <DropdownMenuGroup key={groupName}>
            {(ungroupedItems.length > 0 || i > 0) && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{groupName}</DropdownMenuLabel>
            {groupActions.map((a, j) => (
              <RowActionItem key={`${groupName}-${j}`} action={a} />
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowActionItem({ action: a }: { action: RowAction }) {
  const cls = cn(
    "flex items-center gap-2.5 cursor-pointer",
    a.danger ? "text-destructive focus:bg-destructive/10 focus:text-destructive" : "text-muted-foreground focus:text-foreground",
  );

  const content = (
    <>
      {a.icon}
      {a.label}
    </>
  );

  return (
    <>
      {a.separatorBefore && <DropdownMenuSeparator />}
      {a.href ? (
        <DropdownMenuItem asChild disabled={a.disabled} className={cls}>
          <a href={a.href} target="_blank" rel="noreferrer">
            {content}
          </a>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled={a.disabled} onClick={a.onClick} className={cls}>
          {content}
        </DropdownMenuItem>
      )}
    </>
  );
}

