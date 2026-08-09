import * as React from "react"

import { cn } from "~/lib/utils"

// forwardRef es la ÚNICA desviación respecto del registry: shadcn ya asume React
// 19 (ref como prop normal), pero este proyecto está en React 18, donde el jsx
// runtime intercepta `ref` del spread y jamás llega al <input>. Sin esto,
// `{...register("x")}` de react-hook-form registra el onChange pero no el nodo:
// reset() y setValue() dejan de escribir en el DOM. Conservar en cada
// `shadcn add --overwrite`.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
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
