import { FormLayout, FormActions, FormBody } from '~/components/ui/form-layout';
// Checkout dentro del panel del carrito. El servidor recalcula y valida antes de
// abrir WhatsApp; si algo cambió, el pedido no se crea y se muestra por línea.
import { HugeIcon } from '~/components/ui/icon';
import {
  ArrowLeft02Icon,
  CheckmarkCircle02Icon,
  Location01Icon,
  PackageIcon,
  Store01Icon,
  TruckIcon,
} from '@hugeicons/core-free-icons';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@remix-run/react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DELIVERY_DESTINATION_MESSAGE,
  hasDeliveryDestination,
  publicOrderFieldsSchema,
  type OrderIssue,
  type PublicOrderInput,
} from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { useCartContent } from '~/hooks/useCartContent';
import { saveOrder } from '~/lib/orderHistory';
import { getAnalyticsSessionId, trackCheckoutStart } from '~/lib/analytics.client';
import { STORE_POLICIES } from '~/lib/storePolicies';
import { lineCeiling, variantText } from '~/lib/cart';
import {
  useCreatePublicOrderMutation,
  useRecoverPublicOrderMutation,
  type CreatedPublicOrder,
} from '~/store/api/storefrontApi';
import {
  useValidateDiscountCodeMutation,
  type DiscountCodeValidation,
} from '~/store/api/discountCodesApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  clearCartIfUnchanged,
  lineKey,
  removeItem,
  reviseItem,
  selectCartItems,
  selectCartSubtotal,
  toOrderItems,
} from '~/store/slices/cartSlice';
import type { CartItem } from '~/types/cart';
import { cn } from '~/lib/utils';
import { formatCordobas, getProductUrl } from '~/lib/formatters';
import {
  checkoutCleared,
  checkoutExtrasChanged,
  checkoutFieldsChanged,
  EMPTY_CHECKOUT_FIELDS,
  selectCheckoutDraft,
} from '~/store/slices/checkoutSlice';
import {
  clearCheckoutAttempt,
  matchesAttemptItems,
  newCheckoutAttemptKey,
  saveCheckoutAttempt,
} from '~/lib/checkoutAttempt';
import { toast } from 'sonner';

// El formulario DERIVA del contrato: mismos campos y mismos
// mensajes que validaría el backend, menos los que no llena la persona.
const checkoutFormSchema = publicOrderFieldsSchema
  .omit({ discountCode: true })
  .refine(hasDeliveryDestination, {
    message: DELIVERY_DESTINATION_MESSAGE,
    path: ['address'],
  });

type CheckoutForm = z.infer<typeof checkoutFormSchema>;

// Campos cómodos: 48px de alto y 16px de letra (en iOS, menos de 16px hace zoom).
const FIELD = 'h-12 rounded-xl px-3 text-base md:text-base';

/** Un problema que el servidor encontró en una línea, ya ligado a esa línea. */
interface LineIssue extends OrderIssue {
  key: string;
  item: CartItem;
}

const ISSUE_TEXT: Record<OrderIssue['reason'], string> = {
  not_found: 'Ya no está disponible en la tienda.',
  variant_required: 'Falta elegir sus opciones.',
  invalid_variant: 'La opción guardada ya no existe. Elegí otra.',
  sold_out: 'Se agotó esta opción.',
  coming_soon: 'Viene en camino: todavía no se puede pedir.',
  unknown_stock: 'No tenemos confirmada su disponibilidad.',
  insufficient: 'No hay tantas unidades disponibles.',
  price_changed: 'Cambió el precio.',
};

