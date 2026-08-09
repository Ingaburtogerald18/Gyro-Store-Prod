// Diálogo "Agregar Empleado" (extraído de admin.usuarios.tsx). Autocontenido:
// trae su propio trigger, estado del formulario y la mutation de creación.
import { useState } from "react";
import { HugeIcon } from "~/components/ui/icon";
import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { useCreateUserMutation, type AppRole } from "~/store/api/usersApi";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Field, FieldLabel } from "~/components/ui/field";
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.endsWith("@gyrostorenic.com")) {
      toast.error("El correo debe pertenecer al dominio @gyrostorenic.com");
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
      toast.error(error?.data?.error || "No se pudo crear el usuario.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <HugeIcon icon={UserAdd01Icon} size={16} strokeWidth={2} className="mr-2" />
          Agregar Empleado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Pre-crear Empleado</DialogTitle>
            <DialogDescription>
              Registra al empleado y asigna su rol. Podrá iniciar sesión con Microsoft Entra ID
              y el sistema lo enlazará automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="create-name">Nombre</FieldLabel>
              <Input
                id="create-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-email">Correo</FieldLabel>
              <Input
                id="create-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="usuario@gyrostorenic.com"
                required
              />
            </Field>
            <Field>
              <FieldLabel>Rol Inicial</FieldLabel>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un rol" />
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
          <DialogFooter>
            <Button type="submit" disabled={isCreating} variant="default">
              {isCreating ? "Creando..." : "Guardar Empleado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
