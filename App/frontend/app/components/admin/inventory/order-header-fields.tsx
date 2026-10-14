// Encabezado de una orden: número, fecha, impuesto, proveedor, factura y fotos. Si el número coincide con
// una orden existente, los productos se agregan a esa. Una factura puede cubrir varias órdenes.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { DatePicker } from "~/components/ui/date-picker";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { MoneyInput } from "~/components/ui/money-input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { ImageUploader } from "~/components/editor/image-uploader";
import { formatLongDate, formatUsd } from "~/lib/formatters";
import { processPendingUploads, uploadOne } from "~/lib/upload-queue";
import {
  useUpdatePurchaseInvoiceMutation,
  type PurchaseInvoice,
  type PurchaseInvoicePayload,
  type PurchaseOrder,
  type PurchaseOrderHeaderPayload,
  type Supplier,
} from "~/state/api/inventory-api";

const NEW_SUPPLIER = "__new__";
const NEW_INVOICE = "__new__";

/** Factura que se está cargando o corrigiendo. */
export interface InvoiceDraft {
  number: string;
  fileUrl: string | null;
  totalUsd: string;
}

const emptyInvoiceDraft = (): InvoiceDraft => ({ number: "", fileUrl: null, totalUsd: "" });

function validateInvoiceDraft(draft: InvoiceDraft): string | null {
  const total = draft.totalUsd.trim();
  if (total !== "" && !(Number(total) >= 0)) return "Revisá el total de la factura.";
  if (!draft.fileUrl && total === "" && !draft.number.trim()) return "Subí la factura o escribí su total.";
  return null;
}

function invoicePayload(draft: InvoiceDraft): PurchaseInvoicePayload {
  const total = draft.totalUsd.trim();
  return { invoiceNumber: draft.number.trim(), fileUrl: draft.fileUrl, totalUsd: total === "" ? null : Number(total) };
}

