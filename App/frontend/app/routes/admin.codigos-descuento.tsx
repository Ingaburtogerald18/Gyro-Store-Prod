// Códigos de descuento (Centro de Administración).
// Incluye historial completo de canjes y KPIs.
import { HugeIcon } from '~/components/ui/icon';
import {
  Add01Icon,
  Coupon01Icon,
  Copy01Icon,
  PowerServiceIcon,
  ShoppingCart01Icon,
  Invoice01Icon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { toast } from 'sonner';

import { PageHeader } from '~/components/layout/PageHeader';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { DatePicker } from '~/components/ui/date-picker';
import { Label } from '~/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Kbd,
  Metric,
  MetricStrip,
  SegmentedControl,
  ToolbarSearch,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from '~/components/admin/workspace';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import {
  useGetDiscountCodesQuery,
  useCreateDiscountCodeMutation,
  useSetDiscountCodeActiveMutation,
  type DiscountType,
} from '~/store/api/discountCodesApi';

export const meta: MetaFunction = () => [{ title: pageTitle('Códigos de descuento', { admin: true }) }];

// Sin `code`: lo asigna la base (secuencia GS-DC-N) y viene en la respuesta.
const EMPTY_FORM = { type: 'percent' as DiscountType, value: '', expiresAt: '', note: '' };

export default function AdminDiscountCodes() {
  const { data = [], isLoading } = useGetDiscountCodesQuery();
  const [createCode, { isLoading: creating }] = useCreateDiscountCodeMutation();
  const [setActive] = useSetDiscountCodeActiveMutation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState<'all' | 'redeemed' | 'pending' | 'expired'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  useShortcut('n', () => setModalOpen(true));

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(form.value);
    if (!value || value <= 0) return toast.error('El valor debe ser mayor a 0.');
    try {
      // El código lo devuelve el servidor ya generado (GS-DC-N).
      const created = await createCode({
        type: form.type,
        value,
        maxUses: 1, // Ahora forzamos 1 por regla de negocio
        expiresAt: form.expiresAt || undefined,
        note: form.note.trim() || undefined,
      }).unwrap();
      toast.success(`Código ${created.code} creado.`);
      setForm(EMPTY_FORM);
      setModalOpen(false);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo crear el código.'));
    }
  }

  async function toggleActive(code: string, active: boolean) {
    try {
      await setActive({ code, active }).unwrap();
      toast.success(active ? `"${code}" reactivado.` : `"${code}" desactivado.`);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo actualizar el código.'));
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => toast.success('Código copiado.'));
  }

  // KPIs
  const totalEmitidos = data.length;
  const totalCanjeados = data.filter((d) => d.usedCount > 0).length;
  const tasaCanje = totalEmitidos > 0 ? (totalCanjeados / totalEmitidos) * 100 : 0;
  const totalDescontado = data.reduce((acc, d) => acc + (d.redeemedAmount || 0), 0);

  // Filtrado
  const q = search.trim().toLowerCase();
  const filteredData = data.filter((d) => {
    if (q && ![d.code, d.note, d.redeemedLabel].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))) return false;
    if (filter === 'all') return true;
    const exhausted = d.maxUses > 0 && d.usedCount >= d.maxUses;
    const expired = d.expiresAt ? new Date(d.expiresAt).getTime() < Date.now() : false;

    if (filter === 'redeemed') return exhausted;
    if (filter === 'pending') return !exhausted && !expired && d.active;
    if (filter === 'expired') return expired || !d.active;
    return true;
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Tienda"
        title="Códigos de descuento"
        description="Cupones de un solo uso. Seguí sus canjes en pedidos web y facturas."
        className="mb-0"
        actions={
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button className="h-9 gap-2 rounded-xl">
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
              Generar código
              <Kbd>N</Kbd>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Nuevo código de descuento</DialogTitle>
              <DialogDescription>
                Se creará un código de único uso.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid gap-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => set('type', v as DiscountType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% Porcentaje</SelectItem>
                      <SelectItem value="fixed">C$ Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{form.type === 'percent' ? 'Valor (%)' : 'Valor (C$)'}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={form.type === 'percent' ? 100 : undefined}
                    value={form.value}
                    onChange={(e) => set('value', e.target.value)}
                    placeholder={form.type === 'percent' ? '10' : '50'}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Vence (opcional)</Label>
                <DatePicker
                  value={form.expiresAt}
                  onChange={(v) => set('expiresAt', v)}
                  placeholder="Sin vencimiento"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción (referencia interna)</Label>
                {/* Se guarda en la columna `note`: solo cambia la etiqueta. */}
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  placeholder="Ej. Reseña en Google del cliente de la factura #120"
                  maxLength={200}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                  {creating && <Spinner className="mr-2" />}
                  Generar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Estado del código"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'pending', label: 'Pendientes' },
              { value: 'redeemed', label: 'Canjeados' },
              { value: 'expired', label: 'Vencidos o desactivados' },
            ]}
          />
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar código o descripción" />
        </WorkspaceToolbar>

        <MetricStrip>
          <Metric label="Emitidos" value={totalEmitidos} />
          <Metric label="Canjeados" value={totalCanjeados} />
          <Metric label="Tasa de canje" value={`${tasaCanje.toFixed(1)} %`} />
          <Metric label="Total descontado" value={formatCordobas(totalDescontado)} />
        </MetricStrip>

        <div className="overflow-clip rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <HugeIcon icon={Coupon01Icon} size={32} className="mb-2 opacity-50" />
              <p className="text-sm">{data.length === 0 ? 'Todavía no se generó ningún código.' : 'Ningún código coincide con la búsqueda o el filtro.'}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredData.map((d) => {
                const exhausted = d.maxUses > 0 && d.usedCount >= d.maxUses;
                const expired = d.expiresAt ? new Date(d.expiresAt).getTime() < Date.now() : false;
                const effectivelyOff = !d.active || exhausted || expired;

                return (
                  <div
                    key={d.code}
                    className={cn(
                      'flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 p-4 transition-colors hover:bg-muted/30',
                      effectivelyOff && 'bg-muted/10'
                    )}
                  >
                    {/* Col 1: Code & Type */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyCode(d.code)}
                          title="Copiar código"
                          className={cn(
                            "flex items-center gap-1.5 rounded-xl bg-muted/60 px-2 py-1 font-spec text-sm font-semibold tracking-wide transition-colors hover:bg-muted",
                            effectivelyOff ? "text-muted-foreground line-through" : "text-foreground"
                          )}
                        >
                          {d.code}
                          <HugeIcon icon={Copy01Icon} size={12} className="text-muted-foreground" aria-hidden />
                        </button>
                        <span className="rounded-xl border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {d.type === 'percent' ? `−${d.value} %` : `−C$${d.value}`}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {d.expiresAt && <span>Vence el {formatLongDate(d.expiresAt)}</span>}
                        {d.note && (
                          <>
                            {d.expiresAt && <span>•</span>}
                            <span className="truncate max-w-[200px]" title={d.note}>{d.note}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Col 2: Redemption Info */}
                    <div className="flex-1 min-w-[220px]">
                      {d.redeemedAt ? (
                        <div className="flex items-start gap-2">
                          <div className={cn(
                            "mt-0.5 rounded-full p-1.5",
                            "bg-muted text-muted-foreground"
                          )}>
                            <HugeIcon
                              icon={d.redeemedSource === 'checkout' ? ShoppingCart01Icon : Invoice01Icon}
                              size={14}
                            />
                          </div>
                          <div className="text-sm">
                            <p className="font-medium text-foreground flex items-center gap-1">
                              {d.redeemedLabel || (d.redeemedSource === 'checkout' ? 'Pedido web' : 'Factura de caja')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Canjeado el {formatLongDate(d.redeemedAt)}
                              {d.redeemedAmount != null && ` • Ahorro: C$${d.redeemedAmount}`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          Sin usar
                        </div>
                      )}
                    </div>

                    {/* Col 3: Status & Actions */}
                    <div className="flex items-center gap-4 sm:ml-auto shrink-0">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
                          !d.active ? 'bg-muted text-muted-foreground'
                            : exhausted ? 'bg-success/10 text-foreground'
                            : expired ? 'bg-warning/10 text-warning'
                            : 'bg-info/10 text-info',
                        )}
                      >
                        {!d.active ? 'Desactivado' : exhausted ? 'Canjeado' : expired ? 'Vencido' : 'Pendiente'}
                      </span>

                      {!exhausted && (
                        <button
                          type="button"
                          onClick={() => toggleActive(d.code, !d.active)}
                          title={d.active ? 'Desactivar' : 'Reactivar'}
                          aria-label={d.active ? `Desactivar ${d.code}` : `Reactivar ${d.code}`}
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            d.active ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-foreground hover:bg-success/10"
                          )}
                        >
                          <HugeIcon icon={PowerServiceIcon} size={16} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                    </div>
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

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
