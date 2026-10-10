// Página de muestra del panel: cada pieza del sistema de diseño en un lugar.
// Sirve para comparar pantallas contra DESIGN.md. Solo para admin y fuera del menú.
import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import type { ColumnDef } from "@tanstack/react-table";
import { Add01Icon, InboxIcon } from "@hugeicons/core-free-icons";

import { Kbd, Metric, MetricStrip, SegmentedControl, ToolbarSearch, ToolbarSelect, Workspace, WorkspaceToolbar } from "~/components/admin/workspace";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/button";
import { CodeCell } from "~/components/ui/cells";
import { Chip } from "~/components/ui/chip";
import { DataTable } from "~/components/ui/DataTable";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { QueryState } from "~/components/ui/QueryState";
import { SkeletonTable } from "~/components/ui/skeletons";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { pageTitle } from "~/lib/brand";
import { formatCordobas } from "~/lib/formatters";
import { useAppSelector } from "~/store/hooks";
import { selectIsAdmin } from "~/store/slices/authSlice";

export const meta: MetaFunction = () => [{ title: pageTitle("Estilo", { admin: true }) }];

const COLORS: { name: string; token: string; className: string }[] = [
  { name: "Tinta", token: "--ink", className: "bg-ink" },
  { name: "Crema", token: "--background", className: "bg-background" },
  { name: "Blanco", token: "--card", className: "bg-card" },
    { name: "Texto secundario", token: "--muted-foreground", className: "bg-muted-foreground" },
  { name: "Amarillo", token: "--action", className: "bg-action" },
  { name: "Bordó", token: "--primary-2", className: "bg-primary-2" },
  { name: "Rosa", token: "--rose", className: "bg-rose" },
  { name: "Teal del logo", token: "--logo", className: "bg-logo" },
    { name: "Error", token: "--destructive", className: "bg-destructive" },
  { name: "Advertencia", token: "--warning", className: "bg-warning" },
  { name: "Información", token: "--info", className: "bg-info" },
  { name: "WhatsApp", token: "--whatsapp", className: "bg-whatsapp" },
  { name: "Borde de campo", token: "--input", className: "bg-input" },
];

const TYPE_SCALE: { role: string; className: string; sample: string }[] = [
  { role: "Título de página", className: "font-heading text-2xl font-bold tracking-tight", sample: "Inventario" },
  { role: "Título de tarjeta o ventana", className: "text-lg font-semibold", sample: "Registrar compra" },
  { role: "Nombre de producto", className: "font-semibold", sample: "Audífonos Gyro X2" },
  { role: "Precio", className: "font-heading font-extrabold tabular-nums", sample: "C$1,710" },
  { role: "Métrica", className: "font-heading text-2xl font-extrabold tabular-nums", sample: "C$48,250" },
  { role: "Cuerpo", className: "text-sm", sample: "La orden llegó completa a bodega." },
  { role: "Etiqueta, ayuda", className: "text-xs text-muted-foreground", sample: "28 abr 2026" },
  { role: "Mínimo", className: "text-2xs font-semibold uppercase tracking-wide", sample: "Nuevo" },
];

const VARIANTS = ["default", "outline", "cancel", "destructive", "whatsapp", "whatsappOutline", "link", "ghost"] as const;

interface SampleRow {
  id: number;
  code: string;
  product: string;
  variant: string;
  units: number;
  total: number;
  status: "success" | "pending" | "info";
}

const ROWS: SampleRow[] = [
  { id: 1, code: "LT12-01", product: "Audífonos Gyro X2", variant: "Negro", units: 40, total: 68400, status: "success" },
  { id: 2, code: "LT12-02", product: "Audífonos Gyro X2", variant: "Blanco", units: 25, total: 42750, status: "pending" },
  { id: 3, code: "LT13-01", product: "Cargador rápido 20 W", variant: "USB-C", units: 60, total: 27000, status: "info" },
  { id: 4, code: "LT13-02", product: "Funda de silicona", variant: "Verde", units: 120, total: 18000, status: "success" },
];

const STATUS_LABEL: Record<SampleRow["status"], string> = {
  success: "En bodega",
  pending: "Datos por completar",
  info: "En tránsito",
};

