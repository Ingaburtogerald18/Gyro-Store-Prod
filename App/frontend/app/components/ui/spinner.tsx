import { HugeIcon } from "~/components/ui/icon"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { cn } from "~/lib/utils"

// `strokeWidth` se excluye del spread: en los props de <svg> es string | number,
// pero HugeIcon solo acepta number — y acá ya se fija más abajo.
//
// El giro lo hace `animate-spin` (CSS puro, compositor, cero JS): es el único
// icono del sistema que anima en bucle, y conviene que sea el mecanismo barato.
function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "strokeWidth">) {
  return (
    <HugeIcon
      icon={Loading03Icon}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      size={16}
      strokeWidth={2}
      className={cn("animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
