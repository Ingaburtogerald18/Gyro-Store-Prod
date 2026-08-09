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
  Tag01Icon,
  Ticket01Icon,
  CheckmarkBadge01Icon,
  DollarCircleIcon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { PageHeader } from '~/components/layout/PageHeader';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { DatePicker } from '~/components/ui/date-picker';
import { Label } from '~/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { StatCard } from '~/components/ui/stat-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { errMsg, formatCordobas } from '~/lib/formatters';
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
  const filteredData = data.filter((d) => {
    if (filter === 'all') return true;
    const exhausted = d.maxUses > 0 && d.usedCount >= d.maxUses;
    const expired = d.expiresAt ? new Date(d.expiresAt).getTime() < Date.now() : false;
    
    if (filter === 'redeemed') return exhausted;
    if (filter === 'pending') return !exhausted && !expired && d.active;
    if (filter === 'expired') return expired || !d.active;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tienda"
        title="Códigos de descuento"
        description="Gestión de cupones de único uso. Rastrea canjes en pedidos web y punto de venta."
        actions={
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2.5} className="mr-1.5" aria-hidden />
              Generar Código
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

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Ticket01Icon}
          label="Emitidos"
          countTo={totalEmitidos}
          delay={0}
        />
        <StatCard
          icon={CheckmarkBadge01Icon}
          label="Canjeados"
          countTo={totalCanjeados}
          color="emerald"
          delay={0.1}
        />
        <StatCard
          icon={Tag01Icon}
          label="Tasa de canje"
          value={`${tasaCanje.toFixed(1)}%`}
          color="indigo"
          delay={0.2}
        />
        <StatCard
          icon={DollarCircleIcon}
          label="Total descontado"
          value={formatCordobas(totalDescontado)}
          color="amber"
          delay={0.3}
        />
      </div>

      {/* Lista */}
      <Card className="bg-card border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <CardTitle className="text-lg text-foreground">Historial de Códigos</CardTitle>
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="redeemed">Canjeados</SelectItem>
              <SelectItem value="expired">Vencidos / Desact.</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <HugeIcon icon={Coupon01Icon} size={32} className="mb-2 opacity-50" />
              <p className="text-sm">No se encontraron códigos.</p>
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
                            "flex items-center gap-1.5 rounded bg-muted/60 px-2 py-1 font-mono text-sm font-bold tracking-wide transition-colors hover:bg-muted",
                            effectivelyOff ? "text-muted-foreground line-through" : "text-foreground"
                          )}
                        >
                          {d.code}
                          <HugeIcon icon={Copy01Icon} size={12} className="text-muted-foreground" aria-hidden />
                        </button>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          d.type === 'percent' ? 'bg-tone-sky/10 text-tone-sky' : 'bg-tone-emerald/10 text-tone-emerald'
                        )}>
                          {d.type === 'percent' ? `${d.value}% DTO` : `C$${d.value} DTO`}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {d.expiresAt && <span>Vence: {new Date(d.expiresAt).toLocaleDateString('es-NI')}</span>}
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
                            d.redeemedSource === 'checkout' ? "bg-tone-indigo/10 text-tone-indigo" : "bg-tone-amber/10 text-tone-amber"
                          )}>
                            <HugeIcon 
                              icon={d.redeemedSource === 'checkout' ? ShoppingCart01Icon : Invoice01Icon} 
                              size={14} 
                            />
                          </div>
                          <div className="text-sm">
                            <p className="font-medium text-foreground flex items-center gap-1">
                              {d.redeemedLabel || (d.redeemedSource === 'checkout' ? 'Pedido Web' : 'Factura POS')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Canjeado el {new Date(d.redeemedAt).toLocaleDateString('es-NI')}
                              {d.redeemedAmount != null && ` • Ahorro: C$${d.redeemedAmount}`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                          Sin usar
                        </div>
                      )}
                    </div>

                    {/* Col 3: Status & Actions */}
                    <div className="flex items-center gap-4 sm:ml-auto shrink-0">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap',
                          !d.active ? 'bg-tone-red/10 text-tone-red' 
                            : exhausted ? 'bg-tone-emerald/10 text-tone-emerald' 
                            : expired ? 'bg-tone-rose/10 text-tone-rose' 
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {!d.active ? 'Desactivado' : exhausted ? 'Canjeado' : expired ? 'Vencido' : 'Pendiente'}
                      </span>

                      {!exhausted && (
                        <button
                          type="button"
                          onClick={() => toggleActive(d.code, !d.active)}
                          title={d.active ? 'Desactivar' : 'Reactivar'}
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors",
                            d.active ? "text-muted-foreground hover:bg-tone-red/10 hover:text-tone-red" : "text-tone-emerald hover:bg-tone-emerald/10"
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
        </CardContent>
      </Card>
    </div>
  );
}
