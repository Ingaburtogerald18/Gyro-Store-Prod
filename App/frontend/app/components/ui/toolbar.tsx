import * as React from "react"

import { cn } from "~/lib/utils"

// Barra de herramientas de un módulo: buscador, filtros, conteo y la acción
// principal a la derecha.
function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-primary-2/30 bg-card p-3 shadow-[inset_0_2px_0_var(--primary-2)]",
        className
      )}
      {...props}
    />
  )
}

export { Toolbar }
