import React, { useState } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  Coins01Icon,
  Calendar03Icon,
  Note01Icon,
  Add01Icon,
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
import { DatePicker, toYmd } from '~/components/ui/date-picker';
import { Spinner } from '~/components/ui/spinner';
import { errMsg, formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import { useCreateLoanPaymentMutation } from '~/store/api/reportsApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';

interface RegisterLoanPaymentDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  defaultDate?: string;
  onSuccess?: () => void;
}

export function RegisterLoanPaymentDialog({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
  defaultDate,
  onSuccess,
}: RegisterLoanPaymentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (next: boolean) => {
    if (isControlled) {
      setControlledOpen?.(next);
    } else {
      setInternalOpen(next);
    }
  };

  const [moneda, setMoneda] = useState<'COR' | 'USD'>('COR');
  const [monto, setMonto] = useState<string>('');
  const [fecha, setFecha] = useState<string>(() => defaultDate || toYmd(new Date()));
  const [nota, setNota] = useState<string>('');
  const [errorMonto, setErrorMonto] = useState<string | null>(null);

  const [createLoanPayment, { isLoading }] = useCreateLoanPaymentMutation();
  const { data: config } = useGetConfigQuery();
  const exchangeRate = config?.exchangeRate ?? 37;

  const numMonto = parseFloat(monto) || 0;
  const montoEnCordobas = moneda === 'USD' ? numMonto * exchangeRate : numMonto;

  const resetForm = () => {
    setMoneda('COR');
    setMonto('');
    setFecha(defaultDate || toYmd(new Date()));
    setNota('');
    setErrorMonto(null);
  };

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (!next) {
      resetForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMonto(null);

    if (!monto || numMonto <= 0) {
      setErrorMonto('El monto debe ser un número mayor a 0');
      return;
    }

    try {
      await createLoanPayment({
        monto: numMonto,
        moneda,
        fecha,
        nota: nota.trim() ? nota.trim() : null,
      }).unwrap();

      toast.success(
        moneda === 'USD'
          ? `Pago de $${numMonto.toFixed(2)} registrado (≈ ${formatCordobas(montoEnCordobas, 'C$', 2)})`
          : 'Pago de préstamo registrado correctamente'
      );
      resetForm();
      setIsOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar el pago de préstamo'));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <HugeIcon icon={Coins01Icon} size={20} strokeWidth={2} />
              </div>
              <div>
                <DialogTitle>Registrar Pago de Préstamo</DialogTitle>
                <DialogDescription>
                  Se deducirá directamente de la ganancia real de la tienda.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selector de Moneda */}
            <Field>
              <FieldLabel>Moneda de Pago</FieldLabel>
              <div className="flex gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                    moneda === 'COR'
                      ? 'bg-card text-foreground shadow-sm border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setMoneda('COR')}
                  disabled={isLoading}
                >
                  C$ Córdobas
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                    moneda === 'USD'
                      ? 'bg-card text-foreground shadow-sm border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setMoneda('USD')}
                  disabled={isLoading}
                >
                  $ Dólares (USD)
                </button>
              </div>
            </Field>

            {/* Monto */}
            <Field>
              <FieldLabel required>
                Monto en {moneda === 'USD' ? 'Dólares ($)' : 'Córdobas (C$)'}
              </FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  {moneda === 'USD' ? '$' : 'C$'}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => {
                    setMonto(e.target.value);
                    if (errorMonto) setErrorMonto(null);
                  }}
                  className="pl-10 font-mono text-base font-medium"
                  autoFocus
                  required
                />
              </div>
              {errorMonto && <FieldError>{errorMonto}</FieldError>}
              {moneda === 'USD' && numMonto > 0 ? (
                <p className="mt-1.5 text-xs font-medium text-amber-500">
                  ≈ {formatCordobas(montoEnCordobas, 'C$', 2)} (Tasa oficial: C$ {exchangeRate.toFixed(2)})
                </p>
              ) : (
                <FieldDescription>
                  Ingresa la cuota o abono realizado al préstamo.
                </FieldDescription>
              )}
            </Field>

            {/* Fecha */}
            <Field>
              <FieldLabel required>Fecha del Pago</FieldLabel>
              <div className="flex items-center gap-2">
                <DatePicker
                  value={fecha}
                  onChange={(val) => setFecha(val)}
                  className="w-full"
                />
              </div>
              <FieldDescription>
                Fecha contable en la que se efectuó el pago.
              </FieldDescription>
            </Field>

            {/* Nota */}
            <Field>
              <FieldLabel>Nota o Descripción (Opcional)</FieldLabel>
              <Textarea
                placeholder="Ej. Cuota préstamo banco / Cuota socio / Pago extraordinario"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={300}
                rows={2}
                className="resize-none"
              />
              <FieldDescription>
                Detalle para auditar el pago más adelante.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={isLoading}
              className="gap-1.5"
            >
              {isLoading ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Guardando...
                </>
              ) : (
                <>
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
                  Registrar Pago
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
