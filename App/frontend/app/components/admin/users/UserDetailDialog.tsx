// Diálogo de detalle del empleado con tabs Editar / Rendimiento. Encapsula el
// formulario de perfil (react-hook-form + updateProfileSchema), la mutation de
// actualización y las acciones de rol / baja / restauración. Controlado por `user`.
//
// ── Dos secciones, dos responsabilidades ──
// «Datos del empleado» (foto, nombre, contacto, cuenta de pagos) es lo mismo que
// esa persona puede editarse sola en «Mi perfil»: se acumula en el formulario y
// se confirma con «Guardar cambios». «Administración» (rol, baja/restauración) es
// lo que SOLO un admin puede hacer, y se aplica al instante. Estaban mezclados en
// una sola columna con el botón de dar de baja pegado al de guardar, así que no
// se distinguía qué cambio quedaba pendiente y cuál ya había ocurrido.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { HugeIcon } from "~/components/ui/icon";
import { Delete02Icon, RefreshIcon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
  useUpdateUserProfileMutation,
  type AppRole,
  type UserProfile,
} from "~/store/api/usersApi";
import { updateProfileSchema, type UpdateProfileInput } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ROLE_LABELS, isProtectedUser, EMPTY_PROFILE_FORM } from "./constants";
import { AvatarPicker } from "./AvatarPicker";
import { ProfileBankFields } from "./ProfileBankFields";
import { useUserActions } from "./useUserActions";
import { PerformanceTab } from "./PerformanceTab";

import { queueFile, processPendingUploads } from "~/lib/uploadQueue";

