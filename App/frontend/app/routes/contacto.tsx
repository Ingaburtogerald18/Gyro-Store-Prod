// Formulario de contacto público: guarda el lead directo en el CRM
// (POST /api/contact), por eso el teléfono es obligatorio.
import { HugeIcon } from "~/components/ui/icon";
import { Location01Icon } from "@hugeicons/core-free-icons";
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { toast } from 'sonner';
import { publicContactInputSchema, type PublicContactInput } from '@shared/schemas';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import { Button } from '~/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { errMsg } from "~/lib/formatters";
import { PaymentAccounts } from '~/components/store/payment-accounts';
import { useSendContactMutation } from '~/store/api/storefrontApi';
import type { StoreConfig } from '~/store/api/sessionApi';
import { useStoreConfig } from '~/hooks/useStoreConfig';

export const meta: MetaFunction = () => [{ title: pageTitle('Contacto') }];

// La config va en el loader para que el header (logo), el pie y la dirección
// salgan en el HTML del servidor, como en el resto de las rutas públicas.
export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  let config: StoreConfig | null = null;
  try {
    const res = await fetch(`${origin}/api/config`);
    if (res.ok) config = (await res.json()) as StoreConfig;
  } catch {
    // Sin config la página sale igual, con la dirección por defecto.
  }
  return { config };
}


export default function Contacto() {
  const [sendContact, { isLoading }] = useSendContactMutation();
  const config = useStoreConfig();
  // Sin dirección cargada todavía, se cae al literal de siempre en vez de dejar
  // un enlace a Maps vacío.
  const address = config?.address?.trim() || 'Managua, Nicaragua';
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PublicContactInput>({ resolver: zodResolver(publicContactInputSchema) });

  async function onSubmit(data: PublicContactInput) {
    try {
      await sendContact(data).unwrap();
      reset();
      toast.success('Mensaje enviado. Te respondemos pronto.');
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo enviar el mensaje.'));
    }
  }

  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">Contacto</h1>
        <p className="mt-1 text-muted-foreground">¿Tenés una consulta? Escribinos y te respondemos.</p>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <form onSubmit={handleSubmit(onSubmit)}>
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

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Enviando…' : 'Enviar mensaje'}
              </Button>
            </FieldGroup>
          </form>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 shadow-xs">
              <h2 className="font-heading text-lg font-bold text-foreground">Visitanos</h2>
              {/* La dirección sale de la config editable en el panel, no de un
                  literal: estaba hardcodeada como "Managua, Nicaragua" mientras
                  `business_info.address` ya existía y nadie la leía, así que
                  cambiarla desde Configuración no tenía efecto acá. */}
              <a
                href={config?.locationUrl?.trim() || `https://maps.google.com/?q=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden /> {address}
              </a>
            </div>

            {/* No renderiza nada si el admin no cargó ninguna cuenta. */}
            <PaymentAccounts className="rounded-2xl border bg-card p-5 shadow-xs" />
          </div>
        </div>
      </main>
    </StorefrontShell>
  );
}
