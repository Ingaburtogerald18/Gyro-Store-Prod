"use client"

import { HugeIcon } from "~/components/ui/icon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

const DialogLayoutContext = React.createContext<"default" | "form">("default")

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

// ── Por qué TODOS estos envoltorios llevan forwardRef ──
// En React 18, pasarle un ref a un componente de función que no lo reenvía deja
// el ref en `null` (y React avisa: "Function components cannot be given refs").
// Radix no usa esos refs de adorno: `DismissableLayer` pone `pointer-events:
// none` en el <body> al abrir un modal y lo REACTIVA sobre el nodo de la capa a
// través de su ref. Con el ref en null esa reactivación nunca ocurre, así que el
// diálogo se ve pero NADA de lo que hay adentro se puede clickear — botones que
// no responden, sin ningún error.
//
// Es el mismo motivo por el que `button.tsx` ya lo tenía.
//
// NOTA: Se usan arrow functions en forwardRef (no function declarations nombradas)
// para compatibilidad con esbuild — la sintaxis `forwardRef(function Foo(...))`
// genera "Expected ) but found function" en versiones antiguas de esbuild/Vite.
const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>((props, ref) => (
  <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />
))
DialogTrigger.displayName = "DialogTrigger"

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>((props, ref) => (
  <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />
))
DialogClose.displayName = "DialogClose"

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 isolate z-50 bg-black/30 duration-100 supports-backdrop-filter: data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean
    layout?: "default" | "form"
  }
>(({ className, children, showCloseButton = true, layout = "default", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      data-layout={layout}
      onInteractOutside={(e) => {
        const target = e.target as Element;
        if (target?.closest('[data-radix-popper-content-wrapper]') || target?.closest('[data-radix-portal]')) {
          e.preventDefault();
        }
      }}
      className={cn(
        "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-2xl bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-100 outline-none sm:max-w-md dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        layout === "form" && "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0",
        className
      )}
      {...props}
    >
      <DialogLayoutContext.Provider value={layout}>{children}</DialogLayoutContext.Provider>
      {showCloseButton && (
        <DialogPrimitive.Close data-slot="dialog-close" asChild>
          <Button
            variant="cancel"
            className="absolute top-4 right-4"
            size="icon-sm"
          >
            <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
            <span className="sr-only">Cerrar</span>
          </Button>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = "DialogContent"

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const layout = React.useContext(DialogLayoutContext)
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", layout === "form" && "shrink-0 border-b bg-card px-6 py-5 pr-16", className)}
      {...props}
    />
  )
}

// Pie de formulario: «Cancelar» primero y la acción principal al final, a la derecha.
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const layout = React.useContext(DialogLayoutContext)
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        layout === "form" && "shrink-0 border-t bg-card px-6 py-4",
        className
      )}
      {...props}
    >
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="cancel">Cancelar</Button>
        </DialogPrimitive.Close>
      )}
      {children}
    </div>
  )
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn(
      "font-heading text-lg leading-snug font-semibold",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn(
      "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
      className
    )}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
