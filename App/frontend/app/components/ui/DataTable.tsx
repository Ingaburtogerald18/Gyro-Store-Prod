import { HugeIcon } from "~/components/ui/icon";
import { ArrowDown02Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowUp02Icon, Download04Icon, InboxIcon, LayoutTable01Icon, MenuSquareIcon, Search01Icon, Tick01Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
// Tabla de datos genérica sobre TanStack Table v8: ordenable, con búsqueda
// global y paginación. Se reutiliza en todos los portales del admin.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
  type Table as TableInstance,
} from "@tanstack/react-table";


import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty";
import { cn } from "~/lib/utils";

// La entrada escalonada de filas se retiró en la Fase 1.6.
//
// Costaba un `motion.tr` por fila (hasta 60) y, sumada al fade del contenedor,
// al CountUp de los KPIs y al pill del sidebar, hacía que entrar a un módulo se
// leyera como inquieto en vez de refinado. Es además el efecto que peor
// envejece: se nota la primera vez y estorba las otras cincuenta. Las filas
// aparecen con el fade del contenedor, que ya está.

// Alineación por columna vía `meta` (texto a la izquierda, números a la derecha).
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right" | "center";
    className?: string;
  }
}

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText?: ReactNode;
  isLoading?: boolean;
  initialSorting?: SortingState;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | number | null;
  selectedRowIds?: Set<string | number>;
  onSelectAll?: (selectAll: boolean) => void;
  allSelected?: boolean;
  /**
   * Click en LA CASILLA (no en la fila): alterna la selección de esa fila sin
   * disparar `onRowClick`. Sin esto, una tabla que ya usa `onRowClick` para
   * abrir un detalle no podía además seleccionar — el click de la fila entera
   * hacía las dos cosas a la vez. Con `onToggleRow`, la casilla intercepta su
   * propio click (`stopPropagation`) y el resto de la fila sigue abriendo el
   * detalle como siempre.
   */
  onToggleRow?: (row: T) => void;
  hideSearch?: boolean;
  globalFilterValue?: string;
  onGlobalFilterChange?: (value: string) => void;
  // Si se provee, en móvil se renderiza cada fila como tarjeta (la tabla queda solo en desktop).
  mobileCard?: (row: T) => ReactNode;
  /**
   * Paginación en cliente. Por DEFECTO activada: una tabla que renderiza 4000
   * filas de una es un problema de rendimiento esperando ocurrir. Las tablas
   * que muestran totales en `<tfoot>` y necesitan ver todo pasan `false`.
   */
  paginated?: boolean;
  /**
   * Identificador estable de la tabla. Necesario para persistir columnas
   * visibles por tabla; sin él, todas compartirían la misma preferencia.
   */
  tableId?: string;
  /** Vacío por FILTRO, distinto del vacío real. Ver nota en el render. */
  emptyFilteredText?: ReactNode;
  /** Si se pasa, el vacío por filtro ofrece limpiar. */
  onClearFilters?: () => void;
  /** Nombre base del CSV. Sin esto no se muestra el botón de exportar. */
  exportFilename?: string;
}

type Density = "compact" | "normal";

const DENSITY_KEY = "gyro.table.density";

/** Lee la preferencia guardada. SSR-safe: en el server siempre "normal". */
function readDensity(): Density {
  if (typeof window === "undefined") return "normal";
  return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "normal";
}

