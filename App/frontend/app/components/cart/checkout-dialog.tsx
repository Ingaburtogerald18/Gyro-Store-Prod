// Checkout. Toma los datos de contacto y entrega, crea el pedido en el backend
// (que recalcula el total y arma el mensaje) y abre WhatsApp.
//
// Sobre <Dialog> de shadcn/ui + react-hook-form. La validación usa el MISMO
// schema Zod que valida el backend (shared/schemas.ts): una sola fuente de
// verdad, sin reglas duplicadas que se desincronicen.
import { HugeIcon } from "~/components/ui/icon";
import { Location01Icon, Store01Icon, TruckIcon, Coupon01Icon, Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  DELIVERY_DESTINATION_MESSAGE,
  hasDeliveryDestination,
  publicOrderFieldsSchema,
} from '@shared/schemas';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useCreatePublicOrderMutation, type CreatedPublicOrder } from '~/store/api/storefrontApi';
import {
  useValidateDiscountCodeMutation,
  type DiscountCodeValidation,
} from '~/store/api/discountCodesApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  clearCart,
  closeCart,
  selectCartItems,
  selectCartSubtotal,
  toOrderItems,
} from '~/store/slices/cartSlice';
import { cn } from "~/lib/utils"
import { formatCordobas } from "~/lib/formatters";

// El formulario DERIVA del contrato (DESIGN.md §6b): mismos campos y mismos
// mensajes que validaría el backend, menos los que no llena la persona —
// `items` los pone el carrito y `discountCode` tiene su propio flujo de canje.
const checkoutFormSchema = publicOrderFieldsSchema
  .omit({ discountCode: true })
  .refine(hasDeliveryDestination, {
    message: DELIVERY_DESTINATION_MESSAGE,
    path: ['address'],
  });

type CheckoutForm = z.infer<typeof checkoutFormSchema>;

