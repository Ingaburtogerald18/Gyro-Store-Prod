// «Mi perfil»: cada persona del staff edita SUS propios datos, sin pasar por un
// admin. Cualquier rol entra (se llega desde el menú del avatar del header).
//
// ── Qué se puede tocar acá y qué no ──
// Foto, nombre a mostrar, teléfono, correo personal y cuenta bancaria de pagos.
// NO el rol (lo asigna un admin en Personal) ni el correo corporativo (lo
// administra Microsoft Entra ID). Los dos se muestran de solo lectura, porque
// esconderlos hace que la gente los busque; verlos apagados explica solo que no
// son negociables desde acá.
//
// La foto se aplica AL INSTANTE (`POST /api/me/avatar`) y el resto con «Guardar
// cambios» (`PATCH /api/me/profile`): una imagen que ya se ve en pantalla pero
// que todavía no está guardada es una trampa, y al subirla ya se pagó el viaje al
// servidor de todos modos.
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { MetaFunction } from '@remix-run/node';
import { HugeIcon } from '~/components/ui/icon';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

import { updateProfileSchema, type UpdateProfileInput } from '@shared/schemas';
import { pageTitle } from '~/lib/brand';
import {
  useDeleteMyAvatarMutation,
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useUploadMyAvatarMutation,
  type AppRole,
} from '~/store/api/usersApi';

import { AvatarPicker } from '~/components/admin/users/AvatarPicker';
import { ProfileBankFields } from '~/components/admin/users/ProfileBankFields';
import { EMPTY_PROFILE_FORM, ROLE_LABELS } from '~/components/admin/users/constants';
import { PageHeader } from '~/components/layout/PageHeader';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { QueryState } from '~/components/ui/QueryState';
import { BrandLoader } from '~/components/ui/module-loader';

export const meta: MetaFunction = () => [{ title: pageTitle('Mi perfil', { admin: true }) }];

export default function AdminMiPerfil() {
  const { data: profile, isLoading, isError, refetch } = useGetMyProfileQuery();
  const [updateMyProfile, { isLoading: isSaving }] = useUpdateMyProfileMutation();
  const [uploadAvatar, { isLoading: isUploading }] = useUploadMyAvatarMutation();
  const [deleteAvatar, { isLoading: isDeletingAvatar }] = useDeleteMyAvatarMutation();

  // Mismo contrato que aplica el backend (`updateProfileSchema`), así que la
  // regla de Ficohsa=USD se evalúa acá y allá.
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: EMPTY_PROFILE_FORM,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  useEffect(() => {
    reset(
      profile
        ? {
            name: profile.name ?? '',
            phone: profile.phone ?? '',
            personal_email: profile.personal_email ?? '',
            bank_account: profile.bank_account ?? null,
          }
        : EMPTY_PROFILE_FORM,
    );
  }, [profile, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateMyProfile({
        name: values.name,
        phone: values.phone,
        personal_email: values.personal_email,
        // `undefined` y `null` significan lo mismo acá: limpiar lo guardado.
        bank_account: values.bank_account ?? null,
      }).unwrap();
      // La mutation invalida el tag 'Me', así que `/auth/me` se re-pide solo y el
      // header queda con el nombre nuevo sin recargar la página.
      toast.success('Tus datos se guardaron.');
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudieron guardar tus datos.');
    }
  });

  async function handlePickAvatar(file: File) {
    try {
      await uploadAvatar(file).unwrap();
      toast.success('Foto actualizada.');
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudo subir la foto.');
    }
  }

  async function handleRemoveAvatar() {
    try {
      await deleteAvatar().unwrap();
      toast.success('Foto quitada.');
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudo quitar la foto.');
    }
  }

  const ROLE_PRIORITY: AppRole[] = ['global_admin', 'admin', 'seller', 'cashier', 'logistics_admin', 'logistics_customer'];
  const role = ROLE_PRIORITY.find(r => profile?.roles?.includes(r));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mi perfil"
        description="Tu foto, tus datos de contacto y la cuenta donde recibís tus pagos."
      />

      <QueryState
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        errorMessage="No se pudo cargar tu perfil."
        loadingFallback={
          <div className="flex justify-center p-12">
            <BrandLoader text="Cargando tu perfil..." />
          </div>
        }
      >
        {profile && (
          // `max-w-lg`: es un formulario de una columna. Estirado a todo el ancho
          // del panel, los campos quedan de 1.400 px para escribir un teléfono.
          <Card className="max-w-lg">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-lg">Mis datos</CardTitle>
              <CardDescription>
                Estos datos los ve el equipo en Personal. La cuenta bancaria solo la ve un
                administrador.
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-6 p-4 sm:p-6">
              <AvatarPicker
                src={profile.avatar_url}
                name={profile.name || profile.email}
                uploading={isUploading || isDeletingAvatar}
                onPick={handlePickAvatar}
                onRemove={handleRemoveAvatar}
              />

              <div className="grid gap-4">
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="mi-nombre" required>
                    Nombre a mostrar
                  </FieldLabel>
                  <Input
                    id="mi-nombre"
                    aria-required
                    aria-invalid={!!errors.name}
                    {...register('name')}
                  />
                  <FieldError errors={[errors.name]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="mi-correo">Correo corporativo</FieldLabel>
                  <Input id="mi-correo" type="email" value={profile.email} disabled readOnly />
                  <p className="mt-1 text-2xs text-muted-foreground">
                    Lo administra Microsoft Entra ID y no se puede modificar.
                  </p>
                </Field>

                <Field>
                  <FieldLabel>Rol</FieldLabel>
                  <div>
                    <Badge variant="outline" className="text-xs">
                      {role ? ROLE_LABELS[role] ?? role : 'Sin rol asignado'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    Lo asigna un administrador desde Personal.
                  </p>
                </Field>

                <Field data-invalid={!!errors.personal_email}>
                  <FieldLabel htmlFor="mi-correo-personal">Correo personal</FieldLabel>
                  <Input
                    id="mi-correo-personal"
                    type="email"
                    placeholder="usuario@gmail.com"
                    aria-invalid={!!errors.personal_email}
                    {...register('personal_email')}
                  />
                  <FieldError errors={[errors.personal_email]} />
                </Field>

                <Field data-invalid={!!errors.phone}>
                  <FieldLabel htmlFor="mi-telefono">Número de teléfono</FieldLabel>
                  <Input
                    id="mi-telefono"
                    placeholder="+505 0000 0000"
                    aria-invalid={!!errors.phone}
                    {...register('phone')}
                  />
                  <FieldError errors={[errors.phone]} />
                </Field>

                <ProfileBankFields form={form} idPrefix="mi" legend="Mi cuenta bancaria (pagos)" />
              </div>
            </CardContent>

            <CardFooter className="border-t border-border pt-4">
              <Button className="w-full" onClick={onSubmit} disabled={isSaving}>
                <HugeIcon
                  icon={RefreshIcon}
                  size={16}
                  strokeWidth={2}
                  className={`mr-2 ${isSaving ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </CardFooter>
          </Card>
        )}
      </QueryState>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
