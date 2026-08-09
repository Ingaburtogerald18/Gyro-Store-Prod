// Banner "Estado del negocio" del dashboard (extraído de admin._index.tsx):
// ventas pendientes de aprobación, delivery del periodo (con pop-up) y saldos
// por cuenta. Se muestra arriba del héroe si hay algo pendiente, o abajo si no.
import { HugeIcon } from "~/components/ui/icon";
import { Alert02Icon, CheckmarkCircle01Icon, ShoppingCart02Icon, TruckIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { NavLink } from "@remix-run/react";
import { useGetDeliveryInvoicesQuery } from "~/store/api/reportsApi";
import { useGetCuadreQuery, useGetAccountsQuery } from "~/store/api/cajaApi";
import { formatCordobas } from "~/lib/formatters";
import { cn } from "~/lib/utils";
import { SectionLabel } from "~/components/layout/SectionLabel";
import { DrilldownDialog } from "./DrilldownDialog";
import type { PeriodRange } from "./period";

export function CuadreBanner({ range }: { range: PeriodRange }) {
  const { data: cuadre } = useGetCuadreQuery();
  const { data: accounts = [] } = useGetAccountsQuery();
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  // Sin `skip`: la tarjeta ahora muestra el MONTO, no un "Ver detalle". El dato
  // tiene que estar antes de abrir el pop-up, no después.
  const { data: deliveryInvoices = [] } = useGetDeliveryInvoicesQuery(range);

  if (!cuadre) return null;

  const nombreCuenta = (id: string) => accounts.find((a) => a.id === id)?.nombre ?? 'Cuenta';
  const pendingCount = cuadre.ventasPendientes;
  const hasPending = pendingCount > 0;

  const deliveryTotal = deliveryInvoices.reduce((sum, inv) => sum + inv.delivery_fee, 0);

  return (
    <section className="space-y-3">
      <SectionLabel>Estado del negocio</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Ventas pendientes — link a /admin/ventas?status=pending_approval */}
        <NavLink
          to="/admin/ventas?status=pending_approval"
          className={cn(
            'rounded-card border p-4 transition-colors',
            hasPending
              ? 'border-destructive/30 bg-destructive/10 hover:bg-destructive/15'
              : 'border-border bg-card hover:bg-accent',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <HugeIcon
                icon={ShoppingCart02Icon}
                size={16}
                strokeWidth={2}
                className={cn(hasPending && 'text-destructive')}
              />
              Ventas pendientes
            </span>
            {hasPending ? (
              <HugeIcon icon={Alert02Icon} size={16} strokeWidth={2} className="text-destructive" />
            ) : (
              <HugeIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={2} className="text-success" />
            )}
          </div>
          <p className={cn('nums mt-2 text-2xl font-bold', hasPending ? 'text-destructive' : 'text-foreground')}>
            {pendingCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasPending ? 'Esperan aprobación del admin' : 'Todo al día'}
          </p>
        </NavLink>

        {/* Delivery del periodo.
            Antes mostraba el TEXTO "Ver detalle" donde sus tres vecinas
            muestran una cifra, y usaba un icono con `opacity-0` como espaciador.
            Ahora muestra el monto real: la tarjeta responde la pregunta sin
            obligar a abrirla, y el pop-up queda para el desglose. */}
        <button
          onClick={() => setDeliveryOpen(true)}
          className="rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
        >
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeIcon icon={TruckIcon} size={16} strokeWidth={2} />
            Delivery del periodo
          </span>
          <p className="nums mt-2 text-2xl font-bold text-foreground">
            {formatCordobas(deliveryTotal)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {deliveryInvoices.length > 0
              ? `${deliveryInvoices.length} facturas con envío`
              : 'Ver facturas con envío'}
          </p>
        </button>

        {/* Máximo dos cuentas. Con cinco, la grilla de cuatro columnas se
            desarmaba y el banner pasaba a dos filas de tarjetas secundarias,
            robándole espacio al héroe. El resto vive en Caja y Bancos. */}
        {cuadre.saldosCuentas.slice(0, 2).map((s) => (
          <div key={s.accountId} className="rounded-card border border-border bg-card p-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <HugeIcon icon={Wallet01Icon} size={16} strokeWidth={2} />
              {nombreCuenta(s.accountId)}
            </span>
            <p className="nums mt-2 text-2xl font-bold text-foreground">{formatCordobas(s.balance)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Saldo actual</p>
          </div>
        ))}

        {cuadre.saldosCuentas.length > 2 && (
          <NavLink
            to="/admin/caja"
            className="flex flex-col justify-center rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <span className="font-medium">
              +{cuadre.saldosCuentas.length - 2} cuentas más
            </span>
            <span className="mt-1 text-xs">Ver todas en Caja y Bancos</span>
          </NavLink>
        )}
      </div>

      {/* Pop-up de delivery del periodo */}
      <DrilldownDialog
        open={deliveryOpen}
        onOpenChange={setDeliveryOpen}
        title="Delivery del periodo"
        icon={TruckIcon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total delivery</span>
            <span className="nums">{formatCordobas(deliveryTotal, 'C$', 2)}</span>
          </div>
        }
      >
        {deliveryInvoices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hubo envíos en este periodo.</p>
        ) : (
          <div className="divide-y divide-border">
            {deliveryInvoices.map((inv, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {inv.invoice_number ? `#${inv.invoice_number}` : 'Sin factura'}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {inv.delivery_name || 'Sin repartidor'}
                  </span>
                </div>
                <span className="nums shrink-0 font-medium text-foreground">
                  {formatCordobas(inv.delivery_fee, 'C$', 2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>
    </section>
  );
}
