import * as React from "react"

import { cn } from "~/lib/utils"

type Density = "normal" | "compact"

function Table({
  className,
  containerClassName,
  density = "normal",
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string; density?: Density }) {
  return (
    <div
      data-slot="table-container"
      data-density={density}
      className={cn("group/table relative w-full overflow-x-auto rounded-2xl border border-border bg-card", containerClassName)}
    >
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("border-b border-border bg-background text-left", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("sticky bottom-0 z-10 border-t border-border bg-background font-bold", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-primary-2/5 data-[state=selected]:bg-primary-2/10",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("h-11 px-4 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("h-13 px-4 align-middle group-data-[density=compact]/table:h-10", className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell }
