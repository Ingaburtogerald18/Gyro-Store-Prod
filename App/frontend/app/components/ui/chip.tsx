import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~/lib/utils"

// Los cuatro chips del sistema: estado, filtro activo, contador y categoría.
const chipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium",
  {
    variants: {
      variant: {
        status: "text-foreground",
        filter:
          "min-h-9 max-w-full rounded-xl border border-primary-2/45 bg-primary-2/10 px-3 text-foreground transition-colors",
        count:
          "h-5 min-w-5 justify-center rounded-full border border-ink bg-action px-1.5 text-2xs font-semibold tabular-nums text-action-foreground",
        category: "h-6 rounded-xl bg-muted px-2 text-foreground",
      },
    },
    defaultVariants: { variant: "category" },
  }
)

const STATUS_DOT = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
  whatsapp: "bg-whatsapp",
} as const

export type ChipTone = keyof typeof STATUS_DOT

type ChipProps = React.ComponentProps<"span"> &
  VariantProps<typeof chipVariants> & {
    /** Color del punto en los chips de estado. */
    tone?: ChipTone
    /** Convierte el chip de filtro en un botón que lo quita. */
    onRemove?: () => void
    removeLabel?: string
  }

function Chip({ className, variant, tone = "neutral", onRemove, removeLabel, children, ...props }: ChipProps) {
  if (variant === "filter" && onRemove) {
    return (
      <button
        type="button"
        data-slot="chip"
        data-variant="filter"
        onClick={onRemove}
        aria-label={removeLabel}
        className={cn(
          chipVariants({ variant }),
          "hover:border-primary-2 hover:bg-primary-2/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <span className="truncate">{children}</span>
        <span aria-hidden>×</span>
      </button>
    )
  }

  return (
    <span data-slot="chip" data-variant={variant ?? "category"} className={cn(chipVariants({ variant }), className)} {...props}>
      {variant === "status" && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[tone])} />}
      {children}
    </span>
  )
}

export { Chip, chipVariants }
