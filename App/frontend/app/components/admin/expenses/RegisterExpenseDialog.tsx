import React, { useState } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  Add01Icon,
  Coins01Icon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  type PozoOverflowItem,
} from '~/store/api/reportsApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';

const POZO_OPTIONS = [
  { value: 'publicidad', label: 'Publicidad' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'utiles', label: 'Útiles de Oficina' },
  { value: 'garantias', label: 'Garantías' },
  { value: 'prestamos', label: 'Préstamos' },
  { value: 'suscripciones', label: 'Suscripciones' },
  { value: 'servicios', label: 'Servicios Básicos' },
  { value: 'salario', label: 'Fondo Salario' },
];

export function RegisterExpenseDialog({
  pozos,
  defaultPozo,
  onSuccess,
}: {
  pozos?: PozoOverflowItem[];
  defaultPozo?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pozo, setPozo] = useState<string>(defaultPozo && defaultPozo !== 'todos' ? defaultPozo : 'publicidad');
  const [monto, setMonto] = useState<string>('');
  const [moneda, setMoneda] = useState<'COR' | 'USD'>('COR');
  const [fecha, setFecha] = useState<string>(() => toYmd(new Date()));
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const [createExpense, { isLoading }] = useCreateExpenseMutation();
  const { data: config } = useGetConfigQuery();
  const exchangeRate = config?.exchangeRate ?? 37;

  const formatMoney = (n: number) => formatCordobas(n, 'C$', 2);

  const numMonto = parseFloat(monto) || 0;
  const montoEnCordobas = moneda === 'USD' ? numMonto * exchangeRate : numMonto;

  const isManualDate = fecha !== toYmd(new Date());

  const resetForm = () => {
    setMonto('');
    setMoneda('COR');
    setFecha(toYmd(new Date()));
    setCategory('');
    setDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!monto || numMonto <= 0) {
      toast.error('El monto debe ser un número mayor a 0.');
      return;
    }

    if (!category.trim()) {
      toast.error('La categoría es obligatoria.');
      return;
    }

    try {
      await createExpense({
        pozo,
        monto: numMonto,
        moneda,
        fecha: isManualDate ? toLocalNoonIso(fecha) : undefined,
        category: category.trim(),
        description: description.trim() || undefined,
      }).unwrap();

      toast.success('Gasto registrado exitosamente.');

      resetForm();
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar el gasto.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-primary-2 text-primary-2-foreground hover:bg-primary-2/90 shadow-sm">
          <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
          Registrar Gasto
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeIcon icon={Coins01Icon} size={18} strokeWidth={2} className="text-primary-2" aria-hidden />
              Registrar Gasto Operativo
            </DialogTitle>
            <DialogDescription>
              Registra un gasto y asígnalo a una categoría. Se descuenta del presupuesto consolidado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Pozo selection */}
            <Field>
              <FieldLabel htmlFor="expense-pozo">Categoría de gasto</FieldLabel>
              <Select value={pozo} onValueChange={setPozo} disabled={isLoading}>
                <SelectTrigger id="expense-pozo">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {POZO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Moneda toggle */}
            <Field>
              <FieldLabel>Moneda</FieldLabel>
              <div className="flex gap-1 rounded-lg border p-1">
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    moneda === 'COR'
                      ? 'bg-primary-2 text-primary-2-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setMoneda('COR')}
                  disabled={isLoading}
                >
                  C$ Córdobas
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    moneda === 'USD'
                      ? 'bg-primary-2 text-primary-2-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setMoneda('USD')}
                  disabled={isLoading}
                >
                  $ Dólares
                </button>
              </div>
            </Field>

            {/* Monto and Fecha side by side */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="expense-monto">
                  Monto ({moneda === 'USD' ? '$' : 'C$'})
                </FieldLabel>
                <Input
                  id="expense-monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  disabled={isLoading}
                  required
                />
                {moneda === 'USD' && numMonto > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ≈ {formatCordobas(montoEnCordobas, 'C$', 2)} (tasa: {exchangeRate})
                  </p>
                )}
              </Field>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="expense-fecha">Fecha del Gasto</FieldLabel>
                  {isManualDate && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Fecha manual
                    </span>
                  )}
                </div>
                <DatePicker
                  id="expense-fecha"
                  value={fecha}
                  onChange={setFecha}
                  disabled={isLoading}
                  disableFuture
                />
              </Field>
            </div>

            {/* Categoría (texto libre, max 60) */}
            <Field>
              <FieldLabel htmlFor="expense-category">Categoría o Concepto</FieldLabel>
              <Input
                id="expense-category"
                type="text"
                placeholder="Ej. Anuncios Facebook, Alquiler, Reparación equipo..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={60}
                disabled={isLoading}
                required
              />
              <FieldDescription>Máximo 60 caracteres.</FieldDescription>
            </Field>

            {/* Descripción opcional (max 200) */}
            <Field>
              <FieldLabel htmlFor="expense-description">Descripción (Opcional)</FieldLabel>
              <Textarea
                id="expense-description"
                placeholder="Detalles adicionales, proveedor o número de recibo..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                rows={2}
                disabled={isLoading}
              />
              <FieldDescription>Máximo 200 caracteres.</FieldDescription>
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !monto || numMonto <= 0 || !category.trim()}
              className="bg-primary-2 text-primary-2-foreground hover:bg-primary-2/90"
            >
              {isLoading ? <Spinner className="mr-2" /> : null}
              Registrar Gasto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
