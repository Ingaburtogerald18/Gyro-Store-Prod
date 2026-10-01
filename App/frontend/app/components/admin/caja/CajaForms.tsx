// Formularios de Caja y bancos: movimiento, cuenta nueva, traspaso y cierre
// del día. Extraídos de admin.caja.tsx al pasarlos a react-hook-form + zod
// (DESIGN.md §6b): antes eran 25 useState sueltos y la validación salía en un
// toast ("Llená cuenta, monto y categoría") que no decía QUÉ campo faltaba.
//
// Regla: la validación de cada campo va en su FieldError, debajo del campo. El
// toast queda para el resultado (guardado / error del servidor).
//
// Mismas reglas que los schemas del backend (App/shared/schemas.ts): la cuenta
// nueva se deriva de `createAccountInputSchema`; movimiento, traspaso y cierre
// repiten sus reglas (monto > 0, origen ≠ destino, contado ≥ 0) con mensajes para
// un formulario que arranca vacío (un uuid vacío daría "Cuenta inválida" en
// vez de "Elegí una cuenta").
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import {
  createAccountInputSchema,
  cuentaTipoSchema,
  movimientoTipoSchema,
  type Account,
} from '@shared/schemas';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { HugeIcon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { errMsg, formatByCurrency } from '~/lib/formatters';
import {
  useCreateAccountMutation,
  useCreateClosureMutation,
  useRegisterMovementMutation,
  useRegisterTransferMutation,
} from '~/store/api/cajaApi';

// Sentinela del Select de categorías: "escribir una categoría suelta" sin
// tocar el catálogo. Un string que ninguna categoría real puede tener.
export const CUSTOM_CAT = '__otra__';

/** Número obligatorio desde un <input>: vacío falla (no se convierte en 0). */
const requiredNumber = (message: string) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? NaN : Number(v)), z.number({ message }));

// ── Movimiento ─────────────────────────────────────────────────────────────

const movementBaseSchema = z.object({
  tipo: movimientoTipoSchema,
  account_id: z.string().min(1, 'Elegí una cuenta.'),
  monto: requiredNumber('Escribí el monto.').pipe(z.number().positive('El monto tiene que ser mayor a 0.')),
  catSelect: z.string(),
  categoria: z.string().trim().max(80, 'Máximo 80 caracteres.'),
  descripcion: z.string().trim().max(300, 'Máximo 300 caracteres.'),
});
type MovementValues = z.input<typeof movementBaseSchema>;
type MovementOutput = z.output<typeof movementBaseSchema>;

const EMPTY_MOVEMENT: MovementValues = {
  tipo: 'ingreso',
  account_id: '',
  monto: '',
  catSelect: '',
  categoria: '',
  descripcion: '',
};

