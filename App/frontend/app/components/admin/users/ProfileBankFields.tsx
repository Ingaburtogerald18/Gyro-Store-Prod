// Fieldset de la cuenta bancaria de pagos, compartido por el diálogo del admin
// (UserDetailDialog) y «Mi perfil» (admin.mi-perfil.tsx).
//
// Vive aparte porque son ~100 líneas con tres reglas finas —sembrar la moneda al
// elegir banco por primera vez, forzar USD en Ficohsa, poder limpiar la cuenta
// entera— y duplicarlas en dos pantallas garantiza que una de las dos se quede
// atrás. Los dos formularios validan con `updateProfileSchema`, así que reciben
// el `useForm` entero y no una lista de props sueltas.
import { useEffect } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import {
  PAYOUT_BANKS,
  PAYOUT_BANK_LABELS,
  PAYOUT_CURRENCIES,
  PAYOUT_CURRENCY_LABELS,
  type UpdateProfileInput,
} from '@shared/schemas';

import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

export function ProfileBankFields({
  form,
  idPrefix,
  legend = 'Cuenta bancaria (pagos)',
}: {
  form: UseFormReturn<UpdateProfileInput>;
  /** Prefijo de los `id` para que dos instancias en la misma página no choquen. */
  idPrefix: string;
  legend?: string;
}) {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  // Ficohsa solo opera cuentas en dólares: al elegirlo se fuerza la moneda y se
  // deshabilita Córdobas. El `superRefine` del schema lo respalda del lado del
  // servidor, así que un request fuera del panel tampoco se la salta.
  const bankAccount = watch('bank_account');
  const isFicohsa = watch('bank_account.bank') === 'ficohsa';

  useEffect(() => {
    if (isFicohsa) {
      setValue('bank_account.currency', 'USD', { shouldValidate: true });
    }
  }, [isFicohsa, setValue]);

  return (
    <fieldset className="grid gap-4 rounded-card border bg-muted/40 p-3">
      <legend className="px-1 text-xs font-semibold text-foreground">{legend}</legend>

      <Field data-invalid={!!errors.bank_account?.bank}>
        <FieldLabel htmlFor={`${idPrefix}-bank`}>Banco</FieldLabel>
        <Controller
          control={control}
          name="bank_account.bank"
          render={({ field }) => (
            <Select
              value={field.value ?? ''}
              onValueChange={(v) => {
                field.onChange(v);
                // Primera vez que se elige banco: la cuenta pasa de null a
                // objeto, así que hay que sembrar la moneda o quedaría
                // `undefined` y el schema la rechazaría sin decir por qué.
                if (!bankAccount?.currency) {
                  setValue('bank_account.currency', v === 'ficohsa' ? 'USD' : 'NIO');
                }
              }}
            >
              <SelectTrigger id={`${idPrefix}-bank`}>
                <SelectValue placeholder="Elegí el banco" />
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_BANKS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {PAYOUT_BANK_LABELS[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[errors.bank_account?.bank]} />
      </Field>

      <Field data-invalid={!!errors.bank_account?.currency}>
        <FieldLabel htmlFor={`${idPrefix}-currency`}>Moneda</FieldLabel>
        <Controller
          control={control}
          name="bank_account.currency"
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger id={`${idPrefix}-currency`}>
                <SelectValue placeholder="Elegí la moneda" />
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_CURRENCIES.map((c) => (
                  <SelectItem
                    key={c}
                    value={c}
                    // Ficohsa no maneja córdobas: la opción se deshabilita en vez
                    // de dejar elegirla y fallar después.
                    disabled={isFicohsa && c !== 'USD'}
                  >
                    {PAYOUT_CURRENCY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {isFicohsa && (
          <FieldDescription>Ficohsa solo maneja cuentas en dólares.</FieldDescription>
        )}
        <FieldError errors={[errors.bank_account?.currency]} />
      </Field>

      <Field data-invalid={!!errors.bank_account?.number}>
        <FieldLabel htmlFor={`${idPrefix}-account-number`}>Número de cuenta</FieldLabel>
        <Input
          id={`${idPrefix}-account-number`}
          inputMode="numeric"
          placeholder="1234567890"
          aria-invalid={!!errors.bank_account?.number}
          {...register('bank_account.number')}
        />
        <FieldError errors={[errors.bank_account?.number]} />
      </Field>

      {bankAccount?.bank && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start text-muted-foreground"
          onClick={() => setValue('bank_account', null, { shouldValidate: true })}
        >
          Quitar cuenta bancaria
        </Button>
      )}
    </fieldset>
  );
}
