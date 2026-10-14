import * as React from "react"

import { cn } from "~/lib/utils"

// forwardRef es la única desviación del registry: en React 18 sin él react-hook-form no registra el
// nodo y reset() deja de escribir en el DOM. Conservarlo en cada `shadcn add --overwrite`.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, onWheel, ...props }, ref) {
  // La rueda sobre un number enfocado cambia el valor (un 80 pasó a 79.99 en GS-PR-11): se desenfoca.
  // `blur()` porque React registra `onWheel` como pasivo y `preventDefault` no hace nada.
  const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    if (event.currentTarget.type === "number" && document.activeElement === event.currentTarget) {
      event.currentTarget.blur()
    }
    onWheel?.(event)
  }

  return (
    <input
      ref={ref}
      type={type}
      onWheel={handleWheel}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-input bg-card hover:border-primary-2 px-2.5 py-1 text-base transition-[color,box-shadow] duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
})

export { Input }