export function CheckoutPanel({
  onBack,
  onPlaced,
  onDone,
  placed,
}: {
  onBack: () => void;
  onPlaced: (order: CreatedPublicOrder) => void;
  onDone: () => void;
  placed: CreatedPublicOrder | null;
}) {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotal);
  const config = useStoreConfig();
  const cartContent = useCartContent();
  const currency = config?.currency;
  const [createOrder, { isLoading }] = useCreatePublicOrderMutation();
  const [recoverOrder, { isLoading: recovering }] = useRecoverPublicOrderMutation();
  const [validateCode, { isLoading: validatingCode }] = useValidateDiscountCodeMutation();
  const [geoLoading, setGeoLoading] = useState(false);
  const [issues, setIssues] = useState<LineIssue[]>([]);
  const [submitError, setSubmitError] = useState('');
  const submitting = useRef(false);
  const ids = useId();
  const draft = useAppSelector(selectCheckoutDraft);
  const { codeInput, appliedCode, couponOpen, noteOpen, attempt: pending } = draft;
  const [codeError, setCodeError] = useState('');
  const setCodeInput = (value: string) => dispatch(checkoutExtrasChanged({ codeInput: value }));
  const setAppliedCode = (value: DiscountCodeValidation | null) => dispatch(checkoutExtrasChanged({ appliedCode: value }));
  const setCouponOpen = (value: boolean | ((previous: boolean) => boolean)) =>
    dispatch(checkoutExtrasChanged({ couponOpen: typeof value === 'function' ? value(couponOpen) : value }));
  const setNoteOpen = (value: boolean | ((previous: boolean) => boolean)) =>
    dispatch(checkoutExtrasChanged({ noteOpen: typeof value === 'function' ? value(noteOpen) : value }));
  const codeDiscount = appliedCode
    ? appliedCode.type === 'percent'
      ? subtotal * (appliedCode.value / 100)
      : Math.min(appliedCode.value, subtotal)
    : 0;
  const totalWithDiscount = Math.max(0, subtotal - codeDiscount);

  // Inicio real del checkout: una vez por entrada al formulario, no por render.
  useEffect(() => {
    if (!placed) trackCheckoutStart(items.length, subtotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyCode() {
    const code = codeInput.trim();
    if (!code) return;
    setCodeError('');
    try {
      setAppliedCode(await validateCode(code).unwrap());
    } catch (err) {
      setAppliedCode(null);
      setCodeError((err as { data?: { error?: string } })?.data?.error ?? 'Código inválido.');
    }
  }

  function removeCode() {
    setAppliedCode(null);
    setCodeInput('');
    setCodeError('');
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: draft.fields,
  });

  const deliveryMethod = watch('deliveryMethod');
  const locationUrl = watch('locationUrl');

  // Ubicación GPS puntual como link de Google Maps, para el repartidor.
  function captureLocation() {
    if (!('geolocation' in navigator)) {
      setSubmitError('Tu dispositivo no permite compartir ubicación. Escribí la dirección.');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setValue('locationUrl', `https://www.google.com/maps?q=${latitude},${longitude}`, { shouldValidate: true });
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        setSubmitError(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado. Podés escribir la dirección.'
            : 'No se pudo obtener tu ubicación. Escribí la dirección.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  // Solo memoria de esta sesión: sobrevive a volver al carrito y cerrar el panel.
  useEffect(() => {
    const subscription = watch(() => dispatch(checkoutFieldsChanged(getValues())));
    return () => subscription.unsubscribe();
  }, [watch, getValues, dispatch]);

  function acceptOrder(order: CreatedPublicOrder, request: PublicOrderInput, openWhatsapp: boolean) {
    const unchanged = matchesAttemptItems(toOrderItems(items), request.items);
    dispatch(clearCartIfUnchanged(request.items));
    saveOrder({ id: order.id, createdAt: new Date().toISOString(), total: order.total });
    clearCheckoutAttempt();
    reset(EMPTY_CHECKOUT_FIELDS);
    dispatch(checkoutCleared());
    onPlaced(order);
    if (!unchanged) toast.info('Recuperamos el pedido anterior. Los cambios del carrito siguen guardados.');
    if (openWhatsapp) window.open(order.whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  // Una recarga consulta el resultado existente sin crear pedidos automáticamente.
  useEffect(() => {
    if (!pending?.idempotencyKey || placed) return;
    let active = true;
    void recoverOrder(pending.idempotencyKey).unwrap().then(order => {
      if (active && order) acceptOrder(order, pending, false);
    }).catch(() => {
      if (active) setSubmitError('No pudimos comprobar el intento anterior. Reintentá: conservamos el mismo pedido.');
    });
    return () => { active = false; };
    // Una vez por entrada al panel; los reintentos usan el mismo request guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(form: CheckoutForm) {
    if (submitting.current || recovering) return;
    if (pending) return sendAttempt(pending);
    if (!items.length) { setSubmitError('Tu carrito está vacío.'); return; }
    try {
      const request = saveCheckoutAttempt({
        ...form, items: toOrderItems(items), discountCode: appliedCode?.code,
        sessionId: getAnalyticsSessionId(), idempotencyKey: newCheckoutAttemptKey(),
      });
      dispatch(checkoutExtrasChanged({ attempt: request }));
      await sendAttempt(request);
    } catch {
      setSubmitError('No pudimos conservar el intento en esta pestaña. Habilitá el almacenamiento del navegador; el pedido no se envió.');
    }
  }

  async function sendAttempt(request: PublicOrderInput) {
    if (submitting.current || recovering) return;
    submitting.current = true;
    setSubmitError('');
    setIssues([]);
    const sent: CartItem[] = request.items.map(line =>
      items.find(item => line.comboId
        ? item.comboId === line.comboId
        : item.catalogId === line.catalogItemId && item.variantName === line.variantName)
      ?? {
        catalogId: line.catalogItemId ?? '', comboId: line.comboId,
        variantName: line.variantName ?? '', name: 'Producto del intento anterior',
        price: line.unitPrice ?? 0, quantity: line.quantity, image: '',
      });
    try {
      const order = await createOrder(request).unwrap();
      acceptOrder(order, request, true);
    } catch (err) {
      const failure = err as { status?: number | string; data?: { error?: string; code?: string; issues?: OrderIssue[] } };
      const data = failure.data;
      // Solo las validaciones 400/409 permiten corregir el formulario. Un
      // conflicto de clave, límite de peticiones, red o 5xx conserva el intento:
      // podría existir un pedido cuya respuesta todavía no recibimos.
      if ((failure.status === 400 || failure.status === 409) && data?.code !== 'ORDER_ATTEMPT_CONFLICT') {
        clearCheckoutAttempt();
        dispatch(checkoutExtrasChanged({ attempt: null }));
      }
      if (data?.issues?.length) {
        setIssues(data.issues.map(issue => {
          const item = sent[issue.index];
          return item ? { ...issue, item, key: lineKey(item) } : null;
        }).filter((issue): issue is LineIssue => issue !== null));
      } else {
        const message = data?.error ?? 'No pudimos confirmar el registro. Reintentá: conservamos el mismo pedido para evitar duplicados.';
        if (appliedCode && /c[oó]digo/i.test(message)) {
          setCouponOpen(true);
          setCodeError(message);
          setAppliedCode(null);
        } else setSubmitError(message);
      }
    } finally {
      submitting.current = false;
    }
  }

  if (placed) {
    return <OrderPlaced order={placed} content={cartContent} currency={currency} onDone={onDone} />;
  }

  return (
    <FormLayout onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBody>
        <Button type="button" variant="ghost" onClick={onBack} className="-ml-2 h-11 px-2 text-sm">
          <HugeIcon icon={ArrowLeft02Icon} size={18} strokeWidth={2} aria-hidden />
          Volver al carrito
        </Button>

        {issues.length > 0 && renderIssues()}
        {pending && (
          <p
            role="status"
            className="rounded-xl border border-primary-2/30 bg-primary-2/5 p-3 text-sm"
          >
            {recovering
              ? 'Comprobando el pedido anterior…'
              : 'Este intento está pendiente de confirmación. Reintentamos con los mismos datos para evitar duplicados.'}
          </p>
        )}
        <fieldset
          disabled={isLoading || recovering || Boolean(pending)}
          className="min-w-0 space-y-4"
        >
          <Field data-invalid={Boolean(errors.customerName)}>
            <FieldLabel htmlFor={`${ids}-name`} required>
              Nombre
            </FieldLabel>
            <Input
              id={`${ids}-name`}
              autoComplete="name"
              placeholder="Tu nombre"
              aria-required
              aria-invalid={Boolean(errors.customerName)}
              className={FIELD}
              {...register('customerName')}
            />
            <FieldError errors={[errors.customerName]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor={`${ids}-phone`} required>
              Teléfono (WhatsApp)
            </FieldLabel>
            <Input
              id={`${ids}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="8888 8888"
              aria-required
              aria-invalid={Boolean(errors.phone)}
              className={FIELD}
              {...register('phone')}
            />
            <FieldError errors={[errors.phone]} />
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-foreground">¿Cómo lo recibís?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'retiro', label: 'Retiro en tienda', icon: Store01Icon },
                  { value: 'envio', label: 'Envío', icon: TruckIcon },
                ] as const
              ).map(({ value, label, icon }) => (
                <label
                  key={value}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-3 text-center text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring',
                    deliveryMethod === value
                      ? 'border-primary-2 bg-primary-2/10 font-semibold text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary-2/50 hover:text-foreground',
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    className="sr-only"
                    {...register('deliveryMethod')}
                  />
                  <HugeIcon icon={icon} size={18} strokeWidth={2} aria-hidden />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {deliveryMethod === 'retiro' && config?.address && (
            <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
              <HugeIcon
                icon={Store01Icon}
                size={16}
                strokeWidth={2}
                aria-hidden
                className="mt-0.5 shrink-0"
              />
              <span>
                Retirás en <span className="font-medium text-foreground">{config.address}</span>.
                {config.locationUrl && (
                  <>
                    {' '}
                    <a
                      href={config.locationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary-2 underline underline-offset-4"
                    >
                      Ver en el mapa
                    </a>
                  </>
                )}
              </span>
            </p>
          )}

          {deliveryMethod === 'envio' && (
            <Field data-invalid={Boolean(errors.address)}>
              <FieldLabel htmlFor={`${ids}-address`}>Dirección</FieldLabel>
              <Textarea
                id={`${ids}-address`}
                rows={2}
                placeholder="Ciudad, barrio, calle y referencias"
                aria-invalid={Boolean(errors.address)}
                className="min-h-20 rounded-xl text-base md:text-base"
                {...register('address')}
              />
              <FieldError errors={[errors.address]} />
              <input type="hidden" {...register('locationUrl')} />
              <Button
                type="button"
                variant="outline"
                onClick={captureLocation}
                disabled={geoLoading}
                className="h-12 w-full justify-center gap-2"
              >
                <HugeIcon icon={Location01Icon} size={18} strokeWidth={2} aria-hidden />
                {locationUrl
                  ? 'Ubicación agregada · tocá para actualizar'
                  : geoLoading
                  ? 'Obteniendo ubicación…'
                  : 'Compartir mi ubicación'}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {STORE_POLICIES.managua.title}: {STORE_POLICIES.managua.text.toLowerCase()}{' '}
                {STORE_POLICIES.outside.title}: {STORE_POLICIES.outside.text.toLowerCase()}
              </p>
            </Field>
          )}

          {/* Nota y código: plegados, pero sus valores se conservan al cerrar. */}
          <div className="space-y-3">
            <Disclosure
              open={noteOpen}
              onToggle={() => setNoteOpen((v) => !v)}
              label="Agregar una nota"
              controls={`${ids}-note-box`}
            />
            <div id={`${ids}-note-box`} hidden={!noteOpen}>
              <Field>
                <FieldLabel htmlFor={`${ids}-note`}>Nota (opcional)</FieldLabel>
                <Textarea
                  id={`${ids}-note`}
                  rows={2}
                  placeholder="¿Algo que debamos saber?"
                  className="rounded-xl text-base md:text-base"
                  {...register('note')}
                />
              </Field>
            </div>

            <Disclosure
              open={couponOpen || Boolean(appliedCode)}
              onToggle={() => setCouponOpen((v) => !v)}
              label="¿Tenés un código de descuento?"
              controls={`${ids}-coupon-box`}
              disabled={Boolean(appliedCode)}
            />
            <div id={`${ids}-coupon-box`} hidden={!(couponOpen || appliedCode)}>
              <Field data-invalid={Boolean(codeError)}>
                <FieldLabel htmlFor={`${ids}-code`}>Código de descuento</FieldLabel>
                {appliedCode ? (
                  <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-primary-2/40 bg-primary-2/10 px-3">
                    <span className="text-sm font-semibold text-foreground">
                      {appliedCode.code}{' '}
                      <span className="font-normal text-muted-foreground">
                        (
                        {appliedCode.type === 'percent'
                          ? `${appliedCode.value}%`
                          : formatCordobas(appliedCode.value, currency)}
                        )
                      </span>
                    </span>
                    <Button type="button" variant="ghost" onClick={removeCode} className="h-11 px-3">
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id={`${ids}-code`}
                      value={codeInput}
                      onChange={(e) => {
                        setCodeInput(e.target.value.toUpperCase());
                        setCodeError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void applyCode();
                        }
                      }}
                      aria-invalid={Boolean(codeError)}
                      aria-describedby={codeError ? `${ids}-code-error` : undefined}
                      placeholder="GS-DC-123"
                      autoComplete="off"
                      className={cn(FIELD, 'uppercase')}
                      maxLength={30}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void applyCode()}
                      disabled={validatingCode || !codeInput.trim()}
                      className="h-12 px-4"
                    >
                      {validatingCode ? 'Validando…' : 'Aplicar'}
                    </Button>
                  </div>
                )}
                {codeError && (
                  <p id={`${ids}-code-error`} role="alert" className="text-sm text-destructive">
                    {codeError}
                  </p>
                )}
              </Field>
            </div>
          </div>
        </fieldset>

        {/* Resumen compacto: líneas con variante y cantidades. */}
        <section
          aria-labelledby={`${ids}-summary`}
          className="space-y-2 rounded-xl border border-border p-3"
        >
          <h3 id={`${ids}-summary`} className="text-sm font-semibold text-foreground">
            Resumen
          </h3>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={lineKey(item)} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-muted-foreground">
                  <span className="text-foreground">
                    {item.quantity}× {item.name}
                  </span>
                  {variantText(item) && <span className="block text-xs">{variantText(item)}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {formatCordobas(item.price * item.quantity, currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal de productos</span>
              <span className="tabular-nums">{formatCordobas(subtotal, currency)}</span>
            </div>
            {codeDiscount > 0 && (
              <div className="flex justify-between text-primary-2">
                <span>Descuento ({appliedCode?.code})</span>
                <span className="tabular-nums">−{formatCordobas(codeDiscount, currency)}</span>
              </div>
            )}
            {deliveryMethod === 'envio' && (
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span>por confirmar</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold text-foreground">
              <span>{deliveryMethod === 'envio' ? 'Total de productos' : 'Total'}</span>
              <span className="tabular-nums">{formatCordobas(totalWithDiscount, currency)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pagás en efectivo o por transferencia al coordinar el pedido.
          </p>
        </section>

        {submitError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {submitError}
          </p>
        )}
      </FormBody>

      <FormActions className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          type={pending ? 'button' : 'submit'}
          variant="whatsapp"
          onClick={pending ? () => void sendAttempt(pending) : undefined}
          disabled={isLoading || recovering || issues.length > 0}
          className="min-h-12 h-auto w-full whitespace-normal py-3 text-sm leading-snug sm:text-base"
        >
          <WhatsappIcon className="size-4" />
          {recovering
            ? 'Comprobando pedido…'
            : isLoading
            ? 'Registrando pedido…'
            : pending
            ? 'Reintentar el mismo pedido'
            : 'Registrar y abrir WhatsApp'}
        </Button>
        {issues.length > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Revisá los cambios de arriba para continuar.
          </p>
        )}
      </FormActions>
    </FormLayout>
  );

  /**
   * Cambios que encontró el servidor, por línea, con una acción explícita para
   * cada uno. Al resolverlos todos, el botón de registrar vuelve a habilitarse.
   */
  function renderIssues() {
    const list = issues;
    const cur = currency;
    const resolve = (key: string, reason: OrderIssue['reason']) =>
      setIssues((prev) => prev.filter((i) => !(i.key === key && i.reason === reason)));
    return (
      <section role="alert" aria-labelledby={`${ids}-issues`} className="space-y-3 rounded-xl border-2 border-destructive/50 bg-destructive/5 p-3">
        <h3 id={`${ids}-issues`} className="text-sm font-semibold text-foreground">
          Algunos productos cambiaron. Revisalos antes de registrar el pedido.
        </h3>
        <ul className="space-y-3">
          {list.map((issue) => {
            const label = variantText(issue.item);
            return (
              <li key={`${issue.key}-${issue.reason}`} className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-foreground">{issue.item.name}</span>
                  {label && <span className="text-muted-foreground"> · {label}</span>}
                  <span className="block text-muted-foreground">
                    {ISSUE_TEXT[issue.reason]}
                    {issue.reason === 'price_changed' && issue.currentPrice !== undefined && (
                      <> Antes {formatCordobas(issue.item.price, cur)}, ahora {formatCordobas(issue.currentPrice, cur)}.</>
                    )}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {issue.reason === 'price_changed' && issue.currentPrice !== undefined && (
                    <Button type="button" variant="outline" className="h-11" onClick={() => {
                      dispatch(reviseItem({ key: issue.key, price: issue.currentPrice }));
                      resolve(issue.key, issue.reason);
                    }}>
                      Aceptar el precio nuevo
                    </Button>
                  )}
                  {issue.reason === 'insufficient' && issue.maxQuantity !== undefined && issue.maxQuantity > 0 && (
                    <Button type="button" variant="outline" className="h-11" onClick={() => {
                      dispatch(reviseItem({ key: issue.key, maxQuantity: issue.maxQuantity }));
                      resolve(issue.key, issue.reason);
                    }}>
                      Ajustar a lo disponible
                    </Button>
                  )}
                  {(issue.reason === 'variant_required' || issue.reason === 'invalid_variant') && !issue.item.comboId && (
                    <Button type="button" variant="outline" className="h-11" asChild>
                      <Link to={getProductUrl(issue.item.catalogId, issue.item.name)} onClick={onDone}>Elegir opciones</Link>
                    </Button>
                  )}
                  <Button type="button" variant="ghost" className="h-11 text-destructive" onClick={() => {
                    dispatch(removeItem(issue.key));
                    setIssues((prev) => prev.filter((i) => i.key !== issue.key));
                  }}>
                    Quitar del carrito
                  </Button>
                </div>
                {issue.reason === 'insufficient' && lineCeiling(issue.item) < issue.item.quantity && (
                  <p className="text-xs text-muted-foreground">Podés pedir menos unidades o consultarnos por WhatsApp.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
}

function Disclosure({
  open,
  onToggle,
  label,
  controls,
  disabled,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  controls: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      aria-controls={controls}
      className="flex min-h-11 items-center gap-2 text-sm font-medium text-primary-2 underline-offset-4 hover:underline focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:no-underline disabled:opacity-100"
    >
      <span aria-hidden className={cn('inline-block transition-transform motion-reduce:transition-none', open && 'rotate-90')}>›</span>
      {label}
    </button>
  );
}

/**
 * Pedido registrado: número, total y las dos salidas (WhatsApp y seguimiento).
 * Deja claro que abrir WhatsApp no envía el mensaje ni confirma la venta.
 * Exportado para que el editor muestre exactamente esta pantalla.
 */
export function OrderPlaced({
  order,
  content,
  currency,
  onDone,
}: {
  order: Pick<CreatedPublicOrder, 'id' | 'total' | 'whatsappUrl'>;
  content: Pick<ReturnType<typeof useCartContent>, 'successImage' | 'successTitle' | 'successText'>;
  currency?: string;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-start gap-2">
        {content.successImage ? (
          <img src={content.successImage} alt="" className="size-28 object-contain" />
        ) : (
          <span className="grid size-12 place-items-center rounded-full bg-success/15 text-foreground" aria-hidden>
            <HugeIcon icon={CheckmarkCircle02Icon} size={26} strokeWidth={2} />
          </span>
        )}
        <h3 className="font-heading text-xl font-bold text-foreground">{content.successTitle}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tu pedido quedó registrado con el número{' '}
          <span className="font-semibold text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>.{' '}
          {content.successText}
        </p>
        <p className="text-xs text-muted-foreground">
          Abrir WhatsApp no envía el mensaje solo: revisalo y tocá enviar. El pago y la entrega se coordinan en el chat.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border p-3">
        <span className="text-sm text-muted-foreground">Total de productos</span>
        <span className="text-lg font-bold text-foreground tabular-nums">{formatCordobas(order.total, currency)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="whatsapp" className="min-h-12 h-auto w-full whitespace-normal py-3 text-sm sm:text-base" asChild>
          <a href={order.whatsappUrl} target="_blank" rel="noopener noreferrer">
            <WhatsappIcon className="size-4" />
            Abrir WhatsApp con el pedido
          </a>
        </Button>
        <Button variant="outline" className="h-12 w-full" asChild>
          <Link to={`/pedido/${order.id}`} onClick={onDone}>
            <HugeIcon icon={PackageIcon} size={18} strokeWidth={2} aria-hidden />
            Seguir mi pedido
          </Link>
        </Button>
        <Button variant="ghost" className="h-11 w-full" onClick={onDone}>
          Seguir comprando
        </Button>
      </div>
    </div>
  );
}
