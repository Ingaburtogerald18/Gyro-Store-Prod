import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Alert02Icon, Coins01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { DatePicker, toYmd, toLocalNoonIso } from '~/components/ui/date-picker';
import { Spinner } from '~/components/ui/spinner';
import { formatCordobas, errMsg } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import {
  useCreateExpenseMutation,
  usePreviewExpenseMutation,
  useUpdateExpenseMutation,
  type CreateExpensePayload,
  type ExpenseItem,
  type ExpensePreview,
} from '~/store/api/reportsApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';

const POZOS = ['publicidad', 'mantenimiento', 'utiles', 'garantias', 'prestamos', 'suscripciones', 'servicios', 'salario'] as const;

const POZO_OPTIONS: { value: (typeof POZOS)[number]; label: string; hint?: string }[] = [
  { value: 'publicidad', label: 'Publicidad' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'utiles', label: 'Útiles de oficina' },
  { value: 'garantias', label: 'Garantías' },
  { value: 'prestamos', label: 'Préstamos', hint: 'Pagos de préstamo. Usa su propio pozo y lo que falte sale de la ganancia.' },
  { value: 'suscripciones', label: 'Suscripciones' },
  { value: 'servicios', label: 'Servicios básicos' },
  { value: 'salario', label: 'Fondo salario', hint: 'Solo usa el fondo salario; si no alcanza, lo que falte sale de la ganancia.' },
];

/** Número obligatorio desde un <input>: vacío falla (no se convierte en 0). */
const requiredNumber = (message: string) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? NaN : Number(v)), z.number({ message }));

// Mismas reglas que createExpenseInputSchema del backend.
const expenseFormSchema = z.object({
  pozo: z.enum(POZOS),
  moneda: z.enum(['COR', 'USD']),
  monto: requiredNumber('Escribí el monto.').pipe(z.number().positive('El monto tiene que ser mayor a 0.')),
  fecha: z.string().min(1, 'Elegí la fecha del gasto.'),
  category: z.string().trim().min(1, 'Escribí el concepto.').max(60, 'Máximo 60 caracteres.'),
  description: z.string().trim().max(200, 'Máximo 200 caracteres.'),
});
type ExpenseValues = z.input<typeof expenseFormSchema>;
type ExpenseOutput = z.output<typeof expenseFormSchema>;

function valuesFor(expense: ExpenseItem | null | undefined, defaultPozo?: string): ExpenseValues {
  if (expense) {
    const usd = expense.montoUsd != null;
    return {
      pozo: expense.pozo as ExpenseValues['pozo'],
      moneda: usd ? 'USD' : 'COR',
      monto: String(usd ? expense.montoUsd : expense.monto),
      fecha: toYmd(new Date(expense.createdAt)),
      category: expense.category,
      description: expense.description ?? '',
    };
  }
  const pozo = POZOS.includes(defaultPozo as (typeof POZOS)[number]) ? (defaultPozo as ExpenseValues['pozo']) : 'publicidad';
  return { pozo, moneda: 'COR', monto: '', fecha: toYmd(new Date()), category: '', description: '' };
}