const COLUMNS: ColumnDef<SampleRow, unknown>[] = [
  {
    accessorKey: "code",
    header: "Código",
    cell: (c) => <CodeCell value={c.getValue<string>()} />,
  },
  {
    accessorKey: "product",
    header: "Producto",
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="font-semibold">{row.original.product}</span>
        <span className="text-xs text-muted-foreground">{row.original.variant}</span>
      </span>
    ),
  },
  { accessorKey: "units", header: "Unidades", meta: { align: "right" } },
  {
    accessorKey: "total",
    header: "Total (C$)",
    meta: { align: "right" },
    cell: (c) => formatCordobas(c.getValue<number>()),
    footer: () => formatCordobas(ROWS.reduce((sum, r) => sum + r.total, 0)),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: (c) => <StatusBadge status={c.getValue<SampleRow["status"]>()} label={STATUS_LABEL[c.getValue<SampleRow["status"]>()]} />,
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminEstilo() {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [view, setView] = useState<"compras" | "stock">("compras");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [onlyOffers, setOnlyOffers] = useState(true);

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Esta página es solo para administradores.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Sistema"
        title="Estilo"
        className="mb-0"
        actions={
          <Button className="gap-2">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
            Registrar compra
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <Section title="Color">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {COLORS.map((c) => (
            <li key={c.token} className="space-y-1.5">
              <span aria-hidden className={`block h-12 rounded-xl border border-border ${c.className}`} />
              <span className="block text-sm font-semibold">{c.name}</span>
              <span className="block font-mono text-xs text-muted-foreground">{c.token}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografía">
        <dl className="divide-y divide-border">
          {TYPE_SCALE.map((t) => (
            <div key={t.role} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:items-baseline">
              <dt className="text-xs text-muted-foreground">{t.role}</dt>
              <dd className={t.className}>{t.sample}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v === "link" ? "Ver detalle" : v === "cancel" ? "Cancelar" : v === "destructive" ? "Eliminar" : v.startsWith("whatsapp") ? "Escribir por WhatsApp" : v === "ghost" ? "Más" : v === "outline" ? "Exportar" : "Guardar cambios"}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Tamaño normal (44 px)</Button>
          <Button size="sm" variant="outline">Tamaño de tabla (36 px)</Button>
          <Button disabled>Guardando…</Button>
        </div>
      </Section>

      <Section title="Selección y chips">
        <SegmentedControl
          label="Vista"
          value={view}
          onChange={setView}
          options={[
            { value: "compras", label: "Compras" },
            { value: "stock", label: "Stock actual" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" aria-pressed={onlyOffers} onClick={() => setOnlyOffers(!onlyOffers)}>
            Ofertas
          </Button>
          <Chip variant="status" tone="success">Entregado</Chip>
          <Chip variant="status" tone="warning">Datos por completar</Chip>
          <Chip variant="status" tone="info">En tránsito</Chip>
          <Chip variant="status" tone="error">Anulado</Chip>
          <Chip variant="filter" onRemove={() => undefined} removeLabel="Quitar filtro Disponibles">Disponibles</Chip>
          <Chip variant="count">3</Chip>
          <Chip variant="category">Audio</Chip>
        </div>
      </Section>

      <Workspace>
        <WorkspaceToolbar>
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar producto o código" />
          <ToolbarSelect
            label="Estado"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Todos" },
              { value: "transit", label: "En tránsito" },
            ]}
          />
        </WorkspaceToolbar>
        <MetricStrip>
          <Metric label="Unidades en bodega" value="245" sub="40 en tránsito" />
          <Metric label="Inversión total" value="$12,480.00" sub="C$457,890" />
          <Metric label="Impuestos pagados" value="$1,104.50" sub="8.8 % del subtotal" />
          <Metric label="Costo promedio por unidad" value="$5.09" sub="4 productos distintos" />
        </MetricStrip>
        <DataTable
          tableId="estilo-muestra"
          columns={COLUMNS}
          data={ROWS}
          hideSearch
          globalFilterValue={search}
          onGlobalFilterChange={setSearch}
          paginated={false}
        />
      </Workspace>

      <Section title="Formulario">
        <form className="max-w-xl space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
          <Field>
            <FieldLabel htmlFor="estilo-proveedor" required>Proveedor</FieldLabel>
            <Input id="estilo-proveedor" aria-invalid defaultValue="" />
            <FieldError>Escribí el nombre del proveedor.</FieldError>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="estilo-fecha">Fecha</FieldLabel>
              <Input id="estilo-fecha" type="date" />
            </Field>
            <Field>
              <FieldLabel htmlFor="estilo-monto" required>Monto (C$)</FieldLabel>
              <Input id="estilo-monto" inputMode="decimal" aria-invalid defaultValue="-20" />
              <FieldError>El monto tiene que ser mayor que cero.</FieldError>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="cancel">Cancelar</Button>
            <Button type="submit">Registrar compra</Button>
          </div>
        </form>
      </Section>

      <Section title="Estados">
        <div className="grid gap-5 lg:grid-cols-3">
          <Empty className="rounded-2xl border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeIcon icon={InboxIcon} size={24} strokeWidth={2} aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Aún no hay compras registradas</EmptyTitle>
              <EmptyDescription>Registrá la primera con «Registrar compra».</EmptyDescription>
            </EmptyHeader>
            <Button>Registrar compra</Button>
          </Empty>
          <SkeletonTable rows={4} cols={4} />
          <QueryState loading={false} error onRetry={() => undefined}>
            {null}
          </QueryState>
        </div>
      </Section>
    </div>
  );
}

export { AdminRouteError as ErrorBoundary } from "~/components/layout/route-error";
