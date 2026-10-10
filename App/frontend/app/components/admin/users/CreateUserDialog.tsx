import { FormLayout, FormDialogContent, FormActions, FormBody } from "~/components/ui/form-layout";
// Diálogo "Agregar Empleado" (extraído de admin.usuarios.tsx). Autocontenido:
// trae su propio trigger, estado del formulario y la mutation de creación.
import { useEffect, useState } from "react";
import { HugeIcon } from "~/components/ui/icon";
import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { useCreateUserMutation, type AppRole } from "~/store/api/usersApi";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Field, FieldLabel, FieldError } from "~/components/ui/field";
import { FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ROLE_LABELS } from "./constants";

export function CreateUserDialog() {
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("seller");
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  useEffect(() => { if (open) { setServerError(null); setEmailError(null); } }, [open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setEmailError(null);
    if (!newEmail.endsWith("@gyrostorenic.com")) {
      setEmailError("Usá un correo del dominio @gyrostorenic.com.");
      return;
    }
    try {
      const result = await createUser({ email: newEmail, name: newName, roles: [newRole] }).unwrap();
      toast.success(
        result.pending
          ? `Rol reservado para ${newName}. Se activa solo en cuanto inicie sesión con Microsoft.`
          : `${newName} ya tenía cuenta — se le asignó el rol directamente.`,
      );
      setOpen(false);
      setNewName("");
      setNewEmail("");
      setNewRole("seller");
    } catch (error: any) {
      setServerError(serverErrorMessage(error, "No se pudo crear el usuario."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <HugeIcon icon={UserAdd01Icon} size={16} strokeWidth={2} className="mr-2" />
          Agregar persona
        </Button>
      </DialogTrigger>
      <FormDialogContent>
        <FormLayout onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Agregar persona al equipo</DialogTitle>
            <DialogDescription>
              Registrá a la persona y asigná su rol. Podrá iniciar sesión con Microsoft Entra ID y el
              sistema lo enlazará automáticamente.
            </DialogDescription>
          </DialogHeader>
          <FormErrorBanner message={serverError} />
          <FormBody>
            <div className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="create-name" required>
                  Nombre
                </FieldLabel>
                <Input
                  id="create-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </Field>
              <Field data-invalid={!!emailError}>
                <FieldLabel htmlFor="create-email" required>
                  Correo
                </FieldLabel>
                <Input
                  id="create-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailError(null);
                  }}
                  aria-invalid={!!emailError}
                  placeholder="usuario@gyrostorenic.com"
                  required
                />
                {emailError && <FieldError>{emailError}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="create-role" required>
                  Rol inicial
                </FieldLabel>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger id="create-role" className="w-full">
                    <SelectValue placeholder="Seleccioná un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormBody>
          <FormActions>
            <Button
              type="button"
              variant="cancel"
              onClick={() => setOpen(false)}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isCreating} variant="default">
              {isCreating ? "Guardando…" : "Agregar persona"}
            </Button>
          </FormActions>
        </FormLayout>
      </FormDialogContent>
    </Dialog>
  );
}
