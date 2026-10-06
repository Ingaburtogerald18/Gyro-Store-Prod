// «Mis pedidos» sin cuenta: los pedidos hechos (o abiertos por link) desde este
// navegador, más un buscador por número de pedido + teléfono para quien cambió
// de celular o borró el navegador.
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight01Icon, PackageIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { trackPublicOrderSchema } from '@shared/schemas';

import { pageTitle } from '~/lib/brand';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import { StatusBadge } from '~/components/ui/StatusBadge';
import { errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import { PUBLIC_ORDER_STATUS, publicOrderStatusLabel, statusMeta } from '~/lib/status';
import { loadOrders, type SavedOrder } from '~/lib/orderHistory';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { useGetPublicOrderQuery, useTrackPublicOrderMutation } from '~/store/api/storefrontApi';
import type { StoreConfig } from '~/store/api/sessionApi';

export const meta: MetaFunction = () => [
  { title: pageTitle('Mis pedidos') },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  let config: StoreConfig | null = null;
  try {
    const res = await fetch(`${origin}/api/config`);
    if (res.ok) config = (await res.json()) as StoreConfig;
  } catch {
    // Sin config la página sale igual.
  }
  return { config };
}

const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

// El formulario trabaja con lo que escribe la persona; el schema compartido
// normaliza (quita el #, espacios y guiones) al validar.
type TrackForm = z.input<typeof trackPublicOrderSchema>;

export default function MisPedidos() {
  // localStorage solo existe en el navegador: se lee después de hidratar para
  // que el HTML del servidor y el del cliente coincidan.
  const [orders, setOrders] = useState<SavedOrder[] | null>(null);
  useEffect(() => setOrders(loadOrders()), []);

  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">Mis pedidos</h1>
        <p className="mt-1 text-muted-foreground">Los pedidos que hiciste desde este celular o computadora.</p>

        <section className="mt-6">
          {orders === null ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed py-10 text-center text-muted-foreground">
              <HugeIcon icon={PackageIcon} size={28} className="mb-2 opacity-60" aria-hidden />
              <p className="text-sm">Todavía no hay pedidos guardados en este dispositivo.</p>
              <p className="text-sm">Si ya compraste, buscalo abajo.</p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {orders.map((o) => (
                <OrderRow key={o.id} saved={o} />
              ))}
            </ul>
          )}
        </section>

        <TrackOrder />
      </main>
    </StorefrontShell>
  );
}

// Cada fila pide su estado actual: lo guardado en el navegador puede estar viejo.
function OrderRow({ saved }: { saved: SavedOrder }) {
  const config = useStoreConfig();
  const { data } = useGetPublicOrderQuery(saved.id);
  const status = data?.status;
  return (
    <li>
      <Link
        to={`/pedido/${saved.id}`}
        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <p className="font-spec text-sm font-semibold text-foreground">{shortId(saved.id)}</p>
          <p className="text-xs text-muted-foreground">
            {formatLongDate(saved.createdAt)} · {formatCordobas(saved.total, config?.currency)}
          </p>
        </div>
        {status ? (
          <StatusBadge
            status={statusMeta(PUBLIC_ORDER_STATUS, status).status}
            label={publicOrderStatusLabel(status, data?.deliveryMethod ?? null)}
          />
        ) : (
          <Skeleton className="h-6 w-24 rounded-full" />
        )}
        <HugeIcon icon={ArrowRight01Icon} size={16} className="text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function TrackOrder() {
  const navigate = useNavigate();
  const [track, { isLoading }] = useTrackPublicOrderMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrackForm>({ resolver: zodResolver(trackPublicOrderSchema), defaultValues: { code: '', phone: '' } });

  async function onSubmit(values: TrackForm) {
    try {
      // El resolver ya validó; el servidor vuelve a normalizar con el mismo schema.
      const { id } = await track(values as z.output<typeof trackPublicOrderSchema>).unwrap();
      navigate(`/pedido/${id}`);
    } catch (err) {
      toast.error(errMsg(err, 'No encontramos un pedido con esos datos.'));
    }
  }

  return (
    <section className="mt-10 rounded-xl border bg-card p-5">
      <h2 className="font-heading text-lg font-bold text-foreground">Buscar un pedido</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        El número de pedido aparece en la confirmación y en tu mensaje de WhatsApp (por ejemplo, #A1B2C3D4).
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="track-code">Número de pedido</FieldLabel>
          <Input id="track-code" placeholder="#A1B2C3D4" autoComplete="off" {...register('code')} />
          <FieldError errors={[errors.code]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="track-phone">Teléfono con el que compraste</FieldLabel>
          <Input id="track-phone" type="tel" inputMode="tel" placeholder="8888 8888" {...register('phone')} />
          <FieldError errors={[errors.phone]} />
        </Field>
        <Button type="submit" disabled={isLoading} className="sm:col-span-2">
          {isLoading ? 'Buscando…' : 'Buscar pedido'}
        </Button>
      </form>
    </section>
  );
}
