import { FormLayout, FormBody, FormActions } from '~/components/ui/form-layout';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
import { useState } from 'react';
// Formulario de contacto público: guarda el lead directo en el CRM
// (POST /api/contact), por eso el teléfono es obligatorio.
import { HugeIcon } from '~/components/ui/icon';
import { Location01Icon } from '@hugeicons/core-free-icons';
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { readStoreFrame, storeReader } from '~/lib/store-reader.server';
import { getBrandName, pageTitle } from '~/lib/brand';
import { canonicalLink } from '~/lib/seo';
import { siteOrigin } from '~/lib/site-url.server';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { toast } from 'sonner';
import { publicContactInputSchema, type PublicContactInput } from '@shared/schemas';
import { StorefrontShell } from '~/components/storefront/storefront-shell';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';

import { PaymentAccounts } from '~/components/storefront/payment-accounts';
import { useSendContactMutation } from '~/state/api/storefront-api';
import { useStoreConfig } from '~/hooks/use-store-config';
import { BusinessHoursList } from '~/components/storefront/store-details';
import { LOCATION_ANCHOR, storeMapsUrl } from '~/lib/store-pages';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: pageTitle('Contacto') },
  {
    name: 'description',
    content: `Escribinos por WhatsApp o dejá tu consulta a ${data?.config?.brandName || getBrandName()}, tienda en línea en Managua, Nicaragua.`,
  },
  ...(data ? [canonicalLink(data.canonicalUrl)] : []),
];

// La config va en el loader para que el header (logo), el pie y la dirección
// salgan en el HTML del servidor, como en el resto de las rutas públicas.
export async function loader({ request, context }: LoaderFunctionArgs) {
  // Sin config la página sale igual, con la dirección por defecto.
  const frame = await readStoreFrame(storeReader(context, request));
  return { ...frame, canonicalUrl: `${siteOrigin(request)}/contacto` };
}


export default function Contacto() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sendContact, { isLoading }] = useSendContactMutation();
  const config = useStoreConfig();
  // Sin dirección cargada todavía, se cae al literal de siempre en vez de dejar
  // un enlace a Maps vacío.
  const address = config?.address?.trim() || 'Managua, Nicaragua';
  const policies = config?.policies;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PublicContactInput>({ resolver: zodResolver(publicContactInputSchema) });

  async function onSubmit(data: PublicContactInput) {
    setServerError(null);
    try {
      await sendContact(data).unwrap();
      reset();
      toast.success('Mensaje enviado. Te respondemos pronto.');
    } catch (err) {
      setServerError(serverErrorMessage(err, 'No se pudo enviar el mensaje.'));
    }
  }

  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
          Contacto
        </h1>
        <p className="mt-1 text-muted-foreground">
          ¿Tenés una consulta? Escribinos y te respondemos.
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <FormLayout mode="page" onSubmit={handleSubmit(onSubmit)}>
            <FormErrorBanner message={serverError} />
            <FormBody>
              <FieldGroup>
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="contact-name" required>
                    Nombre
                  </FieldLabel>
                  <Input
                    id="contact-name"
                    autoComplete="name"
                    placeholder="Tu nombre"
                    aria-required
                    aria-invalid={!!errors.name}
                    {...register('name')}
                  />
                  <FieldError errors={[errors.name]} />
                </Field>

                <Field data-invalid={!!errors.phone}>
                  <FieldLabel htmlFor="contact-phone" required>
                    Teléfono
                  </FieldLabel>
                  <Input
                    id="contact-phone"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="8888 8888"
                    aria-required
                    aria-invalid={!!errors.phone}
                    {...register('phone')}
                  />
                  <FieldError errors={[errors.phone]} />
                </Field>

                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="contact-email">Correo</FieldLabel>
                  <Input
                    id="contact-email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@correo.com"
                    aria-invalid={!!errors.email}
                    {...register('email')}
                  />
                  <FieldDescription>Opcional — te respondemos por WhatsApp.</FieldDescription>
                  <FieldError errors={[errors.email]} />
                </Field>

                <Field data-invalid={!!errors.message}>
                  <FieldLabel htmlFor="contact-message" required>
                    Mensaje
                  </FieldLabel>
                  <Textarea
                    id="contact-message"
                    rows={4}
                    placeholder="¿En qué te ayudamos?"
                    aria-required
                    aria-invalid={!!errors.message}
                    {...register('message')}
                  />
                  <FieldError errors={[errors.message]} />
                </Field>
              </FieldGroup>
            </FormBody>
            <FormActions>
              <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                {isLoading ? 'Enviando…' : 'Enviar mensaje'}
              </Button>
            </FormActions>
          </FormLayout>

          <div className="space-y-4">
            {/* Punto de retiro coordinado, no un local abierto: la dirección y el horario salen de Configuración. */}
            <div id={LOCATION_ANCHOR} className="scroll-below-header space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
              <h2 className="font-heading text-lg font-bold text-foreground">Retiro y horario</h2>
              <a
                href={storeMapsUrl({ address, locationUrl: config?.locationUrl })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Punto de retiro: </span>
                  {address}
                </span>
              </a>
              {policies?.pickup.text && <p className="text-sm text-muted-foreground">{policies.pickup.text}</p>}
              <div className="text-sm text-muted-foreground">
                <BusinessHoursList />
              </div>
            </div>

            {/* No renderiza nada si el admin no cargó ninguna cuenta. */}
            <PaymentAccounts className="rounded-2xl border bg-card p-5 shadow-xs" />
          </div>
        </div>
      </main>
    </StorefrontShell>
  );
}