export function UserDetailDialog({
  user,
  initialTab,
  onClose,
  onRequestDelete,
}: {
  user: UserProfile | null;
  initialTab: "editar" | "rendimiento";
  onClose: () => void;
  /**
   * Pide el borrado PERMANENTE. No lo ejecuta: la confirmación vive en
   * `DeleteUserDialog`, que monta la vista de Personal. Acá solo se dispara.
   */
  onRequestDelete?: () => void;
}) {
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateUserProfileMutation();
  const { changeRole, suspend, restore } = useUserActions();
  const [detailTab, setDetailTab] = useState<string>(initialTab);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // ── Formulario de edición de perfil ──
  // La validación sale de `updateProfileSchema` (App/shared/schemas.ts), el
  // mismo contrato que aplica el backend: la regla de Ficohsa se evalúa acá y
  // allá, así que un request fuera del panel tampoco la puede saltar.
  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: EMPTY_PROFILE_FORM,
  });
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    watch: watchProfile,
    setValue: setProfileValue,
    formState: { errors: profileErrors },
  } = profileForm;

  // Al abrir con un usuario nuevo, sincroniza el tab pedido y el formulario.
  useEffect(() => {
    if (user) setDetailTab(initialTab);
  }, [user, initialTab]);

  useEffect(() => {
    resetProfile(
      user
        ? {
            name: user.name ?? "",
            phone: user.phone ?? "",
            personal_email: user.personal_email ?? "",
            bank_account: user.bank_account ?? null,
            avatar_url: user.avatar_url ?? null,
          }
        : EMPTY_PROFILE_FORM,
    );
  }, [user, resetProfile]);

  // La foto vive en el formulario (no en el `user` de la lista): así se ve el
  // cambio al instante y recién viaja al servidor con «Guardar cambios».
  const avatarUrl = watchProfile("avatar_url");

  async function handlePickAvatar(file: File) {
    setIsUploadingAvatar(true);
    try {
      const tempUrl = queueFile(file);
      setProfileValue("avatar_url", tempUrl, {
        shouldDirty: true,
        shouldValidate: true,
      });
      toast.info("Foto lista. Guardá los cambios para aplicarla.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la foto.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const handleSaveProfile = handleProfileSubmit(async (values) => {
    if (!user) return;
    try {
      const processedValues = await processPendingUploads(values, "avatars");
      await updateProfile({
        id: user.id,
        name: processedValues.name,
        phone: processedValues.phone,
        personal_email: processedValues.personal_email,
        // El schema ya normalizó la cuenta; `undefined` y `null` significan lo
        // mismo acá: limpiar lo guardado.
        bank_account: processedValues.bank_account ?? null,
        avatar_url: processedValues.avatar_url ?? null,
      }).unwrap();
      toast.success("Perfil actualizado correctamente");
      onClose();
    } catch (error: any) {
      toast.error(error?.data?.error || "Error al actualizar el perfil");
    }
  });

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      {/* El formulario es más alto que la ventana: el diálogo scrollea SOLO
          en el cuerpo y el pie con «Guardar» queda fijo. Con el scroll en el
          contenedor entero había que bajar hasta el final para encontrarlo —
          y si la ventana era baja, no se alcanzaba nunca. */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle>Información del Empleado</DialogTitle>
          <DialogDescription>
            Consulta y edita los datos del empleado o revisa su rendimiento de ventas.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <Tabs
            value={detailTab}
            onValueChange={setDetailTab}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="shrink-0 px-6 pt-4">
              <TabsList className="w-full">
                <TabsTrigger value="editar" className="flex-1">
                  Editar
                </TabsTrigger>
                <TabsTrigger value="rendimiento" className="flex-1">
                  Rendimiento
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Tab Editar ── */}
            <TabsContent value="editar" className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-4">
                {/* ── Sección 1: Datos del empleado ── */}
                <section className="grid gap-5">
                  <header>
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      Datos del empleado
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Se guardan todos juntos con el botón de abajo.
                    </p>
                  </header>

                  <AvatarPicker
                    src={avatarUrl}
                    name={user.name || user.email}
                    uploading={isUploadingAvatar}
                    onPick={handlePickAvatar}
                    onRemove={() =>
                      setProfileValue("avatar_url", null, { shouldValidate: true, shouldDirty: true })
                    }
                    hint="La foto se aplica al guardar los cambios."
                  />

                  <div className="grid gap-4">
                    <Field data-invalid={!!profileErrors.name}>
                      <FieldLabel htmlFor="edit-display-name" required>
                        Nombre a mostrar
                      </FieldLabel>
                      <Input
                        id="edit-display-name"
                        aria-required
                        aria-invalid={!!profileErrors.name}
                        {...registerProfile("name")}
                      />
                      <FieldError errors={[profileErrors.name]} />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="edit-correo">Correo Corporativo</FieldLabel>
                      <Input id="edit-correo" type="email" value={user.email} disabled readOnly />
                      <p className="mt-1 text-2xs text-muted-foreground">
                        El correo está vinculado a Microsoft Entra ID y no se puede modificar.
                      </p>
                    </Field>

                    <Field data-invalid={!!profileErrors.personal_email}>
                      <FieldLabel htmlFor="edit-personal-email">Correo Personal</FieldLabel>
                      <Input
                        id="edit-personal-email"
                        type="email"
                        placeholder="usuario@gmail.com"
                        aria-invalid={!!profileErrors.personal_email}
                        {...registerProfile("personal_email")}
                      />
                      <FieldError errors={[profileErrors.personal_email]} />
                    </Field>

                    <Field data-invalid={!!profileErrors.phone}>
                      <FieldLabel htmlFor="edit-phone">Número de Teléfono</FieldLabel>
                      <Input
                        id="edit-phone"
                        placeholder="+505 0000 0000"
                        aria-invalid={!!profileErrors.phone}
                        {...registerProfile("phone")}
                      />
                      <FieldError errors={[profileErrors.phone]} />
                    </Field>

                    <ProfileBankFields form={profileForm} idPrefix="edit" />
                  </div>
                </section>

                {/* ── Sección 2: Administración ── */}
                {/* Enmarcada y con su propio aviso: estos controles NO esperan al
                    botón de guardar. Un select de rol que se aplica solo, junto a
                    un formulario que no, necesita decirlo — si no, se cambia el rol
                    y se cierra el diálogo creyendo que no se guardó nada. */}
                <section className="grid gap-4 rounded-card border border-border bg-muted/30 p-4">
                  <header>
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      Administración
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Permisos y estado de la cuenta. Se aplican al instante.
                    </p>
                  </header>

                  <Field>
                    <FieldLabel htmlFor="edit-role">Rol Principal</FieldLabel>
                    <Select
                      value={user.roles[0] || "seller"}
                      onValueChange={(v) => changeRole(user, v as AppRole)}
                      disabled={isProtectedUser(user)}
                    >
                      <SelectTrigger id="edit-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isProtectedUser(user) && (
                      <p className="mt-1 text-2xs text-muted-foreground">
                        Este usuario está protegido por el sistema: su rol no se puede cambiar.
                      </p>
                    )}
                  </Field>

                  {!user.deleted_at ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        suspend(user);
                        onClose();
                      }}
                      disabled={isProtectedUser(user)}
                    >
                      <HugeIcon
                        icon={UserRemove01Icon}
                        size={16}
                        strokeWidth={2}
                        className="mr-2"
                        aria-hidden
                      />
                      Archivar (Dar de baja)
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="w-full border-primary/50 text-primary hover:bg-primary/10"
                        onClick={() => {
                          restore(user);
                          onClose();
                        }}
                      >
                        <HugeIcon
                          icon={RefreshIcon}
                          size={16}
                          strokeWidth={2}
                          className="mr-2"
                          aria-hidden
                        />
                        Restaurar Usuario
                      </Button>

                      {/* Borrado PERMANENTE. Solo aparece sobre alguien que ya
                          está de baja: la papelera de 30 días es la red que evita
                          que un click borre a un empleado activo por error, y
                          saltársela desde la ficha la volvería decorativa.
                          `onRequestDelete` cierra esta ficha y abre el diálogo de
                          confirmación — apilar dos modales deja el de atrás
                          inerte y no se entiende cuál está preguntando qué. */}
                      {onRequestDelete && !isProtectedUser(user) && (
                        <Button
                          variant="ghost"
                          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={onRequestDelete}
                        >
                          <HugeIcon
                            icon={Delete02Icon}
                            size={16}
                            strokeWidth={2}
                            className="mr-2"
                            aria-hidden
                          />
                          Eliminar definitivamente
                        </Button>
                      )}
                    </>
                  )}
                </section>
              </div>

              {/* Pie FIJO: fuera del área que scrollea, para que «Guardar»
                  esté siempre a la vista sin importar cuánto crezca el form.
                  Es la acción de «Datos del empleado» — lo de «Administración»
                  ya se aplicó solo. */}
              <div className="shrink-0 border-t border-border px-6 py-4">
                <Button
                  variant="default"
                  className="w-full"
                  onClick={handleSaveProfile}
                  disabled={isUpdatingProfile || isUploadingAvatar}
                >
                  <HugeIcon
                    icon={RefreshIcon}
                    size={16}
                    strokeWidth={2}
                    className={`mr-2 ${isUpdatingProfile ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                  {isUpdatingProfile ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </TabsContent>

            {/* ── Tab Rendimiento ── */}
            <TabsContent
              value="rendimiento"
              className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
            >
              {detailTab === "rendimiento" && <PerformanceTab userId={user.id} />}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