export function MovementDialog({
  open,
  onOpenChange,
  accounts,
  expenseCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  expenseCategories: string[];
}) {
  const [registerMovement, { isLoading }] = useRegisterMovementMutation();
  const hasCatalog = expenseCategories.length > 0;

  // La categoría puede venir del catálogo (egreso) o escrita a mano (ingreso u
  // "Otra…"); cuál es obligatoria depende del tipo, así que la regla es cruzada.
  const schema = useMemo(
    () =>
      movementBaseSchema.superRefine((d, ctx) => {
        const fromCatalog = d.tipo === 'egreso' && hasCatalog && d.catSelect !== CUSTOM_CAT;
        if (fromCatalog && !d.catSelect) {
          ctx.addIssue({ code: 'custom', path: ['catSelect'], message: 'Elegí un rubro.' });
        } else if (!fromCatalog && !d.categoria?.trim()) {
          ctx.addIssue({ code: 'custom', path: ['categoria'], message: 'Escribí la categoría.' });
        }
        // `when`: sin esto zod saltea la regla si otro campo ya falló, y al
        // enviar vacío la categoría no mostraba su error junto a los demás.
      }, { when: () => true }),
    [hasCatalog],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MovementValues, unknown, MovementOutput>({ resolver: zodResolver(schema), defaultValues: EMPTY_MOVEMENT });

  useEffect(() => {
    if (open) reset(EMPTY_MOVEMENT);
  }, [open, reset]);

  const tipo = watch('tipo');
  const catSelect = watch('catSelect');
  const showCatalog = tipo === 'egreso' && hasCatalog;

  const onSubmit = handleSubmit(async (v) => {
    const categoria = showCatalog && v.catSelect !== CUSTOM_CAT ? v.catSelect : v.categoria;
    try {
      await registerMovement({
        account_id: v.account_id,
        tipo: v.tipo,
        monto: v.monto,
        categoria,
        descripcion: v.descripcion || undefined,
      }).unwrap();
      toast.success('Movimiento registrado.');
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar el movimiento.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="mov-tipo">Tipo de movimiento</FieldLabel>
              <Controller
                control={control}
                name="tipo"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // Cambiar de tipo cambia de dónde sale la categoría.
                      setValue('catSelect', '');
                      setValue('categoria', '');
                    }}
                  >
                    <SelectTrigger id="mov-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ingreso">Ingreso de dinero</SelectItem>
                      <SelectItem value="egreso">Egreso o gasto</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field data-invalid={!!errors.account_id}>
              <FieldLabel htmlFor="mov-cuenta" required>Cuenta</FieldLabel>
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="mov-cuenta" aria-required aria-invalid={!!errors.account_id}>
                      <SelectValue placeholder="Elegí una cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.nombre} ({acc.moneda})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.account_id]} />
            </Field>

            <Field data-invalid={!!errors.monto}>
              <FieldLabel htmlFor="mov-monto" required>Monto</FieldLabel>
              <Input id="mov-monto" type="number" step="0.01" min="0" inputMode="decimal" aria-required aria-invalid={!!errors.monto} {...register('monto')} />
              <FieldError errors={[errors.monto]} />
            </Field>

            {/* Egreso con catálogo: rubros + "Otra…". Ingreso: texto libre
                (depósito de venta, aporte, etc.). */}
            {showCatalog ? (
              <Field data-invalid={!!errors.catSelect || !!errors.categoria}>
                <FieldLabel htmlFor="mov-rubro" required>Categoría</FieldLabel>
                <Controller
                  control={control}
                  name="catSelect"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="mov-rubro" aria-required aria-invalid={!!errors.catSelect}>
                        <SelectValue placeholder="Elegí un rubro" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_CAT}>Otra…</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.catSelect]} />
                {catSelect === CUSTOM_CAT && (
                  <>
                    <Input placeholder="Escribí la categoría" aria-label="Categoría" aria-invalid={!!errors.categoria} {...register('categoria')} />
                    <FieldError errors={[errors.categoria]} />
                  </>
                )}
              </Field>
            ) : (
              <Field data-invalid={!!errors.categoria}>
                <FieldLabel htmlFor="mov-categoria" required>Categoría</FieldLabel>
                <Input id="mov-categoria" placeholder="Ej. Depósito de venta, aporte de socio…" aria-required aria-invalid={!!errors.categoria} {...register('categoria')} />
                <FieldError errors={[errors.categoria]} />
              </Field>
            )}

            <Field data-invalid={!!errors.descripcion}>
              <FieldLabel htmlFor="mov-desc">Descripción (opcional)</FieldLabel>
              <Input id="mov-desc" aria-invalid={!!errors.descripcion} {...register('descripcion')} />
              <FieldError errors={[errors.descripcion]} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Cuenta nueva ───────────────────────────────────────────────────────────

const accountFormSchema = createAccountInputSchema.extend({
  nombre: z.string().trim().min(1, 'Escribí el nombre de la cuenta.').max(80, 'Máximo 80 caracteres.'),
  tipo: cuentaTipoSchema,
  moneda: z.string().trim().min(1, 'Indicá la moneda (ej. NIO o USD).').max(8, 'Máximo 8 caracteres.'),
  saldo_inicial: z.coerce.number().min(0, 'El saldo inicial no puede ser negativo.').default(0),
});
type AccountValues = z.input<typeof accountFormSchema>;
type AccountOutput = z.output<typeof accountFormSchema>;
const EMPTY_ACCOUNT: AccountValues = { nombre: '', tipo: 'efectivo', moneda: 'NIO', saldo_inicial: '' };