export function CheckoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotal);
  const config = useStoreConfig();
  const [placed, setPlaced] = useState<CreatedPublicOrder | null>(null);
  const [createOrder, { isLoading }] = useCreatePublicOrderMutation();
  const [validateCode, { isLoading: validatingCode }] = useValidateDiscountCodeMutation();
  const [geoLoading, setGeoLoading] = useState(false);

  // Código de descuento: el preview (validate) NO consume uso; el canje real lo
  // hace el servidor al crear el pedido. El monto acá es solo informativo.
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<DiscountCodeValidation | null>(null);
  const codeDiscount = appliedCode
    ? appliedCode.type === 'percent'
      ? subtotal * (appliedCode.value / 100)
      : Math.min(appliedCode.value, subtotal)
    : 0;
  const totalWithDiscount = Math.max(0, subtotal - codeDiscount);

  async function applyCode() {
    const code = codeInput.trim();
    if (!code) return;
    try {
      const result = await validateCode(code).unwrap();
      setAppliedCode(result);
      toast.success(`Código ${result.code} aplicado.`);
    } catch (err) {
      setAppliedCode(null);
      const message =
        (err as { data?: { error?: string } })?.data?.error ?? 'Código inválido.';
      toast.error(message);
    }
  }

  function removeCode() {
    setAppliedCode(null);
    setCodeInput('');
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: { deliveryMethod: 'retiro', customerName: '', phone: '' },
  });

  const deliveryMethod = watch('deliveryMethod');
  const locationUrl = watch('locationUrl');

  // Ubicación GPS puntual como link de Google Maps, para el repartidor. Es
  // opcional: si niega el permiso, queda la dirección escrita.
  function captureLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Tu dispositivo no permite compartir ubicación.');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setValue('locationUrl', `https://www.google.com/maps?q=${latitude},${longitude}`, {
          shouldValidate: true,
        });
        setGeoLoading(false);
        toast.success('Ubicación agregada');
      },
      (err) => {
        setGeoLoading(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso denegado. Podés escribir la dirección abajo.'
            : 'No se pudo obtener tu ubicación. Escribí la dirección.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function onSubmit(form: CheckoutForm) {
    if (items.length === 0) {
      toast.error('Tu carrito está vacío.');
      return;
    }

    // Los campos ya los validó el resolver (los errores salen en su campo, no
    // por toast). Acá solo se completa lo que el carrito aporta.
    try {
      const order = await createOrder({
        ...form,
        items: toOrderItems(items),
        discountCode: appliedCode?.code,
      }).unwrap();
      reset();
      removeCode();
      dispatch(clearCart());
      setPlaced(order);
      // Se intenta abrir WhatsApp de una; si el navegador lo bloquea (pasa en
      // móvil después de un await), la confirmación tiene el botón a mano.
      window.open(order.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error ??
        'No se pudo crear el pedido. Intentá de nuevo.';
      toast.error(message);
    }
  }

  // Pantalla de confirmación. Antes, al enviar, se vaciaba el carrito, se
  // cerraba todo y se saltaba a WhatsApp: si el navegador bloqueaba la ventana o
  // el cliente no mandaba el mensaje, quedaba sin carrito y sin saber si había
  // comprado. Ahora la tienda confirma el pedido con su número y deja el botón
  // de WhatsApp a mano.
  function handleOpenChange(next: boolean) {
    if (!next && placed) {
      setPlaced(null);
      dispatch(closeCart());
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-md">
        {placed ? (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <span className="mb-1 grid size-12 place-items-center rounded-full bg-success/15 text-success" aria-hidden>
                <HugeIcon icon={CheckmarkCircle02Icon} size={26} strokeWidth={2} />
              </span>
              <DialogTitle className="text-foreground">¡Pedido recibido!</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Tu número de pedido es{' '}
                <span className="font-spec font-semibold text-foreground">#{placed.id.slice(0, 8).toUpperCase()}</span>.
                Mandanos el mensaje por WhatsApp para confirmar la entrega y el pago.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {formatCordobas(placed.total, config?.currency)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="whatsapp" className="h-12 w-full" asChild>
                <a href={placed.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <WhatsappIcon className="h-4 w-4" />
                  Enviar mensaje por WhatsApp
                </a>
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => handleOpenChange(false)}>
                Seguir comprando
              </Button>
            </div>
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="text-foreground">Finalizar pedido</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Completá tus datos y te llevamos a WhatsApp con el pedido ya armado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field data-invalid={Boolean(errors.customerName)}>
            <FieldLabel htmlFor="customerName" required>
              Nombre
            </FieldLabel>
            <Input
              id="customerName"
              autoComplete="name"
              placeholder="Tu nombre"
              aria-required
              aria-invalid={Boolean(errors.customerName)}
              {...register('customerName')}
            />
            <FieldError errors={[errors.customerName]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="phone" required>
              Teléfono
            </FieldLabel>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="8888 8888"
              aria-required
              aria-invalid={Boolean(errors.phone)}
              {...register('phone')}
            />
            <FieldError errors={[errors.phone]} />
          </Field>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium text-foreground">¿Cómo lo recibís?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'retiro', label: 'Retiro en tienda', icon: Store01Icon },
                  { value: 'envio', label: 'Envío a domicilio', icon: TruckIcon },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-ring',
                    deliveryMethod === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    className="sr-only"
                    {...register('deliveryMethod')}
                  />
                  <HugeIcon icon={Icon} size={16} strokeWidth={2} aria-hidden />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Retiro: dónde y cómo llegar, sin que el cliente tenga que preguntar. */}
          {deliveryMethod === 'retiro' && config?.address && (
            <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <HugeIcon icon={Store01Icon} size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Retirás en <span className="font-medium text-foreground">{config.address}</span>.
                {config.locationUrl && (
                  <>
                    {' '}
                    <a href={config.locationUrl} target="_blank" rel="noreferrer" className="font-medium text-primary-2 underline-offset-4 hover:underline">
                      Ver en el mapa
                    </a>
                  </>
                )}
              </span>
            </p>
          )}

          {deliveryMethod === 'envio' && (
            <Field data-invalid={Boolean(errors.address)}>
              <FieldLabel htmlFor="address">Dirección</FieldLabel>
              <Textarea
                id="address"
                rows={2}
                placeholder="Barrio, calle, referencias…"
                aria-invalid={Boolean(errors.address)}
                {...register('address')}
              />
              {/* La regla de entrega cuelga de `address`, así que su mensaje
                  ("agregá dirección o ubicación") aparece justo acá. */}
              <FieldError errors={[errors.address]} />
              <input type="hidden" {...register('locationUrl')} />
              <Button
                type="button"
                variant="outline"
                onClick={captureLocation}
                disabled={geoLoading}
                className="w-full justify-center gap-2"
              >
                <HugeIcon icon={Location01Icon} size={16} strokeWidth={2} aria-hidden />
                {locationUrl
                  ? 'Ubicación agregada — tocá para actualizar'
                  : geoLoading
                    ? 'Obteniendo ubicación…'
                    : 'Compartir mi ubicación'}
              </Button>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="note">Nota (opcional)</FieldLabel>
            <Textarea
              id="note"
              rows={2}
              placeholder="¿Algo que debamos saber?"
              {...register('note')}
            />
          </Field>

          {/* Código de descuento: fuera de `register` a propósito — no es un
              campo del pedido sino un canje que valida el servidor aparte. */}
          <Field>
            <FieldLabel htmlFor="discountCode">Código de descuento (opcional)</FieldLabel>
            {appliedCode ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <HugeIcon icon={Coupon01Icon} size={16} strokeWidth={2} aria-hidden />
                  {appliedCode.code}
                  <span className="font-normal text-muted-foreground">
                    ({appliedCode.type === 'percent' ? `${appliedCode.value}%` : formatCordobas(appliedCode.value, config?.currency)})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={removeCode}
                  className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                  title="Quitar código"
                  aria-label={`Quitar el código ${appliedCode.code}`}
                >
                  <HugeIcon icon={Cancel01Icon} size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="discountCode"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCode();
                    }
                  }}
                  placeholder="¿Tenés un código?"
                  className="uppercase"
                  maxLength={30}
                />
                <Button type="button" variant="outline" onClick={applyCode} disabled={validatingCode || !codeInput.trim()}>
                  {validatingCode ? 'Validando…' : 'Aplicar'}
                </Button>
              </div>
            )}
          </Field>

          <div className="space-y-1 border-t border-border pt-3">
            {codeDiscount > 0 && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCordobas(subtotal, config?.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-primary">
                  <span>Descuento ({appliedCode?.code})</span>
                  <span className="tabular-nums">−{formatCordobas(codeDiscount, config?.currency)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total estimado</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {formatCordobas(totalWithDiscount, config?.currency)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              variant="whatsapp"
              disabled={isLoading}
              className="w-full justify-center"
            >
              {isLoading ? 'Creando pedido…' : 'Enviar pedido por WhatsApp'}
            </Button>
          </DialogFooter>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
