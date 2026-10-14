import { FormSection, FormPanel, FormBody, FormActions } from '~/components/ui/form-layout';
import { HugeIcon } from '~/components/ui/icon';
import {
  Add01Icon,
  Alert02Icon,
  Delete01Icon,
  Coupon01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
import { DatePicker, toYmd, toLocalNoonIso } from '~/components/ui/date-picker';
import { Input } from '~/components/ui/input';
import { Combobox } from '~/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { errMsg, formatCordobas } from '~/lib/formatters';
import { useGetSellableProductsQuery, type SellableProduct } from '~/state/api/sales-api';
import {
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useGetInvoiceSellersQuery,
  type Invoice,
} from '~/state/api/invoices-api';
import {
  useValidateDiscountCodeMutation,
  type DiscountCodeValidation,
} from '~/state/api/discount-codes-api';
import { Spinner } from '~/components/ui/spinner';
import { Field, FieldLabel } from '~/components/ui/field';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/lib/utils';

const METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
] as const;

interface InvoiceLine {
  uid: string;
  productName: string;
  quantity: number | '';
  unitPrice: number | '';
}

export function InvoiceEditor({
  onCreated,
  invoice,
  onUpdated,
  onCancel,
}: {
  onCreated?: (invoiceId: string) => void;
  /** Si viene, el formulario arranca relleno y guarda en vez de crear. */
  invoice?: Invoice;
  onUpdated?: () => void;
  onCancel?: () => void;
}) {
  const { data: catalog = [] } = useGetSellableProductsQuery();
  const { data: sellers = [] } = useGetInvoiceSellersQuery();
  const [createInvoice, { isLoading: creating }] = useCreateInvoiceMutation();
  const [updateInvoice, { isLoading: updating }] = useUpdateInvoiceMutation();

  const isEdit = !!invoice;
  const [serverError, setServerError] = useState<string | null>(null);

  const [lines, setLines] = useState<InvoiceLine[]>([
    { uid: crypto.randomUUID(), productName: '', quantity: '', unitPrice: '' }
  ]);
  // Vendedor del ticket, solo al crear. Texto libre que tiene que coincidir con un vendedor real:
  // si no coincide no hay id y el botón queda bloqueado con su motivo.
  const [sellerQuery, setSellerQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('efectivo');
  const [deliveryFee, setDeliveryFee] = useState<number | ''>('');
  const [deliveryName, setDeliveryName] = useState('');
  const [includeDelivery, setIncludeDelivery] = useState(false);
  const [includeCustomer, setIncludeCustomer] = useState(false);
  // El descuento ya no es un monto que se teclea: se activa con el switch y
  // entonces se pide el CÓDIGO. Sin switch, no hay descuento.
  const [includeDiscount, setIncludeDiscount] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState<string>(() => toYmd(new Date()));
  const todayYmd = toYmd(new Date());
  const isManualDate = invoiceDate !== todayYmd;

  // Código de descuento: el preview (validate) NO consume uso; el canje real lo
  // hace el servidor al crear la factura. El monto acá es solo informativo.
  const [validateCode, { isLoading: validatingCode }] = useValidateDiscountCodeMutation();
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<DiscountCodeValidation | null>(null);

  // En edición se precarga todo, también los switches: si no, el envío quedaría escondido y se perdería.
  useEffect(() => {
    if (!invoice) return;
    setLines(
      (invoice.items ?? []).map((it) => ({
        uid: crypto.randomUUID(),
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    );
    setCustomerName(invoice.customerName ?? '');
    setPhone(invoice.phone ?? '');
    setIncludeCustomer(!!(invoice.customerName || invoice.phone));
    setMethod((invoice.method as (typeof METHODS)[number]['value']) ?? 'efectivo');
    setDeliveryFee(invoice.deliveryFee || '');
    setDeliveryName(invoice.deliveryName ?? '');
    setIncludeDelivery((invoice.deliveryFee ?? 0) > 0);
    if (invoice.createdAt) {
      setInvoiceDate(toYmd(new Date(invoice.createdAt)));
    }
  }, [invoice]);

  const sellerNames = useMemo(() => sellers.map((s) => s.name), [sellers]);
  // Se colapsan los espacios internos: el HTML los colapsa al dibujar y el nombre no coincidía.
  const sellerUid = useMemo(() => {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const target = normalize(sellerQuery);
    return sellers.find((s) => normalize(s.name) === target)?.id ?? '';
  }, [sellers, sellerQuery]);

  // Se suman los productos de la factura: uno agotado desde entonces no estaría en el desplegable.
  const products = useMemo<SellableProduct[]>(() => {
    if (!invoice?.items?.length) return catalog;
    const byName = new Map(catalog.map((p) => [p.productName, p]));
    for (const it of invoice.items) {
      if (!byName.has(it.productName)) {
        byName.set(it.productName, {
          productName: it.productName,
          price: it.unitPrice,
          stock: 0,
          code: null,
          codes: [],
        });
      }
    }
    return [...byName.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }, [catalog, invoice]);
  const productNames = useMemo(() => products.map((p) => p.productName), [products]);

  const addLine = () => setLines([...lines, { uid: crypto.randomUUID(), productName: '', quantity: '', unitPrice: '' }]);
  const removeLine = (uid: string) => setLines(lines.filter(l => l.uid !== uid));

  const updateLine = (uid: string, field: keyof InvoiceLine, value: any) => {
    setLines(lines.map(l => {
      if (l.uid !== uid) return l;
      const newLine = { ...l, [field]: value };
      if (field === 'productName' && value) {
        const product = products.find(p => p.productName === value);
        if (product && newLine.unitPrice === '') {
          newLine.unitPrice = product.price;
        }
      }
      return newLine;
    }));
  };

  // `Number.isFinite`: `parseInt('-')` es NaN, que es number, y el total salía NaN.
  const validLines = lines.filter(
    (l) =>
      l.productName &&
      Number.isFinite(Number(l.quantity)) &&
      Number(l.quantity) > 0 &&
      Number.isFinite(Number(l.unitPrice)) &&
      Number(l.unitPrice) >= 0,
  );
  const subtotal = validLines.reduce((acc, l) => acc + Number(l.quantity) * Number(l.unitPrice), 0);
  const effectiveDeliveryFee = includeDelivery ? (Number(deliveryFee) || 0) : 0;
  // Solo cuenta el código, y solo si el switch está encendido.
  const codeDiscount =
    includeDiscount && appliedCode
      ? appliedCode.type === 'percent'
        ? subtotal * (appliedCode.value / 100)
        : Math.min(appliedCode.value, subtotal)
      : 0;
  const totalDiscount = Math.min(codeDiscount, subtotal);
  const total = Math.max(0, subtotal - totalDiscount + effectiveDeliveryFee);

  // Una sola razón visible a la vez: el botón deshabilitado siempre explica por qué.
  const disabledReason =
    products.length === 0
      ? 'No hay productos con stock disponible en bodega.'
      : validLines.length === 0
        ? 'Agregá al menos un producto con cantidad y precio.'
        : !isEdit && !sellerUid
          ? sellerQuery.trim()
            ? 'Ese vendedor no coincide con ninguno registrado. Elegilo de la lista.'
            : 'Elegí a qué vendedor pertenece esta factura.'
          : includeDiscount && !appliedCode
            ? 'Aplicá el código de descuento o apagá el switch.'
            : null;

  async function handleUpdate() {
    setServerError(null);
    if (disabledReason || !invoice) return;
    try {
      await updateInvoice({
        id: invoice.id,
        data: {
          customerName: includeCustomer ? customerName : '',
          phone: includeCustomer ? phone : '',
          method,
          deliveryFee: includeDelivery ? Number(deliveryFee) || 0 : 0,
          deliveryName: includeDelivery ? deliveryName : '',
          issuedAt: toLocalNoonIso(invoiceDate),
          items: validLines.map((l) => ({
            productName: l.productName,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        },
      }).unwrap();
      toast.success(`${invoice.invoiceCode} actualizada.`);
      onUpdated?.();
    } catch (err) {
      setServerError(serverErrorMessage(err, 'No se pudo actualizar la factura.'));
    }
  }

  async function applyCode() {
    const code = codeInput.trim();
    if (!code) return;
    try {
      const result = await validateCode(code).unwrap();
      setAppliedCode(result);
      toast.success(`Código ${result.code} aplicado.`);
    } catch (err) {
      setAppliedCode(null);
      toast.error(errMsg(err, 'Código inválido.'));
    }
  }

  function removeCode() {
    setAppliedCode(null);
    setCodeInput('');
  }

  const handleCreate = async () => {
    if (disabledReason) return;
    setServerError(null);

    try {
      const result = await createInvoice({
        customerName: includeCustomer ? customerName || undefined : undefined,
        phone: includeCustomer ? phone || undefined : undefined,
        method,
        deliveryFee: includeDelivery ? Number(deliveryFee) || 0 : 0,
        deliveryName: includeDelivery ? deliveryName || undefined : undefined,
        // Ya no hay descuento manual: el único descuento es el del código.
        discount: 0,
        discountCode: includeDiscount ? appliedCode?.code : undefined,
        sellerUid: sellerUid || undefined,
        issuedAt: isManualDate ? toLocalNoonIso(invoiceDate) : undefined,
        items: validLines.map(l => ({
          productName: l.productName,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice)
        }))
      }).unwrap();

      toast.success('Factura creada exitosamente.');
      onCreated?.(result.id);
    } catch (err) {
      setServerError(serverErrorMessage(err, 'No se pudo crear la factura.'));
    }
  };

  return (
    <FormPanel>
      <FormErrorBanner message={serverError} />
      <FormBody>
        <FormSection
          title="Datos del cliente"
          action={
            <>
              <Switch
                id="include-customer-invoice"
                checked={includeCustomer}
                onCheckedChange={setIncludeCustomer}
              />
            </>
          }
        >
          <div
            className={cn(
              'grid grid-cols-1 gap-4 overflow-hidden transition-all duration-300 sm:grid-cols-2',
              includeCustomer ? 'mt-3 max-h-40 opacity-100' : 'mt-0 max-h-0 opacity-0',
            )}
          >
            <Field>
              <FieldLabel htmlFor="customerName">Nombre (Opcional)</FieldLabel>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                disabled={!includeCustomer}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Teléfono (Opcional)</FieldLabel>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 8888 8888"
                disabled={!includeCustomer}
              />
            </Field>
          </div>
        </FormSection>

        {/* Solo al crear: quién factura no se reasigna después (mismo criterio
              que las líneas — si está mal, se anula y se emite otra). */}
        {!isEdit && (
          <FormSection title="Asignación">
            <Field>
              <FieldLabel htmlFor="invoice-seller" required>
                Vendedor
              </FieldLabel>
              <Combobox
                id="invoice-seller"
                value={sellerQuery}
                onChange={setSellerQuery}
                options={sellerNames}
                placeholder="Escribí para buscar al vendedor..."
                aria-invalid={!!sellerQuery && !sellerUid}
              />
            </Field>
          </FormSection>
        )}

        {/* Fecha de factura */}
        <FormSection
          title="Fecha de factura"
          action={
            isManualDate && (
              <span className="inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning border border-warning/20">
                Fecha manual
              </span>
            )
          }
        >
          <Field>
            <FieldLabel htmlFor="invoice-date">Fecha de emisión</FieldLabel>
            <DatePicker
              id="invoice-date"
              value={invoiceDate}
              onChange={(val) => setInvoiceDate(val)}
              disabled={creating || updating}
              disableFuture
              className="max-w-xs"
            />
          </Field>
        </FormSection>

        <FormSection title="Productos">
          <div className="border rounded-xl divide-y">
            {lines.map((line) => (
              <div
                key={line.uid}
                className="flex flex-col sm:flex-row gap-2 p-2 items-start sm:items-center bg-card"
              >
                <Field className="flex-1 w-full">
                  <FieldLabel htmlFor={`invoice-product-${line.uid}`} required>
                    Producto
                  </FieldLabel>
                  <Combobox
                    id={`invoice-product-${line.uid}`}
                    value={line.productName}
                    onChange={(v) => updateLine(line.uid, 'productName', v)}
                    options={productNames}
                    placeholder="Escribí para buscar un producto..."
                    emptyMessage="Sin productos con stock. Recibí una compra en Inventario."
                    renderOptionMeta={(name) => {
                      const p = products.find((pp) => pp.productName === name);
                      return p ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatCordobas(p.price)}
                        </span>
                      ) : null;
                    }}
                  />
                </Field>
                <Field className="w-full sm:w-24">
                  <FieldLabel htmlFor={`invoice-quantity-${line.uid}`} required>
                    Cantidad
                  </FieldLabel>
                  <Input
                    id={`invoice-quantity-${line.uid}`}
                    type="number"
                    min="1"
                    placeholder="Cant"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(
                        line.uid,
                        'quantity',
                        e.target.value === '' ? '' : parseInt(e.target.value, 10),
                      )
                    }
                  />
                </Field>
                <Field className="w-full sm:w-32">
                  <FieldLabel htmlFor={`invoice-price-${line.uid}`} required>
                    Precio (C$)
                  </FieldLabel>
                  <Input
                    id={`invoice-price-${line.uid}`}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Precio"
                    value={line.unitPrice}
                    onChange={(e) =>
                      updateLine(
                        line.uid,
                        'unitPrice',
                        e.target.value === '' ? '' : parseFloat(e.target.value),
                      )
                    }
                  />
                </Field>
                <div className="w-full sm:w-32 text-right text-sm font-medium">
                  {formatCordobas((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}
                </div>
                {lines.length > 1 && (
                  <Button
                    aria-label="Eliminar línea"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive"
                    onClick={() => removeLine(line.uid)}
                  >
                    <HugeIcon icon={Delete01Icon} size={18} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={addLine}>
            <HugeIcon icon={Add01Icon} size={16} className="mr-1.5" /> Agregar línea
          </Button>
        </FormSection>

        <div className="space-y-5">
          <FormSection title="Pago">
            <Field>
              <FieldLabel>Método de pago</FieldLabel>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          {/* En edición el código ya se canjeó: se conserva el monto, reaplicarlo gastaría otro uso. */}
          {isEdit && (invoice?.discount ?? 0) > 0 && (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
              <span className="font-medium text-primary">
                Descuento aplicado: {formatCordobas(invoice?.discount ?? 0)}
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                El código ya fue canjeado y no se puede cambiar. Si hay que quitarlo, cancelá la
                factura y emití una nueva.
              </p>
            </div>
          )}

          {/* ── Descuento ── Con el switch apagado no hay descuento; encendido se pide el código. */}
          {!isEdit && (
            <FormSection
              title="Descuento"
              action={
                <>
                  <Switch
                    id="include-discount-invoice"
                    checked={includeDiscount}
                    onCheckedChange={(v) => {
                      setIncludeDiscount(v);
                      // Apagar el switch descarta el código: si no, seguiría contando
                      // en el total con la sección colapsada y sin forma de verlo.
                      if (!v) removeCode();
                    }}
                  />
                </>
              }
            >
              <Field
                className={cn(
                  'overflow-hidden transition-all duration-300 motion-reduce:transition-none',
                  includeDiscount ? 'mt-2 max-h-40 opacity-100' : 'mt-0 max-h-0 opacity-0',
                )}
              >
                <FieldLabel htmlFor="discount-code">Código de descuento</FieldLabel>
                <div className="mt-1.5">
                  {appliedCode ? (
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                        <HugeIcon icon={Coupon01Icon} size={16} strokeWidth={2} aria-hidden />
                        {appliedCode.code}
                        <span className="font-normal text-muted-foreground">
                          (
                          {appliedCode.type === 'percent'
                            ? `${appliedCode.value}%`
                            : formatCordobas(appliedCode.value)}
                          )
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={removeCode}
                        className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                        title="Quitar código"
                      >
                        <HugeIcon icon={Cancel01Icon} size={14} strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        id="discount-code"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            applyCode();
                          }
                        }}
                        placeholder="Ej. GS-DC-1"
                        className="uppercase"
                        maxLength={30}
                        disabled={!includeDiscount}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={applyCode}
                        disabled={validatingCode || !codeInput.trim()}
                      >
                        {validatingCode ? 'Validando…' : 'Aplicar'}
                      </Button>
                    </div>
                  )}
                </div>
              </Field>
            </FormSection>
          )}

          <FormSection
            title="Delivery"
            action={
              <>
                <Switch
                  id="include-delivery-invoice"
                  checked={includeDelivery}
                  onCheckedChange={setIncludeDelivery}
                />
              </>
            }
          >
            <div
              className={cn(
                'grid grid-cols-1 gap-4 overflow-hidden transition-all duration-300 sm:grid-cols-2',
                includeDelivery ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0',
              )}
            >
              <Field>
                <FieldLabel htmlFor="deliveryName">Nombre del Repartidor</FieldLabel>
                <Input
                  id="deliveryName"
                  type="text"
                  value={deliveryName}
                  onChange={(e) => setDeliveryName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  disabled={!includeDelivery}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="deliveryFee">Precio (C$)</FieldLabel>
                <Input
                  id="deliveryFee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) =>
                    setDeliveryFee(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="Ej. 150"
                  disabled={!includeDelivery}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <div className="rounded-xl bg-muted p-4 flex flex-col items-end space-y-1">
          <div className="text-sm text-muted-foreground flex justify-between w-full max-w-xs">
            <span>Subtotal:</span>
            <span>{formatCordobas(subtotal)}</span>
          </div>
          {codeDiscount > 0 && (
            <div className="text-sm text-primary flex justify-between w-full max-w-xs">
              <span>Código {appliedCode?.code}:</span>
              <span>-{formatCordobas(codeDiscount)}</span>
            </div>
          )}
          {effectiveDeliveryFee > 0 && (
            <div className="text-sm text-muted-foreground flex justify-between w-full max-w-xs">
              <span>Envío:</span>
              <span>{formatCordobas(effectiveDeliveryFee)}</span>
            </div>
          )}
          <div className="text-xl font-bold text-foreground flex justify-between w-full max-w-xs border-t pt-2 mt-2">
            <span>Total:</span>
            <span>{formatCordobas(total)}</span>
          </div>
        </div>

        {disabledReason && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <HugeIcon icon={Alert02Icon} size={14} strokeWidth={2} className="shrink-0" aria-hidden />
            {disabledReason}
          </p>
        )}
      </FormBody>
      <FormActions>
        {onCancel && (
          <Button type="button" variant="cancel" onClick={onCancel} disabled={creating || updating}>
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          onClick={isEdit ? handleUpdate : handleCreate}
          disabled={creating || updating || !!disabledReason}
        >
          {(creating || updating) && <Spinner className="mr-2" />}
          {creating || updating
            ? 'Guardando…'
            : isEdit
            ? 'Guardar cambios'
            : 'Crear e imprimir factura'}
        </Button>
      </FormActions>
    </FormPanel>
  );
}