export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [createAccount, { isLoading }] = useCreateAccountMutation();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountValues, unknown, AccountOutput>({ resolver: zodResolver(accountFormSchema), defaultValues: EMPTY_ACCOUNT });

  useEffect(() => {
    if (open) reset(EMPTY_ACCOUNT);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await createAccount({ ...v, moneda: v.moneda.toUpperCase() }).unwrap();
      toast.success('Cuenta creada.');
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo crear la cuenta.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Nueva cuenta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field data-invalid={!!errors.nombre}>
              <FieldLabel htmlFor="acc-nombre" required>Nombre</FieldLabel>
              <Input id="acc-nombre" placeholder="Ej. BAC Lafise" aria-required aria-invalid={!!errors.nombre} {...register('nombre')} />
              <FieldError errors={[errors.nombre]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="acc-tipo">Tipo</FieldLabel>
              <Controller
                control={control}
                name="tipo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="acc-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo físico</SelectItem>
                      <SelectItem value="banco">Banco o transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.moneda}>
                <FieldLabel htmlFor="acc-moneda" required>Moneda</FieldLabel>
                <Input id="acc-moneda" className="uppercase" aria-required aria-invalid={!!errors.moneda} {...register('moneda')} />
                <FieldError errors={[errors.moneda]} />
              </Field>
              <Field data-invalid={!!errors.saldo_inicial}>
                <FieldLabel htmlFor="acc-saldo">Saldo inicial</FieldLabel>
                <Input id="acc-saldo" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.saldo_inicial} {...register('saldo_inicial')} />
                <FieldError errors={[errors.saldo_inicial]} />
              </Field>
            </div>
            <FieldDescription>
              El saldo inicial es el dinero que ya tenés en esta cuenta hoy. Se suma al saldo desde el arranque.
            </FieldDescription>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Crear cuenta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Traspaso ───────────────────────────────────────────────────────────────

const transferFormSchema = z
  .object({
    from_account_id: z.string().min(1, 'Elegí la cuenta de origen.'),
    to_account_id: z.string().min(1, 'Elegí la cuenta de destino.'),
    monto: requiredNumber('Escribí el monto.').pipe(z.number().positive('El monto tiene que ser mayor a 0.')),
    descripcion: z.string().trim().max(300, 'Máximo 300 caracteres.'),
  })
  // Misma regla que el backend (registerTransferInputSchema), en el campo destino.
  .refine((d) => !d.from_account_id || d.from_account_id !== d.to_account_id, {
    message: 'El origen y el destino tienen que ser cuentas distintas.',
    path: ['to_account_id'],
    // Se evalúa aunque el monto falte, para mostrar todos los errores juntos.
    when: () => true,
  });
type TransferValues = z.input<typeof transferFormSchema>;
type TransferOutput = z.output<typeof transferFormSchema>;
const EMPTY_TRANSFER: TransferValues = { from_account_id: '', to_account_id: '', monto: '', descripcion: '' };

export function TransferDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const [transfer, { isLoading }] = useRegisterTransferMutation();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TransferValues, unknown, TransferOutput>({ resolver: zodResolver(transferFormSchema), defaultValues: EMPTY_TRANSFER });

  useEffect(() => {
    if (open) reset(EMPTY_TRANSFER);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await transfer({ ...v, descripcion: v.descripcion || undefined }).unwrap();
      toast.success('Traspaso registrado.');
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar el traspaso.'));
    }
  });

  const accountSelect = (name: 'from_account_id' | 'to_account_id', id: string, placeholder: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={id} aria-required aria-invalid={!!errors[name]}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Traspaso entre cuentas</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-2">
              <Field className="flex-1" data-invalid={!!errors.from_account_id}>
                <FieldLabel htmlFor="tr-desde" required>Desde</FieldLabel>
                {accountSelect('from_account_id', 'tr-desde', 'Origen')}
                <FieldError errors={[errors.from_account_id]} />
              </Field>
              <HugeIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} className="mt-8 shrink-0 text-muted-foreground" aria-hidden />
              <Field className="flex-1" data-invalid={!!errors.to_account_id}>
                <FieldLabel htmlFor="tr-hacia" required>Hacia</FieldLabel>
                {accountSelect('to_account_id', 'tr-hacia', 'Destino')}
                <FieldError errors={[errors.to_account_id]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.monto}>
              <FieldLabel htmlFor="tr-monto" required>Monto</FieldLabel>
              <Input id="tr-monto" type="number" step="0.01" min="0" inputMode="decimal" aria-required aria-invalid={!!errors.monto} {...register('monto')} />
              <FieldError errors={[errors.monto]} />
            </Field>
            <Field data-invalid={!!errors.descripcion}>
              <FieldLabel htmlFor="tr-desc">Descripción (opcional)</FieldLabel>
              <Input id="tr-desc" placeholder="Ej. Depósito del efectivo del día" aria-invalid={!!errors.descripcion} {...register('descripcion')} />
              <FieldError errors={[errors.descripcion]} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Registrar traspaso
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Cierre del día ─────────────────────────────────────────────────────────

const closureFormSchema = z.object({
  account_id: z.string().min(1, 'Elegí la cuenta que estás cerrando.'),
  saldo_contado: requiredNumber('Escribí cuánto contaste.').pipe(z.number().min(0, 'No puede ser negativo.')),
  notas: z.string().trim().max(500, 'Máximo 500 caracteres.'),
});
type ClosureValues = z.input<typeof closureFormSchema>;
type ClosureOutput = z.output<typeof closureFormSchema>;