function readColumnVisibility(tableId?: string): Record<string, boolean> {
  if (typeof window === "undefined" || !tableId) return {};
  try {
    return JSON.parse(window.localStorage.getItem(`gyro.table.${tableId}.columns`) ?? "{}");
  } catch {
    return {};
  }
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Buscar…",
  pageSize = 25,
  emptyText = "Sin registros.",
  isLoading = false,
  initialSorting = [],
  onRowClick,
  selectedRowId,
  selectedRowIds,
  onSelectAll,
  onToggleRow,
  allSelected,
  hideSearch = false,
  globalFilterValue,
  onGlobalFilterChange,
  mobileCard,
  paginated = true,
  tableId,
  emptyFilteredText,
  onClearFilters,
  exportFilename,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const [density, setDensityState] = useState<Density>("normal");
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  // Las preferencias se leen en un efecto y no en el `useState` inicial: el
  // servidor no tiene `localStorage`, y devolver algo distinto en el primer
  // render del cliente rompe la hidratación.
  useEffect(() => {
    setDensityState(readDensity());
    setColumnVisibility(readColumnVisibility(tableId));
  }, [tableId]);

  const setDensity = (next: Density) => {
    setDensityState(next);
    try {
      window.localStorage.setItem(DENSITY_KEY, next);
    } catch {
      // Storage bloqueado: la densidad aplica igual, solo no persiste.
    }
  };

  const globalFilter = globalFilterValue !== undefined ? globalFilterValue : internalGlobalFilter;
  const setGlobalFilter = onGlobalFilterChange || setInternalGlobalFilter;

  // `/` y ⌘F enfocan el buscador; Esc lo limpia. Se ignora si el foco ya está
  // en un campo de texto: nadie quiere que escribir "/" en un input abra otra
  // cosa.
  useEffect(() => {
    if (hideSearch) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;

      if (!typing && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "f"))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && el === searchRef.current) {
        setGlobalFilter("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideSearch, setGlobalFilter]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setColumnVisibility(next);
      if (tableId) {
        try {
          window.localStorage.setItem(`gyro.table.${tableId}.columns`, JSON.stringify(next));
        } catch {
          // idem densidad.
        }
      }
    },
    globalFilterFn: (row, columnId, filterValue) => {
      const value = row.getValue(columnId);
      if (value == null) return false;
      return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Paginación opt-in. Sin `paginated` no se registra el modelo → se muestran TODAS
    // las filas (la tabla scrollea dentro de su contenedor), como antes.
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    ...(paginated ? { initialState: { pagination: { pageSize } } } : {}),
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const hasFilter = globalFilter.trim().length > 0;
  const compact = density === "compact";

  // La columna de casillas depende de la SELECCIÓN, no de `onRowClick`.
  // Estaban atadas: cualquier tabla que quisiera abrir un detalle al hacer
  // click en la fila se llevaba de regalo una columna de checkboxes vacíos que
  // no seleccionaban nada.
  const selectable = !!onSelectAll || !!selectedRowIds || selectedRowId !== undefined;

  /**
   * Exporta LO QUE EL USUARIO VE: columnas visibles, filtro aplicado y orden
   * actual. Exportar el dataset crudo entrega un archivo que no se parece a la
   * pantalla desde la que se pidió.
   */
  function exportCsv() {
    const visible = table.getVisibleLeafColumns().filter((c) => c.id !== "actions");
    const headers = visible.map((c) => {
      const h = c.columnDef.header;
      return typeof h === "string" ? h : c.id;
    });
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      headers.map(escape).join(","),
      ...filteredRows.map((row) =>
        visible.map((c) => escape(row.getValue(c.id))).join(","),
      ),
    ];
    // BOM: sin él Excel en Windows abre el archivo en ANSI y "Audífonos" sale
    // como "AudÃ­fonos".
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hideSearch && (
          <div className="flex flex-1 items-center gap-2 rounded-pill border border-border bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 sm:max-w-xs sm:flex-none">
            <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
            <input
              ref={searchRef}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground sm:inline">
              /
            </kbd>
          </div>
        )}

        {/* Contador SIEMPRE visible, no solo con paginación: saber cuántas
            filas quedaron tras filtrar es la mitad de la respuesta. */}
        <span className="nums text-xs text-muted-foreground">
          {filteredRows.length === data.length
            ? `${data.length} ${data.length === 1 ? "registro" : "registros"}`
            : `${filteredRows.length} de ${data.length}`}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDensity(compact ? "normal" : "compact")}
            title={compact ? "Filas normales" : "Filas compactas"}
            aria-label={compact ? "Cambiar a filas normales" : "Cambiar a filas compactas"}
            aria-pressed={compact}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeIcon icon={MenuSquareIcon} size={16} strokeWidth={2} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Columnas"
                aria-label="Elegir columnas visibles"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeIcon icon={LayoutTable01Icon} size={16} strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {table
                .getAllLeafColumns()
                .filter((c) => c.id !== "actions" && c.getCanHide())
                .map((c) => {
                  const h = c.columnDef.header;
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(!!v)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {typeof h === "string" ? h : c.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>

          {exportFilename && (
            <button
              type="button"
              onClick={exportCsv}
              title="Exportar CSV"
              aria-label="Exportar a CSV lo que se ve en la tabla"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeIcon icon={Download04Icon} size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      ) : (
      <>
      {/* La PÁGINA scrollea, la tabla no (sin scroll anidado). El <thead> NO es
          sticky: dentro de este contenedor `overflow-hidden` (necesario para
          recortar las esquinas redondeadas) el sticky se anclaba mal y empujaba
          el encabezado sobre la primera fila. Va en flujo normal, con un borde
          inferior que lo separa del cuerpo. */}
      <div className="relative hidden overflow-hidden rounded-card border border-border bg-card md:block">
        <table className={cn("w-full", compact ? "text-[13px]" : "text-sm")}>
          <thead className="border-b border-border bg-muted/50 text-left">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    {onSelectAll && (
                      <div
                        onClick={() => onSelectAll(!allSelected)}
                        className={`flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded border transition-colors ${
                          allSelected
                            ? "border-primary-2 bg-primary-2 text-primary-foreground"
                            : "border bg-card hover:bg-muted"
                        }`}
                      >
                        {allSelected && <HugeIcon icon={Tick01Icon} size={14} strokeWidth={2} />}
                      </div>
                    )}
                  </th>
                )}
                {hg.headers.map((header) => {
                  const align = header.column.columnDef.meta?.align;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                        header.column.columnDef.meta?.className
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          className={cn(
                            "group/sort flex w-full items-center gap-1 cursor-pointer select-none hover:text-foreground",
                            align === "right" && "justify-end",
                            align === "center" && "justify-center",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <HugeIcon icon={ArrowUp02Icon} size={12} strokeWidth={2} className="shrink-0 text-primary-2" />
                          ) : sorted === "desc" ? (
                            <HugeIcon icon={ArrowDown02Icon} size={12} strokeWidth={2} className="shrink-0 text-primary-2" />
                          ) : (
                            <HugeIcon icon={UnfoldMoreIcon} size={12} strokeWidth={2} className="shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-50" />
                          )}
                        </button>
                      ) : (
                        <div
                          className={cn(
                            "flex items-center gap-1",
                            align === "right" && "justify-end",
                            align === "center" && "justify-center",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={selectable ? columns.length + 1 : columns.length} className="px-3 py-6">
                  {/* "No hay datos" y "el filtro no encontró nada" son cosas
                      distintas. Mostrar el mismo texto en los dos casos hace
                      que el usuario crea que la tabla está vacía cuando en
                      realidad tiene una búsqueda puesta — y no hay nada en
                      pantalla que se lo diga. */}
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeIcon icon={hasFilter ? Search01Icon : InboxIcon} size={16} strokeWidth={2} />
                      </EmptyMedia>
                      <EmptyTitle>
                        {hasFilter
                          ? (emptyFilteredText ?? <>Ningún resultado para «{globalFilter}»</>)
                          : emptyText}
                      </EmptyTitle>
                    </EmptyHeader>
                    {hasFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setGlobalFilter("");
                          onClearFilters?.();
                        }}
                        className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </Empty>
                </td>
              </tr>
            ) : (
              (() => {
                const rows = table.getRowModel().rows;
                return rows.map((row, idx) => {
                const rowId = (row.original as any).id;
                const isSelected =
                  (selectedRowIds && selectedRowIds.has(rowId)) ||
                  (selectedRowId && rowId === selectedRowId);
                // `border-border/50`, no `border/50`: `border` a secas fija el
                // ancho en los cuatro lados con `currentColor`, así que cada
                // fila venía con una caja completa en vez de una línea arriba.
                // Zebra SOLO en compacto. Con zebra + hover + bordes al mismo
                // tiempo la tabla es ruido; pero con filas muy juntas la zebra
                // sí ayuda a no perder el renglón. En normal manda el hover.
                const rowClass = cn(
                  "group/row border-t border-border/60 transition-colors",
                  onRowClick && "cursor-pointer",
                  isSelected
                    ? "bg-primary-2/10 hover:bg-primary-2/20"
                    : cn(compact && idx % 2 === 1 && "bg-muted/40", "hover:bg-muted/50"),
                );
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={rowClass}
                  >
                    {selectable && (
                      <td
                        className={cn("w-10 px-3 py-2.5", onToggleRow && "cursor-pointer")}
                        onClick={
                          onToggleRow
                            ? (e) => {
                                // Sin esto, el click en la casilla también
                                // dispara `onRowClick` de la fila (abriría el
                                // detalle Y alternaría la selección a la vez).
                                e.stopPropagation();
                                onToggleRow(row.original);
                              }
                            : undefined
                        }
                      >
                        <div
                          className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? "border-primary-2 bg-primary-2 text-primary-foreground"
                              : "border bg-card"
                          }`}
                        >
                          {isSelected && <HugeIcon icon={Tick01Icon} size={14} strokeWidth={2} />}
                        </div>
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => {
                      const align = cell.column.columnDef.meta?.align;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "whitespace-nowrap px-3",
                            compact ? "py-1.5" : "py-2.5",
                            align === "right" && "text-right tabular-nums",
                            align === "center" && "text-center",
                            cell.column.columnDef.meta?.className
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
                });
              })()
            )}
          </tbody>
          {/* Elevación por borde + fondo, no por sombra: la que había estaba
              hardcodeada en negro al 25 % (`rgba(0,0,0,.25)`), que en tema claro
              se ve barata y en oscuro no se ve. */}
          {table.getFooterGroups().some(fg => fg.headers.some(h => h.column.columnDef.footer)) && (
            <tfoot className="sticky bottom-0 z-20 border-t border-border bg-background/95 font-bold backdrop-blur-md">
              {table.getFooterGroups().map((fg) => (
                <tr key={fg.id}>
                  {selectable && <td className="px-3 py-2.5"></td>}
                  {fg.headers.map((header) => {
                    const align = header.column.columnDef.meta?.align;
                    return (
                      <td
                        key={header.id}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5",
                          align === "right" && "text-right tabular-nums",
                          align === "center" && "text-center",
                          header.column.columnDef.meta?.className
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      {/* Vista móvil: tarjetas (bonitas si el panel define mobileCard; genéricas si no). */}
      <div className="space-y-3 md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <p className="rounded-card border border-border bg-card py-8 text-center text-muted-foreground">
            {hasFilter ? <>Ningún resultado para «{globalFilter}»</> : emptyText}
          </p>
        ) : (
          table.getRowModel().rows.map((row) => {
            const rowId = (row.original as any).id;
            const isSelected =
              (selectedRowIds && selectedRowIds.has(rowId)) || (selectedRowId && rowId === selectedRowId);
            return (
              <div
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={`${onRowClick ? "cursor-pointer " : ""}${isSelected ? "rounded-card ring-2 ring-primary-2" : ""}`}
              >
                {mobileCard ? (
                  mobileCard(row.original)
                ) : (
                  <div className="space-y-1.5 rounded-card border bg-card shadow-lg p-4">
                    {row.getVisibleCells().map((cell) => {
                      const header = cell.column.columnDef.header;
                      const label = typeof header === "string" ? header : "";
                      return (
                        <div key={cell.id} className="flex items-start justify-between gap-3 text-sm">
                          {label ? <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span> : <span />}
                          <div className="min-w-0 text-right">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {paginated && table.getRowModel().rows.length > 0 && <TablePagination table={table} />}
      </>
      )}
    </div>
  );
}

// Control de paginación compartido (prev/próxima + rango). Solo se monta cuando
// la tabla usa `paginated`. Estilizado con tokens; botones con hit-area accesible.
function TablePagination<T>({ table }: { table: TableInstance<T> }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col items-center justify-between gap-3 pt-1 text-sm sm:flex-row"
    >
      <p className="nums text-muted-foreground">
        <span className="font-semibold text-foreground">{from}–{to}</span> de{" "}
        <span className="font-semibold text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label="Página anterior"
          className="grid h-11 w-11 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40"
        >
          <HugeIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
        </button>
        <span className="nums px-2 text-muted-foreground">
          Página <span className="font-semibold text-foreground">{pageIndex + 1}</span> de{" "}
          <span className="font-semibold text-foreground">{Math.max(pageCount, 1)}</span>
        </span>
        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label="Página siguiente"
          className="grid h-11 w-11 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40"
        >
          <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
        </button>
      </div>
    </nav>
  );
}
