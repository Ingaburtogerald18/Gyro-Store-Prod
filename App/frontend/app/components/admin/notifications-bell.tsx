// Campana de notificaciones del panel. No tiene backend: se deriva de consultas
// que ya existen y lo "visto" vive en localStorage, así que solo avisa de ventas.
import { HugeIcon } from '~/components/ui/icon';
import {
  CheckmarkCircle02Icon,
  Cancel01Icon,
  MoneyBag02Icon,
  Notification03Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';

import { useNavigate } from '@remix-run/react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { useGetSalesQuery, type SaleListItem } from '~/state/api/sales-api';
import { useAppSelector } from '~/state/hooks';
import { selectIsAdmin } from '~/state/slices/auth-slice';
import { cn } from '~/lib/utils';
import { formatCordobas } from '~/lib/formatters';

const SEEN_KEY = 'gyro.seenSaleNotifs';

// Estados que le importan al VENDEDOR: son transiciones que alguien hizo sobre
// su venta y de las que se tiene que enterar.
const SELLER_STATES = ['paid', 'approved', 'rejected'] as const;
type SellerState = (typeof SELLER_STATES)[number];

const STATE_META: Record<
  SellerState,
  { icon: typeof MoneyBag02Icon; tone: string; one: string; many: (n: number) => string }
> = {
  paid: {
    icon: MoneyBag02Icon,
    tone: 'text-primary',
    one: 'Te pagaron tu comisión',
    many: (n) => `Te pagaron ${n} ventas`,
  },
  approved: {
    icon: CheckmarkCircle02Icon,
    tone: 'text-primary',
    one: 'Tu venta fue aprobada',
    many: (n) => `${n} ventas aprobadas`,
  },
  rejected: {
    icon: Cancel01Icon,
    tone: 'text-destructive',
    one: 'Tu venta fue rechazada',
    many: (n) => `${n} ventas rechazadas`,
  },
};

const money = (value: number) => formatCordobas(value, 'C$', 2);

export function NotificationsBell() {
  const isAdmin = useAppSelector(selectIsAdmin);
  const navigate = useNavigate();

  // El admin necesita las que esperan su aprobación; el vendedor, el desenlace
  // de las suyas. El backend ya recorta por rol, así que el vendedor recibe
  // solo lo propio aunque no se le mande filtro.
  const { data: pending = [], isLoading: pendingLoading, isError: pendingError } = useGetSalesQuery(
    { status: 'pending_approval' },
    { skip: !isAdmin, pollingInterval: 60_000 },
  );
  const { data: mySales = [], isLoading: salesLoading, isError: salesError } = useGetSalesQuery(undefined, { skip: isAdmin });

  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  // Hasta leer localStorage no se sabe qué está visto. Sin esta bandera el
  // servidor pintaría un punto de "no leído" que el cliente borra al hidratar.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) setSeen(new Set(JSON.parse(raw) as string[]));
    } catch {
      // localStorage puede estar bloqueado (modo privado). Se sigue sin memoria
      // de lo visto, que degrada bien: todo aparece como nuevo.
    }
    setIsHydrated(true);
  }, []);

  // Ventas por aprobar, agrupadas por vendedor (vista admin).
  const sellerGroups = useMemo(() => {
    const map = new Map<string, { email: string; count: number; total: number }>();
    for (const sale of pending) {
      const email = sale.sellerEmail || 'sin-vendedor';
      const group = map.get(email) ?? { email, count: 0, total: 0 };
      group.count += 1;
      group.total += sale.total || 0;
      map.set(email, group);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [pending]);

  // Desenlaces de las ventas propias (vista vendedor).
  const myGroups = useMemo(() => {
    const map = new Map<SellerState, { state: SellerState; count: number; total: number; ids: string[] }>();
    for (const sale of mySales as SaleListItem[]) {
      if (!SELLER_STATES.includes(sale.status as SellerState)) continue;
      const state = sale.status as SellerState;
      const group = map.get(state) ?? { state, count: 0, total: 0, ids: [] };
      group.count += 1;
      group.total += sale.total || 0;
      // El id incluye el estado: si una venta pasa de aprobada a pagada, es un
      // aviso NUEVO y no queda tapado por haber visto el anterior.
      group.ids.push(`${sale.id}:${sale.status}`);
      map.set(state, group);
    }
    return SELLER_STATES.map((state) => map.get(state)).filter(
      (group): group is NonNullable<typeof group> => Boolean(group),
    );
  }, [mySales]);

  const allIds = useMemo(() => myGroups.flatMap((group) => group.ids), [myGroups]);
  const unseen = isHydrated ? allIds.filter((id) => !seen.has(id)).length : 0;
  const pendingCount = sellerGroups.reduce((sum, group) => sum + group.count, 0);
  const badge = isAdmin ? pendingCount : unseen;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && isHydrated && allIds.length > 0) {
      const merged = new Set([...seen, ...allIds]);
      setSeen(merged);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...merged]));
      } catch {
        // Sin persistencia el aviso reaparece en la próxima carga. Molesto, no roto.
      }
    }
  }

  function goToSales(sellerEmail?: string) {
    setOpen(false);
    const query = sellerEmail && sellerEmail !== 'sin-vendedor'
      ? `?status=pending_approval&seller=${encodeURIComponent(sellerEmail)}`
      : '?status=pending_approval';
    navigate(`/admin/ventas${query}`);
  }

  const isLoading = isAdmin ? pendingLoading : salesLoading;
  const isError = isAdmin ? pendingError : salesError;
  const isEmpty = sellerGroups.length === 0 && myGroups.length === 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-11 rounded-xl border border-border bg-card text-primary-2"
          aria-label={badge > 0 ? `Notificaciones: ${badge} sin ver` : 'Notificaciones'}
        >
          <HugeIcon icon={Notification03Icon} size={18} strokeWidth={2} aria-hidden />
          {badge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold tabular-nums text-destructive-foreground ring-2 ring-background"
              aria-hidden
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Avisos de ventas</span>
          {badge > 0 && (
            <Badge variant="category" className="tabular-nums">
              {badge}
            </Badge>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-1.5">
          {isLoading ? (
            <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando avisos de ventas…</p>
          ) : isError ? (
            <div role="status" className="space-y-3 px-4 py-6 text-center text-sm"><p>No pudimos actualizar los avisos.</p><Button variant="outline" onClick={() => { setOpen(false); navigate('/admin/ventas'); }}>Revisar ventas</Button></div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                <HugeIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2} aria-hidden />
              </span>
              <p className="text-sm font-medium text-foreground">Sin avisos de ventas</p>
              <p className="text-xs text-muted-foreground">{isAdmin ? 'No hay ventas pendientes de aprobación.' : 'Todavía no hay novedades sobre tus ventas.'}</p>
            </div>
          ) : (
            <>
              {isAdmin && sellerGroups.length > 0 && (
                <>
                  <SectionLabel>Ventas por aprobar</SectionLabel>
                  {sellerGroups.map((group) => (
                    <NotifRow
                      key={group.email}
                      onClick={() => goToSales(group.email)}
                      title={group.email}
                      subtitle={`${group.count} ${group.count === 1 ? 'venta espera' : 'ventas esperan'} tu aprobación`}
                      right={<span className="text-xs tabular-nums text-muted-foreground">{money(group.total)}</span>}
                    />
                  ))}
                </>
              )}

              {!isAdmin && myGroups.length > 0 && (
                <>
                  <SectionLabel>Tus ventas</SectionLabel>
                  {myGroups.map((group) => {
                    const meta = STATE_META[group.state];
                    return (
                      <NotifRow
                        key={group.state}
                        onClick={() => {
                          setOpen(false);
                          navigate(`/admin/ventas?status=${group.state}`);
                        }}
                        icon={
                          <HugeIcon
                            icon={meta.icon}
                            size={16}
                            strokeWidth={2}
                            className={cn('shrink-0', meta.tone)}
                            aria-hidden
                          />
                        }
                        title={group.count === 1 ? meta.one : meta.many(group.count)}
                        subtitle={money(group.total)}
                        unseen={isHydrated && group.ids.some((id) => !seen.has(id))}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{children}</p>
  );
}

function NotifRow({
  onClick,
  icon,
  title,
  subtitle,
  right,
  unseen,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  unseen?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors',
        'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none',
        'motion-reduce:transition-none',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {/* Lo no visto se marca con un punto Y con el badge del contador: el
              color solo no alcanza para distinguirlo. */}
          {unseen && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Sin ver" />}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {right}
    </button>
  );
}
