import { FormSection, FormPanel, FormBody, FormActions } from '~/components/ui/form-layout';
// Editor de venta: el vendedor arma N líneas y ve la cotización EN VIVO
// (comisión, y para admin el desglose de costos). Portado de `SaleEditor` de v1.
//
// Lo que NO se porta, por decisiones ya tomadas en v2 (ver la cabecera de
// server/services/sales.ts): foto de recibo, admin registrando a nombre de otro
// vendedor, fecha de venta manual, inventario migrado (modos M1/M2) y cuotas.
import { HugeIcon } from '~/components/ui/icon';
import { Alert02Icon, CheckmarkCircle01Icon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import React from 'react';

import { Button } from '~/components/ui/button';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
import { DatePicker, toYmd, toLocalNoonIso } from '~/components/ui/date-picker';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { errMsg, formatCordobas } from '~/lib/formatters';
import {
  useGetSellableProductsQuery,
  useQuoteSaleMutation,
  useRegisterSaleMutation,
  useUpdateSaleMutation,
  type QuoteResult,
  type SaleLineInput,
  type SaleWithItems,
  type SellableProduct,
} from '~/store/api/salesApi';

import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin, selectIsGlobalAdmin } from '~/store/slices/authSlice';
import { useGetUsersQuery } from '~/store/api/usersApi';
import { useLazyLookupInvoiceQuery, type Invoice } from '~/store/api/invoicesApi';

import { SaleLinesTable, newEditorLine, type EditorLine } from './SaleLinesTable';
import { QuoteSummary } from './QuoteSummary';