export function ClosureDialog({
  open,
  onOpenChange,
  accounts,
  balanceOf,
  cashSalesToday,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Saldo actual de una cuenta (lo calcula el backend). */
  balanceOf: (accountId: string) => number;
  /** Ventas de hoy en efectivo, como referencia al cerrar una caja de efectivo. */
  cashSalesToday?: number;
}) {
  const [createClosure, { isLoading }] = useCreateClosureMutation();
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ClosureValues, unknown, ClosureOutput>({
    resolver: zodResolver(closureFormSchema),
    defaultValues: { account_id: '', saldo_contado: '', notas: '' },
  });

  // Al abrir, preselecciona la caja de efectivo (lo más común de cerrar).
  useEffect(() => {
    if (!open) return;
    const preferred = accounts.find((a) => a.tipo === 'efectivo') ?? accounts[0];
    reset({ account_id: preferred?.id ?? '', saldo_contado: '', notas: '' });
  }, [open, accounts, reset]);

  const accountId = watch('account_id');
  const contadoRaw = watch('saldo_contado');
  const account = accounts.find((a) => a.id === accountId);
  const expected = accountId ? balanceOf(accountId) : 0;
  const contado = contadoRaw === '' || contadoRaw === undefined ? null : Number(contadoRaw);
  const diff = contado === null || Number.isNaN(contado) ? null : contado - expected;

  const onSubmit = handleSubmit(async (v) => {
    try {
      const res = await createClosure({ account_id: v.account_id, saldo_contado: v.saldo_contado, notas: v.notas || undefined }).unwrap();
      const dif = res.diferencia;
      const moneda = accounts.find((a) => a.id === v.account_id)?.moneda;
      if (Math.abs(dif) < 0.01) toast.success('Caja cuadrada, sin diferencia.');
      else if (dif > 0) toast.success(`Cierre guardado. Sobrante de ${formatByCurrency(dif, moneda)}.`);
      else toast.warning(`Cierre guardado. Faltante de ${formatByCurrency(Math.abs(dif), moneda)}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo guardar el cierre.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Cierre del día</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field data-invalid={!!errors.account_id}>
              <FieldLabel htmlFor="cl-cuenta" required>Cuenta a cerrar</FieldLabel>
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cl-cuenta" aria-required aria-invalid={!!errors.account_id}>
                      <SelectValue placeholder="Elegí la cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.account_id]} />
            </Field>

            <div className="flex items-center justify-between rounded-card border border-border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">El sistema espera</span>
              <span className="font-display text-lg font-bold tabular-nums text-foreground">
                {formatByCurrency(expected, account?.moneda)}
              </span>
            </div>

            {/* Referencia: al cerrar una caja de efectivo, cuánto se vendió hoy
                en efectivo (lo que debería haber entrado). */}
            {!!cashSalesToday && cashSalesToday > 0 && account?.tipo === 'efectivo' && (
              <p className="text-xs text-muted-foreground">
                Referencia: hoy se vendieron{' '}
                <span className="font-semibold text-foreground">{formatByCurrency(cashSalesToday)}</span> en efectivo. Si
                esas ventas no están cargadas como ingreso en esta caja, van a aparecer como sobrante.
              </p>
            )}

            <Field data-invalid={!!errors.saldo_contado}>
              <FieldLabel htmlFor="cl-contado" required>¿Cuánto contaste físicamente?</FieldLabel>
              <Input
                id="cl-contado"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                className="text-lg tabular-nums"
                aria-required
                aria-invalid={!!errors.saldo_contado}
                {...register('saldo_contado')}
              />
              <FieldError errors={[errors.saldo_contado]} />
            </Field>

            {diff !== null && !errors.saldo_contado && (
              <div
                className={`flex items-center justify-between rounded-card px-4 py-3 text-sm font-semibold ${
                  Math.abs(diff) < 0.01
                    ? 'bg-success/10 text-success'
                    : diff > 0
                      ? 'bg-info/10 text-info'
                      : 'bg-destructive/10 text-destructive'
                }`}
              >
                <span>{Math.abs(diff) < 0.01 ? 'Cuadra perfecto' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
                <span className="tabular-nums">{formatByCurrency(Math.abs(diff), account?.moneda)}</span>
              </div>
            )}

            <Field data-invalid={!!errors.notas}>
              <FieldLabel htmlFor="cl-notas">Notas (opcional)</FieldLabel>
              <Input id="cl-notas" placeholder="Ej. Faltó vuelto de una venta" aria-invalid={!!errors.notas} {...register('notas')} />
              <FieldError errors={[errors.notas]} />
            </Field>
            <FieldDescription>
              Al guardar, si hay diferencia se registra un ajuste para que el saldo quede igual a lo que contaste.
            </FieldDescription>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              Guardar cierre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