/**
 * Formulario de gasto, para registrar uno nuevo o editar uno existente
 * (`expense`). Controlado desde afuera (`open`).
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  defaultPozo,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseItem | null;
  defaultPozo?: string;
  onSuccess?: () => void;
}) {
  const isEdit = !!expense;
  const [createExpense, { isLoading: creating }] = useCreateExpenseMutation();
  const [updateExpense, { isLoading: updating }] = useUpdateExpenseMutation();
  const [previewExpense, { isLoading: previewing }] = usePreviewExpenseMutation();
  const isLoading = creating || updating || previewing;
  // Aviso antes de guardar: si el gasto no cabe en su pozo, se muestra de
  // dónde saldría y se pide confirmar.
  const [pending, setPending] = useState<{ body: CreateExpensePayload; preview: ExpensePreview } | null>(null);
  const { data: config } = useGetConfigQuery();
  // Al editar un gasto en dólares se conserva la tasa con la que se registró.
  const exchangeRate = (isEdit && expense?.exchangeRate) || config?.exchangeRate || 37;

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ExpenseValues, unknown, ExpenseOutput>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: valuesFor(expense, defaultPozo),
  });

  useEffect(() => {
    if (open) {
      reset(valuesFor(expense, defaultPozo));
      setPending(null);
    }
  }, [open, expense, defaultPozo, reset]);

  const moneda = watch('moneda');
  const pozo = watch('pozo');
  const fecha = watch('fecha');
  const numMonto = Number(watch('monto')) || 0;
  const montoEnCordobas = moneda === 'USD' ? numMonto * exchangeRate : numMonto;
  const originalYmd = expense ? toYmd(new Date(expense.createdAt)) : toYmd(new Date());
  const isManualDate = fecha !== originalYmd;
  const pozoHint = POZO_OPTIONS.find((o) => o.value === pozo)?.hint;

  const onSubmit = handleSubmit(async (v) => {
    const body: CreateExpensePayload = {
      pozo: v.pozo,
      monto: v.monto,
      moneda: v.moneda,
      // Sin cambio de fecha no se manda: hoy queda con la hora real; al editar,
      // conserva la que tenía.
      fecha: v.fecha !== originalYmd ? toLocalNoonIso(v.fecha) : undefined,
      category: v.category,
      description: v.description || undefined,
    };
    try {
      const preview = await previewExpense({ ...body, excludeId: expense?.id }).unwrap();
      if (preview.excede) {
        setPending({ body, preview });
        return;
      }
    } catch {
      // Sin vista previa se guarda igual: el aviso ayuda, no bloquea.
    }
    await save(body);
  });

  async function save(body: CreateExpensePayload) {
    try {
      if (expense) {
        await updateExpense({ id: expense.id, body }).unwrap();
        toast.success('Gasto actualizado.');
      } else {
        await createExpense(body).unwrap();
        toast.success('Gasto registrado.');
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(errMsg(err, isEdit ? 'No se pudo actualizar el gasto.' : 'No se pudo registrar el gasto.'));
    }
  }

  if (open && pending) {
    const { preview } = pending;
    const fmt = (n: number) => formatCordobas(n, 'C$', 2);
    const fuentes = [
      preview.cubre.propio > 0 && { label: `Pozo ${preview.label}`, monto: preview.cubre.propio },
      preview.cubre.extra > 0 && { label: 'Bolsa extra (sobrante de salario)', monto: preview.cubre.extra },
      ...preview.cubre.pozos.map((p) => ({ label: `Pozo ${p.label}`, monto: p.monto })),
      preview.cubre.ganancia > 0 && { label: 'Ganancia del mes', monto: preview.cubre.ganancia, danger: true },
    ].filter(Boolean) as { label: string; monto: number; danger?: boolean }[];

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeIcon icon={Alert02Icon} size={18} strokeWidth={2} className="text-warning" aria-hidden />
              Este gasto se pasa del pozo {preview.label}
            </DialogTitle>
            <DialogDescription>
              El pozo tiene {fmt(Math.max(0, preview.saldoPozo))} disponibles y el gasto es de {fmt(preview.montoCs)}. Así se cubriría:
            </DialogDescription>
          </DialogHeader>

          <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
            {fuentes.map((f) => (
              <li key={f.label} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className={cn('text-muted-foreground', f.danger && 'font-medium text-destructive')}>{f.label}</span>
                <span className={cn('nums font-semibold', f.danger ? 'text-destructive' : 'text-foreground')}>{fmt(f.monto)}</span>
              </li>
            ))}
          </ul>

          {preview.cubre.ganancia > 0 && (
            <p className="text-xs text-muted-foreground">
              La ganancia real del mes pasa de <span className="nums font-medium text-foreground">{fmt(preview.gananciaRealAntes)}</span> a{' '}
              <span className="nums font-medium text-destructive">{fmt(preview.gananciaRealDespues)}</span>.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={isLoading}>
              Volver
            </Button>
            <Button type="button" onClick={() => save(pending.body)} disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              {isEdit ? 'Guardar igual' : 'Registrar igual'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeIcon icon={Coins01Icon} size={18} strokeWidth={2} className="text-primary-2" aria-hidden />
              {isEdit ? 'Editar gasto' : 'Registrar gasto'}
            </DialogTitle>
            <DialogDescription>
              Se paga con su pozo. Si no alcanza, toma de la bolsa extra, de los otros pozos y, al final, de la ganancia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="expense-pozo">Pozo</FieldLabel>
              <Controller
                control={control}
                name="pozo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isLoading}>
                    <SelectTrigger id="expense-pozo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POZO_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {pozoHint && <FieldDescription>{pozoHint}</FieldDescription>}
            </Field>

            <Field>
              <FieldLabel>Moneda</FieldLabel>
              <Controller
                control={control}
                name="moneda"
                render={({ field }) => (
                  <div role="group" aria-label="Moneda" className="flex gap-2">
                    {(['COR', 'USD'] as const).map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant="outline"
                        aria-pressed={field.value === m}
                        className="flex-1"
                        onClick={() => field.onChange(m)}
                        disabled={isLoading}
                      >
                        {m === 'COR' ? 'C$ Córdobas' : '$ Dólares'}
                      </Button>
                    ))}
                  </div>
                )}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.monto}>
                <FieldLabel htmlFor="expense-monto" required>
                  Monto ({moneda === 'USD' ? '$' : 'C$'})
                </FieldLabel>
                <Input
                  id="expense-monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-required
                  aria-invalid={!!errors.monto}
                  disabled={isLoading}
                  {...register('monto')}
                />
                {moneda === 'USD' && numMonto > 0 && (
                  <FieldDescription>
                    ≈ {formatCordobas(montoEnCordobas, 'C$', 2)} (tasa {exchangeRate})
                  </FieldDescription>
                )}
                <FieldError errors={[errors.monto]} />
              </Field>

              <Field data-invalid={!!errors.fecha}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="expense-fecha" required>Fecha del gasto</FieldLabel>
                  {isManualDate && (
                    <span className="inline-flex items-center rounded-full border border-warning/20 bg-warning/10 px-1.5 text-2xs font-medium text-warning">
                      Fecha cambiada
                    </span>
                  )}
                </div>
                <Controller
                  control={control}
                  name="fecha"
                  render={({ field }) => (
                    <DatePicker id="expense-fecha" value={field.value} onChange={field.onChange} disabled={isLoading} disableFuture />
                  )}
                />
                <FieldError errors={[errors.fecha]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.category}>
              <FieldLabel htmlFor="expense-category" required>Concepto</FieldLabel>
              <Input
                id="expense-category"
                placeholder={pozo === 'prestamos' ? 'Ej. Cuota préstamo Ficohsa' : 'Ej. Anuncios de Facebook, alquiler, reparación…'}
                maxLength={60}
                aria-required
                aria-invalid={!!errors.category}
                disabled={isLoading}
                {...register('category')}
              />
              <FieldError errors={[errors.category]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="expense-description">Descripción (opcional)</FieldLabel>
              <Textarea
                id="expense-description"
                placeholder="Proveedor, número de recibo u otro detalle"
                maxLength={200}
                rows={2}
                aria-invalid={!!errors.description}
                disabled={isLoading}
                {...register('description')}
              />
              <FieldError errors={[errors.description]} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="cancel" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              {isEdit ? 'Guardar cambios' : 'Registrar gasto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botón "Registrar gasto" + formulario. */
export function RegisterExpenseDialog({
  defaultPozo,
  onSuccess,
}: {
  defaultPozo?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
        Registrar gasto
      </Button>
      <ExpenseFormDialog
        open={open}
        onOpenChange={setOpen}
        defaultPozo={defaultPozo && defaultPozo !== 'todos' ? defaultPozo : undefined}
        onSuccess={onSuccess}
      />
    </>
  );
}