export function SaleEditor({
  sale,
  onDone,
  onCancel,
}: {
  /** Venta a editar. Sin esto, el editor registra una venta nueva. */
  sale?: SaleWithItems | null;
  onDone?: () => void;
  onCancel?: () => void;
} = {}) {
  const isEdit = !!sale;
  const isAdmin = useAppSelector(selectIsAdmin);

  // `getUsers` responde el array directo (`UserProfile[]`), no `{ data }`.
  const { data: users = [] } = useGetUsersQuery(undefined, { skip: !isAdmin });

  const { data: products = [] } = useGetSellableProductsQuery();
  const [quoteSale, { isLoading: quoting }] = useQuoteSaleMutation();
  const [registerSale, { isLoading: registering }] = useRegisterSaleMutation();
  const [updateSale, { isLoading: updating }] = useUpdateSaleMutation();
  const [lookupInvoice, { isFetching: lookupLoading }] = useLazyLookupInvoiceQuery();

  const [lines, setLines] = useState<EditorLine[]>(() =>
    sale?.items?.length
      ? sale.items.map((it) => ({
          uid: crypto.randomUUID(),
          productName: it.productName,
          quantity: it.quantity,
          salePrice: it.salePrice,
        }))
      : [newEditorLine()],
  );

  const initialHasCustomer = !!sale?.customerName || !!sale?.phone;
  const [includeCustomer, setIncludeCustomer] = useState(initialHasCustomer);
  const [customerName, setCustomerName] = useState(sale?.customerName ?? '');
  const [phone, setPhone] = useState(sale?.phone ?? '');
  const [editReason, setEditReason] = useState('');
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const isGlobalAdmin = useAppSelector(selectIsGlobalAdmin);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  // Factura ya verificada. Su `total` manda sobre el de la cotización: incluye
  // el descuento (manual y por código) y el delivery.
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null);
  const [useInvoice, setUseInvoice] = useState(!isGlobalAdmin);

  const [isRegisteredSeller, setIsRegisteredSeller] = useState(!!sale?.sellerUid || !sale);
  const [selectedSellerId, setSelectedSellerId] = useState<string>(sale?.sellerUid || '');
  const [externalSellerName, setExternalSellerName] = useState<string>(!sale?.sellerUid && sale?.sellerEmail ? sale.sellerEmail : '');

  const [saleDate, setSaleDate] = useState<string>(() => (sale?.createdAt ? toYmd(new Date(sale.createdAt)) : toYmd(new Date())));
  const todayYmd = toYmd(new Date());
  const isManualDate = saleDate !== todayYmd;

  useEffect(() => {
    if (!sale) return;
    if (sale.createdAt) {
      setSaleDate(toYmd(new Date(sale.createdAt)));
    }
  }, [sale]);

  // En modo edición la venta YA tiene su stock reservado, así que sus productos
  // aparecerían agotados y no se podrían volver a seleccionar. Se les "devuelve"
  // esa cantidad al catálogo del editor. Sin esto, editar una venta es imposible.
  const productsForUi: SellableProduct[] = useMemo(() => {
    if (!sale?.items?.length) return products;
    const byName = new Map(products.map((p) => [p.productName, { ...p }]));
    for (const item of sale.items) {
      const existing = byName.get(item.productName);
      if (existing) existing.stock += item.quantity || 0;
      else
        // Sin código: este producto ya no está en el catálogo vendible (se
        // agotó o se borró el lote), así que se reconstruye desde la línea
        // guardada y no hay lote del cual sacarlo.
        byName.set(item.productName, {
          productName: item.productName,
          price: item.salePrice,
          stock: item.quantity || 0,
          code: null,
          codes: [],
        });
    }
    return Array.from(byName.values());
  }, [products, sale]);

  // Líneas listas para cotizar: producto elegido, cantidad y precio numéricos.
  const validLines: SaleLineInput[] = lines
    .filter(
      (l) =>
        l.productName.trim() !== '' &&
        typeof l.quantity === 'number' &&
        l.quantity > 0 &&
        typeof l.salePrice === 'number' &&
        l.salePrice > 0,
    )
    .map((l) => ({
      productName: l.productName.trim(),
      quantity: l.quantity as number,
      salePrice: l.salePrice as number,
    }));

  // El backend rechaza el mismo producto en dos líneas (evita repartir reservas).
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const l of lines) {
      const name = l.productName.trim();
      if (!name) continue;
      if (seen.has(name)) dupes.add(name);
      seen.add(name);
    }
    return dupes;
  }, [lines]);

  const hasOverStock = lines.some((l) => {
    const p = productsForUi.find((pr) => pr.productName === l.productName);
    return p && typeof l.quantity === 'number' && l.quantity > p.stock;
  });


  // Total local optimista: mientras el servidor cotiza, el botón ya muestra el
  // importe. Así la cifra no parpadea ni desaparece entre cotizaciones.
  const localTotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.salePrice) || 0),
    0,
  );

  // El importe que se COBRA. Si la venta nace de una factura manda SU total: ya
  // trae aplicados el descuento (manual y por código) y el delivery, que la
  // cotización — que solo suma líneas — no conoce.
  const displayTotal = linkedInvoice?.total ?? result?.total ?? localTotal;

  // Con una factura ya verificada, las líneas vienen COPIADAS del ticket que
  // ya se imprimió y se le dio al cliente: dejar que el vendedor las toque
  // después abriría una discrepancia entre lo que dice el papel y lo que
  // termina registrado (y cobrando de comisión). Se bloquean hasta que se
  // borre el código (lo que invalida la verificación, ver el campo de arriba).
  const linesLocked = !isEdit && useInvoice && !!linkedInvoice;

  // Caja emitió el ticket a nombre de un vendedor: la venta va a quedar a nombre
  // de ÉL, no de quien la registra (lo impone `registerSale`, que además rechaza
  // un override que lo contradiga). Se bloquea el selector para que el admin no
  // crea que está eligiendo algo que el servidor va a ignorar.
  const invoiceSeller = !isEdit && useInvoice && linkedInvoice?.sellerUid ? linkedInvoice : null;

  // UNA sola razón visible a la vez, en orden de prioridad: el botón
  // deshabilitado SIEMPRE explica por qué.
  const disabledReason =
    (!isEdit && useInvoice && !invoiceNumber)
      ? 'Falta el número de factura obligatoria.'
      : (validLines.length === 0 && !(useInvoice && invoiceNumber))
        ? 'Agrega al menos un producto con cantidad y precio.'
        : duplicateNames.size > 0
          ? 'Hay un producto repetido: juntá las unidades en una sola línea.'
          : hasOverStock
            ? 'Hay líneas que exceden el stock disponible.'
            // El margen mínimo ya no bloquea: la venta entra marcada y el admin
            // decide al aprobar (el aviso por línea lo muestra QuoteSummary).
            : isEdit && sale?.status !== 'pending_approval' && !editReason.trim()
                ? 'Escribe el motivo de la edición para habilitar el guardado.'
                : null;

  // ── Cotización en vivo ──
  // La dependencia es el JSON de las líneas VÁLIDAS, no el array: así no se
  // recotiza en cada tecla de una línea todavía incompleta.
  const linesKey = JSON.stringify(validLines);
  useEffect(() => {
    const items: SaleLineInput[] = JSON.parse(linesKey);

    if (items.length === 0) {
      setResult(null);
      setErrorMsg('');
      return;
    }
    // Cotizar con un producto repetido devuelve 400: se avisa sin llamar.
    if (new Set(items.map((i) => i.productName)).size !== items.length) {
      setResult(null);
      setErrorMsg('Hay un producto repetido: juntá las unidades en una sola línea.');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setResult(await quoteSale(items).unwrap());
        setErrorMsg('');
      } catch (err) {
        setResult(null);
        setErrorMsg(errMsg(err, 'No se pudo calcular la cotización.'));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [linesKey, quoteSale]);

  async function handleLookupInvoice() {
    // Se manda el texto tal cual: el backend acepta "GS-PR-12" o "12".
    if (!invoiceNumber.trim()) return;
    try {
      const inv = await lookupInvoice(invoiceNumber.trim()).unwrap();
      if (inv.status === 'linked') {
        toast.error('Esta factura ya está vinculada a otra venta.');
        return;
      }

      // Se precarga lo que la factura ya sabe (líneas, cliente, teléfono) y el
      // debounce de 400 ms cotiza solo al llenar las líneas.
      if (inv.items?.length) {
        // Mismo prorrateo que hace el backend en `registerSale`: el descuento de
        // la factura baja el precio efectivo de cada línea, así que la
        // cotización en vivo muestra la comisión REAL y no una inflada que
        // después no coincide con lo que se registra.
        const rawSubtotal = inv.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
        const factor =
          rawSubtotal > 0 ? Math.max(0, (rawSubtotal - (inv.discount ?? 0)) / rawSubtotal) : 1;

        setLines(
          inv.items.map((it) => ({
            uid: crypto.randomUUID(),
            productName: it.productName,
            quantity: it.quantity,
            salePrice: Math.round(it.unitPrice * factor * 100) / 100,
          })),
        );
      }
      if (inv.customerName || inv.phone) {
        setIncludeCustomer(true);
        setCustomerName(inv.customerName ?? '');
        setPhone(inv.phone ?? '');
      }
      if (inv.createdAt) {
        setSaleDate(toYmd(new Date(inv.createdAt)));
      }
      // El vendedor también se precarga desde la factura: sin esto, la venta
      // quedaba a nombre de quien está REGISTRANDO (típicamente un admin
      // verificando el ticket por otra persona), no del vendedor al que Caja
      // se la asignó al emitirla. Sin dueño asignado (ticket de mostrador) no
      // hay nada que precargar y queda el comportamiento de siempre.
      if (isAdmin && inv.sellerUid) {
        setIsRegisteredSeller(true);
        setSelectedSellerId(inv.sellerUid);
      }
      // Se guarda la factura para poder mostrar el importe REAL cobrado: la
      // cotización solo suma las líneas y no sabe del descuento.
      setLinkedInvoice(inv);

      toast.success(
        inv.items?.length
          ? `Factura ${inv.invoiceCode}: ${inv.items.length} producto(s) cargados.`
          : `Factura ${inv.invoiceCode} encontrada (sin líneas registradas).`,
      );
    } catch (err) {
      toast.error(errMsg(err, 'Factura no encontrada.'));
    }
  }

  function resetEditor() {
    setLines([newEditorLine()]);
    setIncludeCustomer(false);
    setCustomerName('');
    setPhone('');
    setIsRegisteredSeller(true);
    setSelectedSellerId('');
    setExternalSellerName('');
    setInvoiceNumber('');
    setSaleDate(toYmd(new Date()));
    setResult(null);
    setErrorMsg('');
  }

  async function handleSubmit() {
    setServerError(null);
    if (disabledReason) return;

    try {
      // Con una factura ya asignada no se manda override: el vendedor lo pone la
      // factura y el servidor rechaza cualquier otro (ver `registerSale`).
      const overridePayload = isAdmin && !invoiceSeller ? {
        // "none" es el valor centinela de la opción "Usuario actual": mandarlo
        // tal cual hacía fallar el zod del backend (espera un uuid) con un
        // "Invalid input" que no decía nada. Vacío = sin override.
        overrideSellerId: isRegisteredSeller && selectedSellerId !== 'none' ? selectedSellerId || undefined : undefined,
        overrideSellerName: !isRegisteredSeller ? externalSellerName.trim() || undefined : undefined,
      } : {};

      if (isEdit && sale) {
        await updateSale({
          id: sale.id,
          customerName: includeCustomer ? customerName.trim() || undefined : '',
          phone: includeCustomer ? phone.trim() || undefined : '',
          items: validLines,
          // Solo si se cambió la fecha: mandarla siempre le reescribía la hora
          // a mediodía a cada venta editada.
          soldAt:
            sale.createdAt && saleDate === toYmd(new Date(sale.createdAt))
              ? undefined
              : toLocalNoonIso(saleDate),
          reason: editReason.trim() || undefined,
          ...overridePayload
        }).unwrap();
        toast.success('Venta actualizada.', {
          icon: React.createElement(HugeIcon, { icon: CheckmarkCircle01Icon, size: 18 }),
        });
        onDone?.();
        return;
      }

      await registerSale({
        customerName: includeCustomer ? customerName.trim() || undefined : undefined,
        phone: includeCustomer ? phone.trim() || undefined : undefined,
        items: validLines,
        // El código va como TEXTO ("GS-PR-12"). Con `Number()` se volvía NaN y
        // el backend lo rechazaba con "Invalid input".
        invoiceNumber: useInvoice ? invoiceNumber.trim() || undefined : undefined,
        soldAt: isManualDate ? toLocalNoonIso(saleDate) : undefined,
        ...overridePayload
      }).unwrap();
      toast.success('Venta registrada. Pendiente de aprobación.', {
        icon: React.createElement(HugeIcon, { icon: CheckmarkCircle01Icon, size: 18 }),
      });
      resetEditor();
      onDone?.();
    } catch (err) {
      setServerError(serverErrorMessage(err, isEdit ? 'No se pudo actualizar la venta.' : 'No se pudo registrar la venta.'));
    }
  }

  const busy = registering || updating;

  return (
    <FormPanel>
      <FormErrorBanner message={serverError} />
      <FormBody>
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          {/* ── Columna izquierda: datos + productos ── */}
          <div className="space-y-4">
            <FormSection
              title="Datos del cliente"
              action={
                <>
                  <Switch
                    id="include-customer"
                    checked={includeCustomer}
                    onCheckedChange={setIncludeCustomer}
                    disabled={busy}
                    aria-label="Incluir información del cliente"
                  />
                </>
              }
            >
              {includeCustomer && (
                <div className="grid gap-4 pt-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="sale-customer-name">Nombre</FieldLabel>
                    <Input
                      id="sale-customer-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Juan Pérez"
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sale-phone">Teléfono</FieldLabel>
                    <Input
                      id="sale-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="8888 8888"
                      disabled={busy}
                    />
                  </Field>
                </div>
              )}
            </FormSection>

            {!isEdit && (
              <FormSection
                title="Factura (Ticket)"
                action={
                  <>
                    {isGlobalAdmin && (
                      <Switch
                        id="use-invoice"
                        checked={useInvoice}
                        onCheckedChange={setUseInvoice}
                        disabled={busy}
                      />
                    )}
                  </>
                }
              >
                {useInvoice && (
                  <div className="pt-2">
                    <Field>
                      <FieldLabel htmlFor="invoice-number">Código de Factura del Ticket</FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          id="invoice-number"
                          value={invoiceNumber}
                          onChange={(e) => {
                            setInvoiceNumber(e.target.value.toUpperCase());
                            // Tocar el código invalida la verificación anterior:
                            // sin esto, las líneas quedarían "bloqueadas" mostrando
                            // los productos de OTRA factura mientras el campo ya
                            // dice un código distinto.
                            setLinkedInvoice(null);
                          }}
                          placeholder="Ej. GS-PR-12"
                          disabled={busy}
                          className="max-w-[200px] uppercase"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLookupInvoice}
                          disabled={!invoiceNumber || lookupLoading}
                        >
                          {lookupLoading ? <Spinner /> : 'Verificar'}
                        </Button>
                      </div>
                      <FieldDescription>
                        Registrar esta venta enlazará la factura al sistema de inventario
                        automáticamente. No es necesario añadir los productos abajo si la factura ya
                        los tiene (el sistema los copiará de la factura).
                      </FieldDescription>
                    </Field>
                  </div>
                )}
              </FormSection>
            )}

            {isAdmin && (
              <FormSection
                title="Asignar vendedor"
                action={
                  <>
                    {!invoiceSeller && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground select-none">
                          Registrado en el sistema
                        </span>
                        <Switch
                          id="is-registered-seller"
                          checked={isRegisteredSeller}
                          onCheckedChange={setIsRegisteredSeller}
                          disabled={busy}
                          aria-label="Vendedor registrado en el sistema"
                        />
                      </div>
                    )}
                  </>
                }
              >
                {invoiceSeller ? (
                  <p className="flex items-start gap-1.5 rounded-xl border border-primary-2/30 bg-primary-2/10 px-3 py-2 text-xs text-primary-2">
                    <HugeIcon
                      icon={Alert02Icon}
                      size={14}
                      strokeWidth={2}
                      className="mt-px shrink-0"
                      aria-hidden
                    />
                    <span>
                      Esta venta queda a nombre de{' '}
                      <strong className="font-semibold">
                        {invoiceSeller.sellerName ?? 'el vendedor de la factura'}
                      </strong>
                      , que es a quien Caja le emitió la factura {invoiceSeller.invoiceCode} — no de
                      quien la registra. Si el ticket quedó mal asignado, registrá la venta y corregí
                      el vendedor editándola.
                    </span>
                  </p>
                ) : (
                  <div className="pt-3">
                    {isRegisteredSeller ? (
                      <Field>
                        <FieldLabel htmlFor="sale-seller-id" className="sr-only">
                          Seleccionar vendedor
                        </FieldLabel>
                        <Select
                          value={selectedSellerId}
                          onValueChange={setSelectedSellerId}
                          disabled={busy}
                        >
                          <SelectTrigger id="sale-seller-id">
                            <SelectValue placeholder="Usuario actual (por defecto)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Usuario actual (por defecto)</SelectItem>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ) : (
                      <Field>
                        <FieldLabel htmlFor="sale-external-seller" className="sr-only">
                          Nombre del vendedor
                        </FieldLabel>
                        <Input
                          id="sale-external-seller"
                          value={externalSellerName}
                          onChange={(e) => setExternalSellerName(e.target.value)}
                          placeholder="Nombre del vendedor esporádico..."
                          disabled={busy}
                        />
                      </Field>
                    )}
                  </div>
                )}
              </FormSection>
            )}

            {/* Fecha de venta */}
            <FormSection
              title="Fecha de venta"
              action={
                <>
                  {isManualDate && (
                    <span className="inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning border border-warning/20">
                      Fecha manual
                    </span>
                  )}
                </>
              }
            >
              <div className="pt-1">
                <DatePicker
                  id="sale-date"
                  value={saleDate}
                  onChange={(val) => setSaleDate(val)}
                  disabled={busy}
                  disableFuture
                  className="max-w-xs"
                />
              </div>
            </FormSection>

            <FormSection
              title="Productos"
              action={
                <>
                  <span className="nums ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {lines.length}
                  </span>
                </>
              }
            >
              {linesLocked && (
                <p className="flex items-start gap-1.5 rounded-xl border border-primary-2/30 bg-primary-2/10 px-3 py-2 text-xs text-primary-2">
                  <HugeIcon
                    icon={Alert02Icon}
                    size={14}
                    strokeWidth={2}
                    className="mt-px shrink-0"
                    aria-hidden
                  />
                  Estos productos vienen de la factura {linkedInvoice?.invoiceCode} ya verificada — no
                  se pueden editar acá (evita que la venta quede distinta de lo que dice el ticket).
                  Para cambiarlos, corregí la factura en Facturación o borrá el código de arriba.
                </p>
              )}

              <SaleLinesTable
                lines={lines}
                products={productsForUi}
                duplicateNames={duplicateNames}
                onChange={setLines}
                onAddLine={linesLocked ? undefined : () => setLines((ls) => [...ls, newEditorLine()])}
                disabled={busy || linesLocked}
              />
            </FormSection>
          </div>

          {/* ── Columna derecha: resumen sticky + acciones ── */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <QuoteSummary
              result={result}
              loading={quoting}
              errorMsg={errorMsg}
              invoice={linkedInvoice}
            />

            {isEdit && sale?.status !== 'pending_approval' && (
              <Field className="rounded-2xl border bg-card p-4" data-invalid={!editReason.trim()}>
                <FieldLabel htmlFor="edit-reason" required>
                  Motivo de la edición
                </FieldLabel>
                <Textarea
                  id="edit-reason"
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Explicá por qué se edita esta venta ya procesada…"
                  aria-required
                  aria-invalid={!editReason.trim()}
                  disabled={busy}
                />
                <FieldError>
                  {!editReason.trim() ? 'El backend rechaza la edición sin motivo.' : undefined}
                </FieldError>
              </Field>
            )}

            {disabledReason && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <HugeIcon
                  icon={Alert02Icon}
                  size={14}
                  strokeWidth={2}
                  className="mt-px shrink-0"
                  aria-hidden
                />
                {disabledReason}
              </p>
            )}
          </div>
        </div>
      </FormBody>
      <FormActions>
        {onCancel && (
          <Button type="button" variant="cancel" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !!disabledReason || !!errorMsg}
        >
          {busy && <Spinner className="mr-2" />}
          {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar venta'} ·{' '}
          <span className="tabular-nums">{formatCordobas(displayTotal)}</span>
        </Button>
      </FormActions>
    </FormPanel>
  );
}
