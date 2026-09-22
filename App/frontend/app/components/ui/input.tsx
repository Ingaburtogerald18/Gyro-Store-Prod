import * as React from "react"

import { cn } from "~/lib/utils"

// forwardRef es la ÚNICA desviación respecto del registry: shadcn ya asume React
// 19 (ref como prop normal), pero este proyecto está en React 18, donde el jsx
// runtime intercepta `ref` del spread y jamás llega al <input>. Sin esto,
// `{...register("x")}` de react-hook-form registra el onChange pero no el nodo:
// reset() y setValue() dejan de escribir en el DOM. Conservar en cada
// `shadcn add --overwrite`.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, onWheel, ...props }, ref) {
  // Rueda del mouse sobre un `type="number"` ENFOCADO: el navegador lo trata
  // como el stepper y le suma/resta un `step` por cada tic. En un campo de
  // precio con `step="0.01"` eso convierte un 80 en 79.99 sin que nadie toque
  // el teclado — y así queda impreso en la factura (pasó en GS-PR-11).
  //
  // Se hace `blur()` en vez de `preventDefault()`: React 17+ registra `onWheel`
  // como listener PASIVO en la raíz, así que ahí `preventDefault` no hace nada.
  // Al desenfocar, el input deja de ser objetivo del stepper y la página
  // scrollea normal. El valor tipeado no se pierde.
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
        "h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-base transition-[color,box-shadow] duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
})

export { Input }
