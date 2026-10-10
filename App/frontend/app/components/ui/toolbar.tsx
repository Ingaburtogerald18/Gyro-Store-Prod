import * as React from "react"

import { cn } from "~/lib/utils"

// Barra de herramientas de un módulo: buscador, filtros, conteo y la acción
// principal a la derecha.
function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3",
        className
      )}
      {...props}
    />
  )
}

export { Toolbar }
