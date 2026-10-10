// Pedidos web (Centro de Administración): lo que entra por el checkout de la
// tienda. Acá se mueve el estado que el cliente ve en su link de seguimiento
// (/pedido/<id>), sin que tenga cuenta.
import { HugeIcon } from '~/components/ui/icon';
import {
  ArrowDown01Icon,
  Copy01Icon,
  Location01Icon,
  ShoppingBag01Icon,
  Store01Icon,
  TruckIcon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { Link, useNavigate } from '@remix-run/react';
import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin } from '~/store/slices/authSlice';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { toast } from 'sonner';
import { PUBLIC_ORDER_STATUSES, type PublicOrderStatus } from '@shared/schemas';

import { pageTitle } from '~/lib/brand';
import { PageHeader } from '~/components/layout/PageHeader';
import { Skeleton } from '~/components/ui/skeleton';
import { StatusBadge } from '~/components/ui/StatusBadge';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import {
  Metric,
  MetricStrip,
  SegmentedControl,
  ToolbarSearch,
  Workspace,
  WorkspaceToolbar,
} from '~/components/admin/workspace';
import { cn } from '~/lib/utils';
import { buildWhatsappUrl, errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import { PUBLIC_ORDER_STATUS, publicOrderStatusLabel, statusMeta } from '~/lib/status';
import {
  useConvertPublicOrderToSaleMutation,
  useGetAdminPublicOrdersQuery,
  useUpdatePublicOrderStatusMutation,
  type AdminPublicOrder,
} from '~/store/api/publicOrdersApi';

export const meta: MetaFunction = () => [{ title: pageTitle('Pedidos web', { admin: true }) }];

type Filter = 'open' | 'delivered' | 'cancelled' | 'all';

// "Abiertos" = lo que todavía requiere que alguien haga algo.
const OPEN: PublicOrderStatus[] = ['new', 'preparing', 'shipped'];

const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

// El checkout guarda el teléfono como lo escribió el cliente; wa.me necesita el
// código de país, así que un número local de 8 dígitos se asume de Nicaragua.
const waPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 8 ? `505${digits}` : digits;
};

function trackingLink(id: string) {
  return `${window.location.origin}/pedido/${id}`;
}

