// Seguimiento de un pedido sin cuenta: /pedido/<id>. El link sale en la
// confirmación del checkout y dentro del mensaje de WhatsApp, así que queda en
// el chat del cliente. El estado lo mueve la tienda desde «Pedidos web».
import { HugeIcon } from '~/components/ui/icon';
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  PackageIcon,
  Store01Icon,
  TruckIcon,
} from '@hugeicons/core-free-icons';
import { useEffect } from 'react';
import { Link, useParams } from '@remix-run/react';
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';

import { pageTitle } from '~/lib/brand';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { cn } from '~/lib/utils';
import { buildWhatsappUrl, formatCordobas, formatLongDate } from '~/lib/formatters';
import { PUBLIC_ORDER_STEPS, publicOrderStatusLabel } from '~/lib/status';
import { saveOrder } from '~/lib/orderHistory';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { useGetPublicOrderQuery, type PublicOrderTracking } from '~/store/api/storefrontApi';
import type { StoreConfig } from '~/store/api/sessionApi';

export const meta: MetaFunction = () => [
  { title: pageTitle('Seguimiento de pedido') },
  // El link es privado de quien compró: que no lo indexe ningún buscador.
  { name: 'robots', content: 'noindex, nofollow' },
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

// Qué significa cada paso para el cliente, en una línea.
function stepHint(status: string, deliveryMethod: string | null): string {
  switch (status) {
    case 'new':
      return 'La tienda recibió tu pedido y te va a confirmar por WhatsApp.';
    case 'preparing':
      return 'Estamos alistando tus productos.';
    case 'shipped':
      return deliveryMethod === 'retiro' ? 'Ya podés pasar a retirarlo a la tienda.' : 'Tu pedido va en camino.';
    case 'delivered':
      return '¡Listo! Gracias por tu compra.';
    case 'cancelled':
      return 'Este pedido se canceló. Si es un error, escribinos.';
    default:
      return '';
  }
}

export default function PedidoSeguimiento() {
  const { id = '' } = useParams();
  const config = useStoreConfig();
  // Se refresca solo cada minuto: el cliente puede dejar la página abierta.
  const { data: order, isLoading, isError } = useGetPublicOrderQuery(id, {
    pollingInterval: 60_000,
    refetchOnFocus: true,
  });

  // Quien abre el link desde WhatsApp en otro celular también lo ve en «Mis pedidos».
  useEffect(() => {
    if (order) saveOrder({ id: order.id, createdAt: order.createdAt, total: order.total });
  }, [order]);

  return (
    <StorefrontShell>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : isError || !order ? (
          <NotFound />
        ) : (
          <OrderView order={order} currency={config?.currency} storeWhatsapp={config?.whatsapp} />
        )}
      </main>
    </StorefrontShell>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
        <HugeIcon icon={PackageIcon} size={28} />
      </span>
      <h1 className="font-heading text-2xl font-extrabold text-foreground">No encontramos ese pedido</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Revisá que el link esté completo, o buscalo con tu número de pedido y tu teléfono.
      </p>
      <Button asChild className="mt-6">
        <Link to="/mis-pedidos">Buscar mi pedido</Link>
      </Button>
    </div>
  );
}

function OrderView({
  order,
  currency,
  storeWhatsapp,
}: {
  order: PublicOrderTracking;
  currency?: string;
  storeWhatsapp?: string;
}) {
  const cancelled = order.status === 'cancelled';
  const current = PUBLIC_ORDER_STEPS.indexOf(order.status as (typeof PUBLIC_ORDER_STEPS)[number]);
  const subtotal = order.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {order.firstName ? `Hola ${order.firstName} · ` : ''}Pedido{' '}
          <span className="font-spec font-semibold text-foreground">{shortId(order.id)}</span> ·{' '}
          {formatLongDate(order.createdAt)}
        </p>
        <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-foreground">
          {publicOrderStatusLabel(order.status, order.deliveryMethod)}
        </h1>
        {cancelled && <p className="mt-1 text-muted-foreground">{stepHint(order.status, order.deliveryMethod)}</p>}
      </div>

      {cancelled ? (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <HugeIcon icon={Cancel01Icon} size={22} aria-hidden />
          <span className="font-medium">Pedido cancelado</span>
        </div>
      ) : (
        <ol className="rounded-xl border bg-card p-5">
          {PUBLIC_ORDER_STEPS.map((step, i) => {
            const done = i < current;
            const active = i === current;
            const last = i === PUBLIC_ORDER_STEPS.length - 1;
            const icon =
              step === 'shipped' ? (order.deliveryMethod === 'retiro' ? Store01Icon : TruckIcon) : step === 'delivered' ? CheckmarkCircle02Icon : PackageIcon;
            return (
              <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
                {!last && (
                  <span
                    className={cn('absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5', i < current ? 'bg-primary' : 'bg-border')}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    'relative grid size-8 shrink-0 place-items-center rounded-full border-2',
                    done && 'border-primary bg-primary text-primary-foreground',
                    active && 'border-primary bg-primary/10 text-primary',
                    !done && !active && 'border-border bg-card text-muted-foreground',
                  )}
                  aria-hidden
                >
                  <HugeIcon icon={done ? CheckmarkCircle02Icon : icon} size={16} strokeWidth={2} />
                </span>
                <div className="pt-1">
                  <p className={cn('font-medium', active || done ? 'text-foreground' : 'text-muted-foreground')}>
                    {publicOrderStatusLabel(step, order.deliveryMethod)}
                    {active && <span className="sr-only"> (estado actual)</span>}
                  </p>
                  {active && <p className="text-sm text-muted-foreground">{stepHint(step, order.deliveryMethod)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3 text-sm font-semibold text-foreground">Tu pedido</h2>
        <ul className="divide-y">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              {item.image ? (
                <img src={item.image} alt="" className="size-12 shrink-0 rounded-md object-contain" />
              ) : (
                <span className="size-12 shrink-0 rounded-md bg-muted" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{item.name}</p>
                {item.variantName && <p className="truncate text-xs text-muted-foreground">{item.variantName}</p>}
                <p className="text-xs text-muted-foreground">Cantidad: {item.quantity}</p>
              </div>
              <span className="text-sm tabular-nums text-foreground">
                {formatCordobas(item.unitPrice * item.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t px-5 py-3 text-sm">
          {order.codeDiscount > 0 && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCordobas(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Descuento</span>
                <span className="tabular-nums">−{formatCordobas(order.codeDiscount, currency)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-base font-bold text-foreground">
            <span>Total</span>
            <span className="tabular-nums">{formatCordobas(order.total, currency)}</span>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        {storeWhatsapp && (
          <Button variant="whatsapp" className="h-11 flex-1" asChild>
            <a
              href={buildWhatsappUrl(storeWhatsapp, `Hola, consulto por mi pedido ${shortId(order.id)}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsappIcon className="h-4 w-4" />
              Preguntar por mi pedido
            </a>
          </Button>
        )}
        <Button variant="outline" className="h-11 flex-1" asChild>
          <Link to="/mis-pedidos">Ver mis pedidos</Link>
        </Button>
      </div>
    </div>
  );
}
