import { HugeIcon } from "~/components/ui/icon"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { cn } from "~/lib/utils"

// `strokeWidth` sale del spread porque HugeIcon solo acepta number. El giro es CSS (`animate-spin`).
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
