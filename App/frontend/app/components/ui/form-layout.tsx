import * as React from "react";

import { DialogContent, DialogFooter } from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

type FormMode = "dialog" | "page";
const FormModeContext = React.createContext<FormMode>("dialog");
const layoutClass = (mode: FormMode) =>
  mode === "page" ? "space-y-5" : "flex min-h-0 flex-1 flex-col";

export const FormDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent> & { size?: "short" | "long" }
>(({ size = "short", className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    layout="form"
    className={cn(size === "long" ? "sm:max-w-5xl" : "sm:max-w-xl", className)}
    {...props}
  />
));
FormDialogContent.displayName = "FormDialogContent";

export const FormLayout = React.forwardRef<
  HTMLFormElement,
  React.ComponentPropsWithoutRef<"form"> & { mode?: FormMode }
>(({ mode = "dialog", className, children, ...props }, ref) => (
  <FormModeContext.Provider value={mode}>
    <form
      ref={ref}
      data-slot="form-layout"
      data-mode={mode}
      className={cn(layoutClass(mode), className)}
      {...props}
    >
      {children}
    </form>
  </FormModeContext.Provider>
));
FormLayout.displayName = "FormLayout";

export function FormPanel({
  mode = "dialog",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { mode?: FormMode }) {
  return (
    <FormModeContext.Provider value={mode}>
      <div
        data-slot="form-layout"
        data-mode={mode}
        className={cn(layoutClass(mode), className)}
        {...props}
      >
        {children}
      </div>
    </FormModeContext.Provider>
  );
}

export function FormBody({ className, ...props }: React.ComponentProps<"div">) {
  const mode = React.useContext(FormModeContext);
  return (
    <div
      data-slot="form-body"
      className={cn(
        "flex flex-col gap-5",
        // shrink-0: si no, las secciones (overflow-hidden) se aplastan y el cuerpo no desliza.
        mode === "dialog" &&
          "min-h-0 flex-1 *:shrink-0 overflow-y-auto overscroll-contain bg-background p-4 sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

export function FormActions({ className, ...props }: React.ComponentProps<"div">) {
  const mode = React.useContext(FormModeContext);
  return (
    <DialogFooter
      data-slot="form-actions"
      className={cn(
        "shrink-0 border-t bg-card p-4 sm:px-6",
        mode === "page" && "rounded-2xl border p-5",
        className,
      )}
      {...props}
    />
  );
}

export function FormSection({
  title,
  description,
  action,
  className,
  children,
  ...props
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
} & React.ComponentProps<"section">) {
  return (
    <section
      data-slot="form-section"
      className={cn("min-w-0 overflow-hidden rounded-2xl border bg-card", className)}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}