/** Las facturas ya cargadas (cada una una vez), la más nueva primero. */
export function invoicesFromOrders(orders: PurchaseOrder[]): PurchaseInvoice[] {
  const byId = new Map<string, PurchaseInvoice>();
  for (const order of orders) if (order.invoice) byId.set(order.invoice.id, order.invoice);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const shortNumber = (n: string) => (n.length > 10 ? `…${n.slice(-6)}` : n);

function invoiceLabel(invoice: PurchaseInvoice): string {
  const name = invoice.invoiceNumber ? `Factura ${invoice.invoiceNumber}` : `Factura del ${formatLongDate(invoice.createdAt)}`;
  const total = invoice.totalUsd != null ? ` · ${formatUsd(invoice.totalUsd)}` : "";
  const orders =
    invoice.orders.length === 1 ? ` · orden ${shortNumber(invoice.orders[0].orderNumber)}` : ` · ${invoice.orders.length} órdenes`;
  return name + total + orders;
}

export interface OrderHeaderState {
  orderNumber: string;
  purchaseDate: string;
  /** Impuesto por unidad (USD), el mismo para todos los productos de la orden. */
  taxUnit: string;
  /** id de un proveedor guardado, NEW_SUPPLIER o "" (sin proveedor). */
  supplierChoice: string;
  newSupplier: { name: string; contact: string; storeUrl: string };
  /** id de una factura ya cargada, NEW_INVOICE o "" (sin factura todavía). */
  invoiceChoice: string;
  newInvoice: InvoiceDraft;
  packagePhotos: string[];
  notes: string;
}

export type OrderHeaderErrors = Partial<Record<"orderNumber" | "purchaseDate" | "taxUnit" | "supplier" | "invoice", string>>;

export function emptyOrderHeader(): OrderHeaderState {
  return {
    orderNumber: "",
    purchaseDate: "",
    taxUnit: "",
    supplierChoice: "",
    newSupplier: { name: "", contact: "", storeUrl: "" },
    invoiceChoice: "",
    newInvoice: emptyInvoiceDraft(),
    packagePhotos: [],
    notes: "",
  };
}

export function orderHeaderFrom(order: PurchaseOrder): OrderHeaderState {
  return {
    orderNumber: order.orderNumber,
    purchaseDate: order.purchaseDate,
    taxUnit: order.taxUnit == null ? "" : String(order.taxUnit),
    supplierChoice: order.supplier?.id ?? "",
    newSupplier: { name: "", contact: "", storeUrl: "" },
    invoiceChoice: order.invoice?.id ?? "",
    newInvoice: emptyInvoiceDraft(),
    packagePhotos: order.packagePhotos,
    notes: order.notes,
  };
}

export function validateOrderHeader(state: OrderHeaderState, { requireSupplier }: { requireSupplier: boolean }): OrderHeaderErrors {
  const errors: OrderHeaderErrors = {};
  if (state.orderNumber.trim().length < 3) errors.orderNumber = "Escribí el número de orden de Alibaba.";
  if (!state.purchaseDate) errors.purchaseDate = "Elegí la fecha de compra.";
  const tax = state.taxUnit.trim();
  if (tax !== "" && !(Number(tax) >= 0)) errors.taxUnit = "Revisá el impuesto: un número desde 0.";
  if (state.supplierChoice === NEW_SUPPLIER && !state.newSupplier.name.trim()) {
    errors.supplier = "Escribí el nombre del proveedor.";
  } else if (requireSupplier && !state.supplierChoice) {
    errors.supplier = "Elegí el proveedor o cargá uno nuevo.";
  }
  if (state.invoiceChoice === NEW_INVOICE) {
    const invoiceError = validateInvoiceDraft(state.newInvoice);
    if (invoiceError) errors.invoice = invoiceError;
  }
  return errors;
}

/** Arma el payload y sube las fotos nuevas del empaque. */
export async function orderHeaderPayload(state: OrderHeaderState): Promise<PurchaseOrderHeaderPayload> {
  const packagePhotos = await processPendingUploads(state.packagePhotos, "empaques-compras");
  const supplier =
    state.supplierChoice === NEW_SUPPLIER
      ? {
          newSupplier: {
            name: state.newSupplier.name.trim(),
            contact: state.newSupplier.contact.trim(),
            storeUrl: state.newSupplier.storeUrl.trim(),
          },
        }
      : { supplierId: state.supplierChoice || null };
  const tax = state.taxUnit.trim();
  return {
    orderNumber: state.orderNumber.trim(),
    purchaseDate: state.purchaseDate,
    ...(tax === "" ? {} : { taxUnit: Number(tax) }),
    ...supplier,
    ...(state.invoiceChoice === NEW_INVOICE
      ? { newInvoice: invoicePayload(state.newInvoice) }
      : { invoiceId: state.invoiceChoice || null }),
    packagePhotos,
    notes: state.notes.trim(),
  };
}

/** Mientras se cargan productos es normal que la suma no llegue al total; solo pasarse es raro. */
export function invoiceGapText(invoiceTotal: number | null, linesTotal: number): { text: string; over: boolean } | null {
  if (invoiceTotal == null || linesTotal <= 0) return null;
  const diff = invoiceTotal - linesTotal;
  if (Math.abs(diff) <= 0.01) return { text: "La suma de los productos cuadra con la factura.", over: false };
  if (diff > 0) return { text: `Faltan ${formatUsd(diff)} de la factura por cargar.`, over: false };
  return { text: `Los productos suman ${formatUsd(linesTotal)}: ${formatUsd(-diff)} más que la factura.`, over: true };
}

export function OrderHeaderFields({
  value,
  onChange,
  errors,
  suppliers,
  allowNoSupplier = false,
  numberProvisional = false,
  linesTotalUsd,
  orderOptions,
  existingOrder = null,
  existingSlot,
  invoices = [],
  currentInvoiceId = null,
  taxHelp = "El mismo para todos los productos de la orden. Vacío = sin impuesto.",
}: {
  value: OrderHeaderState;
  onChange: (patch: Partial<OrderHeaderState>) => void;
  errors: OrderHeaderErrors;
  suppliers: Supplier[];
  /** En la edición se puede dejar sin proveedor (las órdenes viejas no tienen). */
  allowNoSupplier?: boolean;
  /** Orden vieja con el nombre del lote como número. */
  numberProvisional?: boolean;
  /** Suma de las líneas, para avisar si la factura no cuadra. */
  linesTotalUsd?: number;
  /** Órdenes ya registradas: el número las sugiere (Registrar compra). */
  orderOptions?: PurchaseOrder[];
  /** El número escrito es el de esta orden ya registrada. */
  existingOrder?: PurchaseOrder | null;
  /** Lo que se muestra en lugar del resto del encabezado con `existingOrder`. */
  existingSlot?: ReactNode;
  /** Facturas ya cargadas, para elegir la misma en varias órdenes. */
  invoices?: PurchaseInvoice[];
  /** La factura que la orden ya tiene (edición): su suma ya cuenta esta orden. */
  currentInvoiceId?: string | null;
  /** Ayuda del impuesto: en la edición avisa que cambiarlo recalcula lo recibido. */
  taxHelp?: string;
}) {
  const optionsByNumber = useMemo(
    () => new Map((orderOptions ?? []).map((o) => [o.orderNumber, o])),
    [orderOptions],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!errors.orderNumber}>
          <FieldLabel htmlFor="order-number" required>
            Número de orden de Alibaba
          </FieldLabel>
          {orderOptions ? (
            <Combobox
              id="order-number"
              value={value.orderNumber}
              onChange={(orderNumber) => onChange({ orderNumber: orderNumber.slice(0, 40) })}
              options={[...optionsByNumber.keys()]}
              placeholder="Escribí el número o elegí una orden ya registrada"
              // Escribir el nombre del proveedor también encuentra sus órdenes.
              getSearchText={(n) => optionsByNumber.get(n)?.supplier?.name ?? ""}
              renderOptionMeta={(n) => {
                const order = optionsByNumber.get(n);
                if (!order) return null;
                return (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {order.supplier ? `${order.supplier.name} · ` : ""}
                    {order.lineCount} {order.lineCount === 1 ? "producto" : "productos"}
                  </span>
                );
              }}
              aria-invalid={!!errors.orderNumber}
            />
          ) : (
            <Input
              id="order-number"
              value={value.orderNumber}
              onChange={(e) => onChange({ orderNumber: e.target.value })}
              placeholder="Ej. 2829471055501020155"
              className="font-spec"
              maxLength={40}
              aria-invalid={!!errors.orderNumber}
            />
          )}
          {numberProvisional && !errors.orderNumber && (
            <FieldDescription className="text-warning">
              Es el nombre del lote viejo. Reemplazalo por el número de Alibaba si lo tenés.
            </FieldDescription>
          )}
          {orderOptions && !existingOrder && !errors.orderNumber && (
            <FieldDescription>Si la orden ya está registrada, elegila y el producto se agrega a ella.</FieldDescription>
          )}
          <FieldError errors={[errors.orderNumber ? { message: errors.orderNumber } : undefined]} />
        </Field>
        {existingOrder ? (
          <Field>
            <FieldLabel>Fecha de compra</FieldLabel>
            <p className="flex h-11 items-center text-sm text-foreground">{formatLongDate(existingOrder.purchaseDate)}</p>
          </Field>
        ) : (
          <Field data-invalid={!!errors.purchaseDate}>
            <FieldLabel htmlFor="order-date" required>
              Fecha de compra
            </FieldLabel>
            <DatePicker id="order-date" value={value.purchaseDate} onChange={(d) => onChange({ purchaseDate: d })} />
            <FieldError errors={[errors.purchaseDate ? { message: errors.purchaseDate } : undefined]} />
          </Field>
        )}
      </div>

      {existingOrder && existingOrder.lineCount > 0 ? (
        <Field>
          <FieldLabel>Impuesto por unidad</FieldLabel>
          <p className="flex h-11 items-center text-sm text-foreground">
            {existingOrder.taxUnit == null ? "Distinto en cada producto" : formatUsd(existingOrder.taxUnit, 4)}
          </p>
          <FieldDescription>
            {existingOrder.taxUnit == null
              ? "Lo que agregues va sin impuesto hasta que lo unifiques en «Editar orden»."
              : "El de la orden. Se cambia desde «Editar orden»."}
          </FieldDescription>
        </Field>
      ) : (
        <Field data-invalid={!!errors.taxUnit} className="sm:max-w-xs">
          <FieldLabel htmlFor="order-tax">Impuesto por unidad</FieldLabel>
          <MoneyInput id="order-tax" value={value.taxUnit} onChange={(taxUnit) => onChange({ taxUnit })} invalid={!!errors.taxUnit} placeholder="0" />
          <FieldDescription>{taxHelp}</FieldDescription>
          <FieldError errors={[errors.taxUnit ? { message: errors.taxUnit } : undefined]} />
        </Field>
      )}

      {existingOrder ? (
        existingSlot
      ) : (
        <>
          <SupplierField value={value} onChange={onChange} error={errors.supplier} suppliers={suppliers} allowNone={allowNoSupplier} />

          <InvoiceSection
            value={value}
            onChange={onChange}
            error={errors.invoice}
            invoices={invoices}
            linesTotalUsd={linesTotalUsd ?? 0}
            currentInvoiceId={currentInvoiceId}
          />

          <Field>
            <FieldLabel>Fotos del empaque</FieldLabel>
            <FieldDescription>Las que le pasás al agente en Nicaragua para reconocer los paquetes.</FieldDescription>
            <ImageUploader images={value.packagePhotos} onChange={(packagePhotos) => onChange({ packagePhotos })} />
          </Field>

          <Field>
            <FieldLabel htmlFor="order-notes">Notas</FieldLabel>
            <Textarea
              id="order-notes"
              rows={2}
              value={value.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Opcional"
            />
          </Field>
        </>
      )}
    </div>
  );
}

function SupplierField({
  value,
  onChange,
  error,
  suppliers,
  allowNone,
}: {
  value: OrderHeaderState;
  onChange: (patch: Partial<OrderHeaderState>) => void;
  error?: string;
  suppliers: Supplier[];
  allowNone: boolean;
}) {
  const isNew = value.supplierChoice === NEW_SUPPLIER;
  const chosen = suppliers.find((s) => s.id === value.supplierChoice) ?? null;
  const setNew = (patch: Partial<OrderHeaderState["newSupplier"]>) =>
    onChange({ newSupplier: { ...value.newSupplier, ...patch } });

  return (
    <div className="space-y-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="order-supplier" required={!allowNone}>
          Proveedor
        </FieldLabel>
        <NativeSelect
          id="order-supplier"
          className="w-full"
          value={value.supplierChoice}
          onChange={(e) => onChange({ supplierChoice: e.target.value })}
          aria-invalid={!!error}
        >
          <NativeSelectOption value="" disabled={!allowNone}>
            {allowNone ? "Sin proveedor" : "Elegí el proveedor"}
          </NativeSelectOption>
          {suppliers.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={NEW_SUPPLIER}>+ Proveedor nuevo</NativeSelectOption>
        </NativeSelect>
        {chosen && (chosen.contact || chosen.storeUrl) && (
          <FieldDescription>
            {chosen.contact}
            {chosen.contact && chosen.storeUrl && " · "}
            {chosen.storeUrl && (
              <a href={chosen.storeUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Tienda
              </a>
            )}
          </FieldDescription>
        )}
        <FieldError errors={[error ? { message: error } : undefined]} />
      </Field>

      {isNew && (
        <div className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="supplier-name" required>
              Nombre
            </FieldLabel>
            <Input id="supplier-name" value={value.newSupplier.name} onChange={(e) => setNew({ name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-contact">Contacto</FieldLabel>
            <Input
              id="supplier-contact"
              value={value.newSupplier.contact}
              onChange={(e) => setNew({ contact: e.target.value })}
              placeholder="WhatsApp, WeChat o correo"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-store">Link de la tienda</FieldLabel>
            <Input
              id="supplier-store"
              type="url"
              value={value.newSupplier.storeUrl}
              onChange={(e) => setNew({ storeUrl: e.target.value })}
              placeholder="https://…alibaba.com"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Factura ──

function InvoiceSection({
  value,
  onChange,
  error,
  invoices,
  linesTotalUsd,
  currentInvoiceId,
}: {
  value: OrderHeaderState;
  onChange: (patch: Partial<OrderHeaderState>) => void;
  error?: string;
  invoices: PurchaseInvoice[];
  linesTotalUsd: number;
  currentInvoiceId: string | null;
}) {
  const choice = value.invoiceChoice;
  const chosen = invoices.find((i) => i.id === choice) ?? null;
  const draft = value.newInvoice;
  // El archivo se sube en segundo plano: al terminar, se suma a lo escrito mientras tanto.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  // Lo de esta orden que la factura elegida todavía no suma.
  const extra = chosen && chosen.id === currentInvoiceId ? 0 : linesTotalUsd;
  const draftTotal = draft.totalUsd.trim() === "" ? null : Number(draft.totalUsd);
  const typedNumber = draft.number.trim().toLowerCase();
  const sameNumber =
    choice === NEW_INVOICE && typedNumber
      ? invoices.find((i) => i.invoiceNumber.trim().toLowerCase() === typedNumber) ?? null
      : null;

  return (
    <div className="space-y-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="order-invoice">Factura</FieldLabel>
        <NativeSelect
          id="order-invoice"
          className="w-full"
          value={choice}
          onChange={(e) => onChange({ invoiceChoice: e.target.value })}
          aria-invalid={!!error}
        >
          <NativeSelectOption value="">Sin factura todavía</NativeSelectOption>
          {invoices.map((invoice) => (
            <NativeSelectOption key={invoice.id} value={invoice.id}>
              {invoiceLabel(invoice)}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={NEW_INVOICE}>+ Factura nueva</NativeSelectOption>
        </NativeSelect>
        <FieldDescription>
          Si Alibaba partió la compra en varias órdenes con una sola factura, subila en la primera y en las demás elegila de
          la lista.
        </FieldDescription>
        <FieldError errors={[error ? { message: error } : undefined]} />
      </Field>

      {chosen && <ChosenInvoice invoice={chosen} gap={invoiceGapText(chosen.totalUsd, chosen.linesTotalUsd + extra)} />}

      {choice === NEW_INVOICE && (
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <InvoiceDraftFields
            idPrefix="new-invoice"
            draft={draft}
            onChange={(patch) => onChange({ newInvoice: { ...latestDraft.current, ...patch } })}
            gap={invoiceGapText(Number.isFinite(draftTotal) ? draftTotal : null, linesTotalUsd)}
            numberHint={
              sameNumber && (
                <FieldDescription className="text-warning">
                  Esa factura ya está cargada.{" "}
                  <button
                    type="button"
                    className="font-semibold underline underline-offset-2"
                    onClick={() => onChange({ invoiceChoice: sameNumber.id, newInvoice: emptyInvoiceDraft() })}
                  >
                    Usar esa
                  </button>
                </FieldDescription>
              )
            }
          />
        </div>
      )}
    </div>
  );
}

// La factura ya cargada que eligió la orden. Corregirla cambia la de todas las
// órdenes que la comparten, y se guarda en el momento.
function ChosenInvoice({ invoice, gap }: { invoice: PurchaseInvoice; gap: { text: string; over: boolean } | null }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {invoice.fileUrl ? (
          <a href={invoice.fileUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            Ver factura
          </a>
        ) : (
          <span className="font-medium text-warning">Falta subir el archivo</span>
        )}
        <span>Total {invoice.totalUsd != null ? formatUsd(invoice.totalUsd) : "sin escribir"}</span>
        <span className="text-muted-foreground">
          {invoice.orders.length === 1 ? "Cubre la orden " : "Cubre las órdenes "}
          <span className="font-spec">{invoice.orders.map((o) => o.orderNumber).join(", ")}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cerrar" : "Corregir factura"}
        </Button>
      </div>
      {gap && !editing && <p className={gap.over ? "text-warning" : "text-muted-foreground"}>{gap.text}</p>}
      {editing && <InvoiceEditor invoice={invoice} onDone={() => setEditing(false)} />}
    </div>
  );
}

function InvoiceEditor({ invoice, onDone }: { invoice: PurchaseInvoice; onDone: () => void }) {
  const [updateInvoice, { isLoading }] = useUpdatePurchaseInvoiceMutation();
  const [draft, setDraft] = useState<InvoiceDraft>(() => ({
    number: invoice.invoiceNumber,
    fileUrl: invoice.fileUrl,
    totalUsd: invoice.totalUsd == null ? "" : String(invoice.totalUsd),
  }));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const found = validateInvoiceDraft(draft);
    setError(found);
    if (found) return;
    try {
      await updateInvoice({ id: invoice.id, body: invoicePayload(draft) }).unwrap();
      toast.success(
        invoice.orders.length > 1 ? `Factura corregida en sus ${invoice.orders.length} órdenes.` : "Factura corregida.",
      );
      onDone();
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo guardar la factura.");
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <InvoiceDraftFields
        idPrefix="edit-invoice"
        draft={draft}
        onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        gap={null}
      />
      {error && <FieldError errors={[{ message: error }]} />}
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={save} disabled={isLoading}>
          {isLoading && <Spinner className="mr-2" />}
          {isLoading ? "Guardando…" : "Guardar factura"}
        </Button>
      </div>
    </div>
  );
}

function InvoiceDraftFields({
  idPrefix,
  draft,
  onChange,
  gap,
  numberHint,
}: {
  idPrefix: string;
  draft: InvoiceDraft;
  onChange: (patch: Partial<InvoiceDraft>) => void;
  gap: { text: string; over: boolean } | null;
  numberHint?: ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-number`}>Número de factura</FieldLabel>
        <Input
          id={`${idPrefix}-number`}
          value={draft.number}
          onChange={(e) => onChange({ number: e.target.value })}
          placeholder="Opcional"
          maxLength={60}
          className="font-spec"
        />
        {numberHint}
      </Field>
      <Field>
        <FieldLabel>Archivo</FieldLabel>
        <InvoiceFileButton url={draft.fileUrl} onChange={(fileUrl) => onChange({ fileUrl })} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-total`}>Total de la factura (USD)</FieldLabel>
        <Input
          id={`${idPrefix}-total`}
          type="number"
          step="0.01"
          min={0}
          value={draft.totalUsd}
          onChange={(e) => onChange({ totalUsd: e.target.value })}
        />
        {gap ? (
          <FieldDescription className={gap.over ? "text-warning" : undefined}>{gap.text}</FieldDescription>
        ) : (
          <FieldDescription>Se compara con los productos de todas sus órdenes.</FieldDescription>
        )}
      </Field>
    </div>
  );
}

// El archivo se sube al elegirlo (PDF o foto), así el enlace ya está listo al
// guardar.
function InvoiceFileButton({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("La factura tiene que ser un PDF o una foto.");
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadOne(file, "facturas-compras"));
      toast.success("Factura subida.");
    } catch (err) {
      toast.error((err as Error).message || "No se pudo subir la factura.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-2">
        {url ? (
          <>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium underline underline-offset-2">
              Ver factura
            </a>
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading && <Spinner className="mr-2" />}
              Cambiar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Quitar
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading && <Spinner className="mr-2" />}
            Subir (PDF o foto)
          </Button>
        )}
      </div>
    </>
  );
}