export default function AdminPedidosWeb() {
  const { data = [], isLoading } = useGetAdminPublicOrdersQuery();
  const [updateStatus] = useUpdatePublicOrderStatusMutation();
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function changeStatus(order: AdminPublicOrder, status: PublicOrderStatus) {
    if (status === order.status) return;
    try {
      await updateStatus({ id: order.id, status }).unwrap();
      toast.success(`${shortId(order.id)}: ${publicOrderStatusLabel(status, order.deliveryMethod)}.`);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo cambiar el estado.'));
    }
  }

  function copyTracking(id: string) {
    navigator.clipboard.writeText(trackingLink(id)).then(() => toast.success('Link de seguimiento copiado.'));
  }

  const counts = {
    new: data.filter((o) => o.status === 'new').length,
    open: data.filter((o) => OPEN.includes(o.status)).length,
    delivered: data.filter((o) => o.status === 'delivered').length,
    deliveredTotal: data.filter((o) => o.status === 'delivered').reduce((acc, o) => acc + o.total, 0),
  };

  const q = search.trim().toLowerCase();
  const rows = data.filter((o) => {
    if (filter === 'open' && !OPEN.includes(o.status)) return false;
    if (filter === 'delivered' && o.status !== 'delivered') return false;
    if (filter === 'cancelled' && o.status !== 'cancelled') return false;
    if (!q) return true;
    return [o.id.slice(0, 8), o.customerName, o.phone, ...o.items.map((i) => i.name)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q.replace(/^#/, '')));
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Pedidos web"
        description="Lo que entra por la tienda. El estado que elijas acá es el que ve el cliente en su link de seguimiento."
        className="mb-0"
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Estado del pedido"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: 'Abiertos' },
              { value: 'delivered', label: 'Entregados' },
              { value: 'cancelled', label: 'Cancelados' },
              { value: 'all', label: 'Todos' },
            ]}
          />
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar número, cliente, teléfono o producto" />
        </WorkspaceToolbar>

        <MetricStrip>
          <Metric label="Nuevos sin atender" value={counts.new} />
          <Metric label="Abiertos" value={counts.open} />
          <Metric label="Entregados" value={counts.delivered} />
          <Metric label="Vendido (entregados)" value={formatCordobas(counts.deliveredTotal)} />
        </MetricStrip>

        <div className="overflow-clip rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <HugeIcon icon={ShoppingBag01Icon} size={32} className="mb-2 opacity-50" />
              <p className="text-sm">
                {data.length === 0 ? 'Todavía no entró ningún pedido web.' : 'Ningún pedido coincide con la búsqueda o el filtro.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((o) => {
                const meta = statusMeta(PUBLIC_ORDER_STATUS, o.status);
                const isOpen = expanded === o.id;
                const units = o.items.reduce((acc, i) => acc + i.quantity, 0);
                return (
                  <div key={o.id} className={cn('transition-colors', isOpen ? 'bg-muted/20' : 'hover:bg-muted/30')}>
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : o.id)}
                        aria-expanded={isOpen}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none"
                      >
                        <HugeIcon
                          icon={ArrowDown01Icon}
                          size={16}
                          className={cn('mt-1 shrink-0 text-muted-foreground transition-transform', !isOpen && '-rotate-90')}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-spec text-sm font-semibold text-foreground">{shortId(o.id)}</span>
                            <span className="truncate text-sm text-foreground">{o.customerName || 'Sin nombre'}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {formatLongDate(o.createdAt)} · {units} {units === 1 ? 'producto' : 'productos'} ·{' '}
                            {o.deliveryMethod === 'envio' ? 'Envío' : 'Retiro en tienda'}
                          </p>
                        </div>
                      </button>

                      <span className="text-sm font-semibold tabular-nums text-foreground sm:w-28 sm:text-right">
                        {formatCordobas(o.total)}
                      </span>

                      <div className="flex items-center gap-2 sm:ml-auto">
                        <StatusBadge
                          status={meta.status}
                          label={publicOrderStatusLabel(o.status, o.deliveryMethod)}
                          className="hidden md:inline-flex"
                        />
                        <Select value={o.status} onValueChange={(v) => changeStatus(o, v as PublicOrderStatus)}>
                          <SelectTrigger className="h-9 w-[170px]" aria-label={`Estado de ${shortId(o.id)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PUBLIC_ORDER_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {publicOrderStatusLabel(s, o.deliveryMethod)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {isOpen && <OrderDetail order={o} onCopyTracking={() => copyTracking(o.id)} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Workspace>
    </div>
  );
}

// Convertir en venta: crea la venta pendiente en Ventas, a nombre de quien
// convierte (se corrige editando la venta), con el stock que el pedido ya tenía
// apartado. Solo admin, y una sola vez por pedido.
function ConvertToSale({ order }: { order: AdminPublicOrder }) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const navigate = useNavigate();
  const [convert, { isLoading }] = useConvertPublicOrderToSaleMutation();
  const [confirming, setConfirming] = useState(false);

  if (order.saleId) {
    return (
      <Link
        to={`/admin/ventas?status=all&sale=${order.saleId}`}
        className="inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm text-foreground transition-colors hover:bg-muted"
      >
        Ver la venta
      </Link>
    );
  }
  if (!isAdmin || order.status === 'cancelled') return null;

  async function run() {
    try {
      const { saleId } = await convert({ id: order.id }).unwrap();
      toast.success(`${shortId(order.id)} quedó como venta pendiente de aprobación.`);
      navigate(`/admin/ventas?sale=${saleId}`);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo convertir el pedido en venta.'));
    } finally {
      setConfirming(false);
    }
  }

  return confirming ? (
    <div className="space-y-2 rounded-2xl border p-3">
      <p className="text-xs text-muted-foreground">
        Se crea una venta pendiente a tu nombre, con estos productos y el stock que el pedido ya tenía apartado. Podés
        cambiar el vendedor editándola en Ventas.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={run} disabled={isLoading} className="flex-1">
          {isLoading && <Spinner className="mr-2" />}
          Confirmar
        </Button>
        <Button size="sm" variant="cancel" onClick={() => setConfirming(false)} disabled={isLoading}>
          Cancelar
        </Button>
      </div>
    </div>
  ) : (
    <Button variant="outline" className="h-9" onClick={() => setConfirming(true)}>
      Convertir en venta
    </Button>
  );
}

function OrderDetail({ order, onCopyTracking }: { order: AdminPublicOrder; onCopyTracking: () => void }) {
  const greeting = `Hola ${order.customerName?.split(' ')[0] ?? ''}, te escribimos de la tienda por tu pedido ${shortId(order.id)}.`;
  return (
    <div className="grid gap-6 px-4 pb-5 pl-11 md:grid-cols-[1fr_280px]">
      <ul className="divide-y rounded-xl border bg-card">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 p-3">
            {item.image ? (
              <img src={item.image} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="size-10 shrink-0 rounded-xl bg-muted" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {item.name}
              {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">×{item.quantity}</span>
            <span className="w-24 text-right text-sm tabular-nums text-foreground">
              {formatCordobas(item.unitPrice * item.quantity)}
            </span>
          </li>
        ))}
        {order.codeDiscount > 0 && (
          <li className="flex justify-between p-3 text-sm text-muted-foreground">
            <span>Código {order.discountCode}</span>
            <span className="tabular-nums">−{formatCordobas(order.codeDiscount)}</span>
          </li>
        )}
      </ul>

      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 text-foreground">
          <HugeIcon
            icon={order.deliveryMethod === 'envio' ? TruckIcon : Store01Icon}
            size={16}
            className="mt-0.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div>
            <p>{order.deliveryMethod === 'envio' ? 'Envío a domicilio' : 'Retiro en tienda'}</p>
            {order.address && <p className="text-muted-foreground">{order.address}</p>}
            {order.locationUrl && (
              <a
                href={order.locationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <HugeIcon icon={Location01Icon} size={14} aria-hidden />
                Ver ubicación
              </a>
            )}
          </div>
        </div>
        {order.note && <p className="rounded-xl bg-muted/50 p-2 text-muted-foreground">“{order.note}”</p>}

        <div className="flex flex-col gap-2 pt-1">
          {order.phone && (
            <a
              href={buildWhatsappUrl(waPhone(order.phone), greeting)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-whatsapp/30 bg-whatsapp/10 px-3 text-sm font-medium text-whatsapp transition-colors hover:bg-whatsapp/15"
            >
              <WhatsappIcon className="h-4 w-4" />
              Escribir a {order.phone}
            </a>
          )}
          <button
            type="button"
            onClick={onCopyTracking}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <HugeIcon icon={Copy01Icon} size={14} aria-hidden />
            Copiar link de seguimiento
          </button>
          <ConvertToSale order={order} />
        </div>
      </div>
    </div>
  );
}
