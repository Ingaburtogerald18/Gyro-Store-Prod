// Portal de Cuotas (doc 09 ítem 67): crear plan sobre una venta aprobada,
// registrar pagos, ver saldo, cancelar. Solo admin (mismo criterio que v1 y
// que server/routes/installments.ts).
//
// Reciclaje de v1 (admin.cuotas.tsx): se recicla el layout de tarjetas con
// barra de progreso + historial de pagos expandible — es un patrón sólido y
// el shape de InstallmentPlan (Hito 3) es parecido. Se reescribe: v1 creaba
// el plan armando sus propias líneas (con FIFO y comisión incluidos); acá el
// plan solo agenda el cobro de una venta que sales.ts ya aprobó — no hay
// customerName/customerPhone propios, se usan phone/sellerEmail de la orden
// vinculada (server/services/installments.ts los agrega vía join). No hay
// nextPaymentDate por cuota (no existe esa columna en v2): se muestra solo la
// fecha de la primera cuota.
import { HugeIcon } from "~/components/ui/icon";
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, CreditCardIcon } from "@hugeicons/core-free-icons";
import { useMemo, useState, useEffect } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { toast } from 'sonner';

import {
  Kbd,
  Metric,
  MetricStrip,
  SegmentedControl,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from '~/components/admin/workspace';
import { PageHeader } from '~/components/layout/PageHeader';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { QueryState } from '~/components/ui/QueryState';
import { errMsg, formatCordobas, withoutIds, formatLongDate } from '~/lib/formatters';
import {
  useCancelInstallmentPlanMutation,
  useCreateInstallmentPlanMutation,
  useGetInstallmentsQuery,
  useRegisterInstallmentPaymentMutation,
  type InstallmentPlan,
} from '~/store/api/installmentsApi';
import { useGetSalesQuery, type SaleListItem } from '~/store/api/salesApi';
import { Spinner } from "~/components/ui/spinner";
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';


export const meta: MetaFunction = () => [{ title: pageTitle('Cuotas', { admin: true }) }];

function pctPaid(paid: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
}

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = pctPaid(paid, total);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Formularios (react-hook-form + zod, DESIGN.md §6b) ──
// La validación de cada campo va en su FieldError; el toast queda para el
// resultado. Mismas reglas que registerInstallmentPaymentInputSchema y
// createInstallmentPlanInputSchema del backend.

/** Número obligatorio desde un <input>: vacío falla (no se convierte en 0). */
const requiredNumber = (message: string) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? NaN : Number(v)), z.number({ message }));

const paymentFormSchema = z.object({
  amount: requiredNumber('Escribí el monto recibido.').pipe(z.number().positive('El monto tiene que ser mayor a 0.')),
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  note: z.string().trim().max(300, 'Máximo 300 caracteres.'),
});
type PaymentValues = z.input<typeof paymentFormSchema>;
type PaymentOutput = z.output<typeof paymentFormSchema>;
const EMPTY_PAYMENT: PaymentValues = { amount: '', method: 'efectivo', note: '' };

function PaymentDialog({ plan, onClose }: { plan: InstallmentPlan | null; onClose: () => void }) {
  const [registerPayment, { isLoading }] = useRegisterInstallmentPaymentMutation();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentValues, unknown, PaymentOutput>({ resolver: zodResolver(paymentFormSchema), defaultValues: EMPTY_PAYMENT });

  useEffect(() => {
    if (plan) reset(EMPTY_PAYMENT);
  }, [plan, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (!plan) return;
    try {
      const res = await registerPayment({ id: plan.id, body: { amount: v.amount, method: v.method, note: v.note || undefined } }).unwrap();
      toast.success(
        res.completed
          ? '¡Plan completamente pagado!'
          : `Pago registrado. Pendiente: ${formatCordobas(res.amountPending)}.`,
      );
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar el pago.'));
    }
  });

  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Registrar pago{plan?.phone ? ` · ${plan.phone}` : ''}</DialogTitle>
          </DialogHeader>
          {plan && (
            <div className="mt-4 space-y-4">
              <div className="space-y-1 rounded-card border border-border bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{formatCordobas(plan.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagado</span>
                  <span className="font-semibold text-success">{formatCordobas(plan.amountPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pendiente</span>
                  <span className="font-bold text-foreground">{formatCordobas(plan.amountPending)}</span>
                </div>
                <ProgressBar paid={plan.amountPaid} total={plan.total} />
              </div>

              <Field data-invalid={!!errors.amount}>
                <FieldLabel htmlFor="pay-amount" required>Monto recibido (C$)</FieldLabel>
                <Input id="pay-amount" type="number" min={0} step="0.01" inputMode="decimal" aria-required aria-invalid={!!errors.amount} {...register('amount')} />
                <FieldError errors={[errors.amount]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="pay-method">Método de pago</FieldLabel>
                <Controller
                  control={control}
                  name="method"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="pay-method" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field data-invalid={!!errors.note}>
                <FieldLabel htmlFor="pay-note">Notas (opcional)</FieldLabel>
                <Input id="pay-note" aria-invalid={!!errors.note} {...register('note')} />
                <FieldError errors={[errors.note]} />
              </Field>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Registrar pago
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({ plan, onPay }: { plan: InstallmentPlan; onPay: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelPlan, { isLoading: cancelling }] = useCancelInstallmentPlanMutation();

  async function handleCancel() {
    try {
      await cancelPlan(plan.id).unwrap();
      toast.success('Plan cancelado.');
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo cancelar el plan.'));
    }
  }

  const pct = pctPaid(plan.amountPaid, plan.total);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-foreground">{plan.phone ?? 'Sin teléfono'}</p>
              <Badge
                variant="outline"
                // Verde = saldado; azul = en curso. El ámbar se reserva para
                // atrasos, y un plan activo no está atrasado por serlo.
                className={plan.status === 'completed' ? 'rounded-full border-success/30 bg-success/10 text-success' : 'rounded-full border-info/30 bg-info/10 text-info'}
              >
                {plan.status === 'completed' ? 'Pagado' : 'Activo'}
              </Badge>
            </div>
            {plan.sellerEmail && <p className="text-xs text-muted-foreground">Vendedor: {plan.sellerEmail}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-display font-bold text-foreground">{formatCordobas(plan.total)}</p>
            <p className="text-xs text-muted-foreground">{plan.numCuotas} cuotas</p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{pct}% pagado</span>
            <span>Pendiente: {formatCordobas(plan.amountPending)}</span>
          </div>
          <ProgressBar paid={plan.amountPaid} total={plan.total} />
        </div>

        {plan.status === 'active' && (
          <p className="text-xs text-muted-foreground">
            Primera cuota: {formatLongDate(plan.firstDue)}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          {plan.status === 'active' && (
            <Button size="sm" onClick={onPay}>
              <HugeIcon icon={CreditCardIcon} size={14} strokeWidth={2} className="mr-1.5" aria-hidden />
              Registrar pago
            </Button>
          )}
          {plan.payments.length === 0 && (
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={cancelling} className="text-destructive">
              {cancelling && <Spinner className="mr-2" />}
              Cancelar plan
            </Button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? <HugeIcon icon={ArrowUp01Icon} size={14} strokeWidth={2} aria-hidden /> : <HugeIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} aria-hidden />}
            {plan.payments.length} {plan.payments.length === 1 ? 'pago' : 'pagos'}
          </button>
        </div>
      </div>

      {expanded && plan.payments.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {plan.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div>
                <span className="font-medium text-foreground">{formatCordobas(p.amount)}</span>
                <span className="ml-2 text-xs capitalize text-muted-foreground">{p.method ?? 'efectivo'}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatLongDate(p.paidAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const planFormSchema = z.object({
  numCuotas: requiredNumber('Escribí la cantidad de cuotas.').pipe(
    z.number().int('Tiene que ser un número entero.').min(2, 'Mínimo 2 cuotas.').max(36, 'Máximo 36 cuotas.'),
  ),
  firstDue: z.string().min(1, 'Elegí la fecha de la primera cuota.'),
});
type PlanValues = z.input<typeof planFormSchema>;
type PlanOutput = z.output<typeof planFormSchema>;
const EMPTY_PLAN: PlanValues = { numCuotas: '2', firstDue: '' };

function CreatePlanDialog({ sale, onClose }: { sale: SaleListItem | null; onClose: () => void }) {
  const [createPlan, { isLoading }] = useCreateInstallmentPlanMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanValues, unknown, PlanOutput>({ resolver: zodResolver(planFormSchema), defaultValues: EMPTY_PLAN });

  useEffect(() => {
    if (sale) reset(EMPTY_PLAN);
  }, [sale, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (!sale) return;
    try {
      await createPlan({ orderId: sale.id, numCuotas: v.numCuotas, firstDue: v.firstDue }).unwrap();
      toast.success('Plan de cuotas creado.');
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo crear el plan de cuotas.'));
    }
  });

  return (
    <Dialog open={!!sale} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Nuevo plan de cuotas</DialogTitle>
          </DialogHeader>
          {sale && (
            <div className="mt-4 space-y-4">
              <div className="rounded-card border border-border bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium text-foreground">{sale.phone ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground">{formatCordobas(sale.total)}</span>
                </div>
              </div>
              <Field data-invalid={!!errors.numCuotas}>
                <FieldLabel htmlFor="plan-cuotas" required>Cantidad de cuotas</FieldLabel>
                <Input id="plan-cuotas" type="number" min={2} max={36} step={1} aria-required aria-invalid={!!errors.numCuotas} {...register('numCuotas')} />
                <FieldDescription>Entre 2 y 36.</FieldDescription>
                <FieldError errors={[errors.numCuotas]} />
              </Field>
              <Field data-invalid={!!errors.firstDue}>
                <FieldLabel htmlFor="plan-first" required>Fecha de la primera cuota</FieldLabel>
                <Input id="plan-first" type="date" aria-required aria-invalid={!!errors.firstDue} {...register('firstDue')} />
                <FieldError errors={[errors.firstDue]} />
              </Field>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Crear plan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCuotas() {
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'completed'>('active');
  const { data: plans = [], isLoading, isError } = useGetInstallmentsQuery(statusFilter === 'all' ? undefined : statusFilter);
  const { data: approvedSales = [] } = useGetSalesQuery({ status: 'approved' });

  const [payFor, setPayFor] = useState<InstallmentPlan | null>(null);
  const [createFor, setCreateFor] = useState<SaleListItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Ventas aprobadas sin plan todavía (installments.order_id es UNIQUE — doc
  // 09 migración 0010).
  const salesWithoutPlan = useMemo(
    () => withoutIds(approvedSales, plans.map((p) => p.orderId), (s) => s.id),
    [approvedSales, plans],
  );

  const activeCount = plans.filter((p) => p.status === 'active').length;
  const pendingTotal = plans.reduce((acc, p) => acc + (p.status === 'active' ? p.amountPending : 0), 0);
  const paidTotal = plans.reduce((acc, p) => acc + p.amountPaid, 0);

  useShortcut('n', () => setPickerOpen(true));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Cuotas"
        description="Ventas a plazos: seguimiento de pagos hasta saldar el total."
        className="mb-0"
        actions={
          <Button onClick={() => setPickerOpen(true)} className="h-9 gap-2 rounded-md">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
            Nuevo plan
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Planes"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'active', label: 'Activos' },
              { value: 'all', label: 'Todos' },
              { value: 'completed', label: 'Saldados' },
            ]}
          />
        </WorkspaceToolbar>

        {/* Números de lo que se está viendo (según el selector). */}
        <MetricStrip columns={3}>
          <Metric label="Planes activos" value={activeCount} sub={`${plans.length} en esta vista`} />
          <Metric label="Por cobrar" value={formatCordobas(pendingTotal)} sub="Saldo de los planes activos" />
          <Metric label="Cobrado" value={formatCordobas(paidTotal)} sub="Pagos registrados" />
        </MetricStrip>

        <div className="p-4">
          <QueryState
            loading={isLoading}
            error={isError}
            empty={plans.length === 0}
            shape="card"
            emptyFallback={
              <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border py-16 text-center">
                <HugeIcon icon={CreditCardIcon} size={32} strokeWidth={2} className="text-muted-foreground opacity-50" aria-hidden />
                <p className="text-sm text-muted-foreground">No hay planes de cuotas en esta vista.</p>
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} onPay={() => setPayFor(plan)} />
              ))}
            </div>
          </QueryState>
        </div>
      </Workspace>

      <PaymentDialog plan={payFor} onClose={() => setPayFor(null)} />
      <CreatePlanDialog sale={createFor} onClose={() => setCreateFor(null)} />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elegí la venta aprobada</DialogTitle>
          </DialogHeader>
          {salesWithoutPlan.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay ventas aprobadas sin plan de cuotas todavía.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {salesWithoutPlan.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => {
                    setCreateFor(sale);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>{sale.phone ?? sale.sellerEmail}</span>
                  <span className="font-semibold">{formatCordobas(sale.total)}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
