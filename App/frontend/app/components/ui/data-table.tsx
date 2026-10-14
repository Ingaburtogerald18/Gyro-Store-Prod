import { HugeIcon } from "~/components/ui/icon";
import { ArrowDown02Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowUp02Icon, Download04Icon, InboxIcon, LayoutTable01Icon, MenuSquareIcon, Search01Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useLocalPreference } from '~/hooks/use-local-preference';
import { DENSITY_KEY, isDensity, isVisibility, type TableDensity } from '~/lib/ui-preferences';
import { TableViewMenu } from './table-view-menu';
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
import { Chip } from "./chip";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table";
import { cn } from "~/lib/utils";

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
  /** Fijo para columnas acotadas con resúmenes; automático para contenido de ancho variable. */
  layout?: "auto" | "fixed";
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
  /** Clic en la casilla, no en la fila: selecciona sin disparar `onRowClick`. */
  onToggleRow?: (row: T) => void;
  hideSearch?: boolean;
  globalFilterValue?: string;
  onGlobalFilterChange?: (value: string) => void;
  // Si se provee, en móvil se renderiza cada fila como tarjeta (la tabla queda solo en desktop).
  mobileCard?: (row: T) => ReactNode;
  /** Paginación en cliente por defecto. Las tablas con totales en <tfoot> pasan `false`. */
  paginated?: boolean;
  /**
   * Identificador estable de la tabla. Necesario para persistir columnas
   * visibles por tabla; sin él, todas compartirían la misma preferencia.
   */
  tableId?: string;
  /** Columnas ocultas de entrada; con `tableId` se recuerda si se vuelven a mostrar. */
  defaultHiddenColumns?: string[];
  /** Vacío por FILTRO, distinto del vacío real. Ver nota en el render. */
  emptyFilteredText?: ReactNode;
  /** Si se pasa, el vacío por filtro ofrece limpiar. */
  onClearFilters?: () => void;
  /** Nombre base del CSV. Sin esto no se muestra el botón de exportar. */
  exportFilename?: string;
}

function readColumnVisibility(tableId?: string): Record<string, boolean> {
  if (typeof window === "undefined" || !tableId) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`gyro.table.${tableId}.columns`) ?? "{}");
    return isVisibility(value) ? value : {};
  } catch {
    return {};
  }
}

export function DataTable<T>({
  columns,
  data,
  layout = "auto",
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
  defaultHiddenColumns,
  emptyFilteredText,
  onClearFilters,
  exportFilename,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const [density, setDensity] = useLocalPreference<TableDensity>(DENSITY_KEY, "normal", isDensity);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  // Las preferencias se leen en un efecto: el servidor no tiene localStorage y un primer render
  // distinto rompe la hidratación.
  useEffect(() => {
    const defaults = Object.fromEntries((defaultHiddenColumns ?? []).map((id) => [id, false]));
    setColumnVisibility({ ...defaults, ...readColumnVisibility(tableId), actions: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults de entrada: solo al montar.
  }, [tableId]);

  const globalFilter = globalFilterValue !== undefined ? globalFilterValue : internalGlobalFilter;
  const setGlobalFilter = onGlobalFilterChange || setInternalGlobalFilter;
  const canChangeSearch = globalFilterValue === undefined || !!onGlobalFilterChange;

  // `/` enfoca el buscador y Esc lo limpia, salvo que el foco ya esté en un campo de texto.
  useEffect(() => {
    if (hideSearch) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;

      if (!e.defaultPrevented && !typing && e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey &&
          !document.querySelector('[role="dialog"]') && searchRef.current?.getClientRects().length) {
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
    // Sin `paginated` no se registra el modelo y se muestran todas las filas.
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    ...(paginated ? { initialState: { pagination: { pageSize } } } : {}),
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const hasFilter = globalFilter.trim().length > 0;
  const compact = density === "compact";

  // Las casillas dependen de la selección, no de `onRowClick`: abrir un detalle no trae checkboxes vacíos.
  const selectable = !!onSelectAll || !!selectedRowIds || selectedRowId !== undefined;

  /** Exporta lo que se ve: columnas visibles, filtro y orden actuales. */
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
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="data-table space-y-3">
      <div className="data-table-toolbar flex flex-wrap items-center gap-3">
        {!hideSearch && (
          <div className="flex h-11 min-w-0 basis-full flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 sm:max-w-xs sm:basis-auto sm:flex-none">
            <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
            <input
              ref={searchRef}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 w-full bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <kbd className="hidden shrink-0 rounded-sm border border-border px-1 text-2xs text-muted-foreground sm:inline">
              /
            </kbd>
          </div>
        )}

        <span className="nums text-xs text-muted-foreground">
          {filteredRows.length === data.length
            ? `${data.length} ${data.length === 1 ? "registro" : "registros"}`
            : `${filteredRows.length} de ${data.length}`}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tableId && (
            <TableViewMenu tableId={tableId} current={{ search: canChangeSearch ? globalFilter : undefined, sorting, columns: columnVisibility }} onApply={(view) => {
              const ids = new Set(table.getAllLeafColumns().map((column) => column.id));
              if (canChangeSearch && view.search !== undefined) setGlobalFilter(view.search);
              setSorting(view.sorting.filter((sort) => ids.has(sort.id)));
              const visible = Object.fromEntries(table.getAllLeafColumns().map((column) => [column.id,
                column.id === 'actions' || !column.getCanHide() || view.columns[column.id] !== false,
              ]));
              if (!Object.values(visible).some(Boolean)) {
                const first = table.getAllLeafColumns()[0];
                if (first) visible[first.id] = true;
              }
              table.setColumnVisibility(visible);
              table.setPageIndex(0);
            }} />
          )}
          <button
            type="button"
            onClick={() => setDensity(compact ? "normal" : "compact")}
            title={compact ? "Filas normales" : "Filas compactas"}
            aria-label={compact ? "Cambiar a filas normales" : "Cambiar a filas compactas"}
            aria-pressed={compact}
            className="grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeIcon icon={MenuSquareIcon} size={16} strokeWidth={2} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Columnas"
                aria-label="Elegir columnas visibles"
                className="grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      disabled={c.getIsVisible() && table.getVisibleLeafColumns().length === 1}
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
              className="grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeIcon icon={Download04Icon} size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {(hasFilter || sorting.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Búsqueda y orden activos">
          {hasFilter && (canChangeSearch
            ? <Chip variant="filter" onRemove={() => { setGlobalFilter(""); table.setPageIndex(0); }} removeLabel={`Quitar búsqueda: ${globalFilter}`}>Búsqueda: {globalFilter}</Chip>
            : <Chip variant="filter" className="truncate">Búsqueda del módulo: {globalFilter}</Chip>)}
          {sorting.map((sort) => {
            const header = table.getColumn(sort.id)?.columnDef.header;
            const label = typeof header === 'string' ? header : sort.id;
            return <Chip key={sort.id} variant="filter" onRemove={() => setSorting(sorting.filter((entry) => entry.id !== sort.id))} removeLabel={`Quitar orden de ${label}`}>{label}: {sort.desc ? 'descendente' : 'ascendente'}</Chip>;
          })}
        </div>
      )}
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
      <Table density={compact ? "compact" : "normal"} className={cn(layout === "fixed" && "table-fixed")} containerClassName="hidden md:block">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {selectable && (
                  <TableHead className="w-10 px-3">
                    {onSelectAll && (
                      <label className="grid min-h-9 min-w-9 cursor-pointer place-items-center">
                        <input type="checkbox" checked={!!allSelected}
                          ref={(input) => { if (input) input.indeterminate = !allSelected && !!selectedRowIds?.size; }}
                          aria-label="Seleccionar todas las filas"
                          onChange={(event) => onSelectAll(event.target.checked)}
                          className="size-4 rounded-sm accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />
                      </label>
                    )}
                  </TableHead>
                )}
                {hg.headers.map((header) => {
                  const align = header.column.columnDef.meta?.align;
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                        header.column.columnDef.meta?.className
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className={cn(
                            "group/sort flex min-h-8 w-full items-center gap-2 rounded-sm cursor-pointer select-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                            <HugeIcon icon={UnfoldMoreIcon} size={12} strokeWidth={2} className="shrink-0 opacity-50" />
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
                    </TableHead>
                  );
                })}
              </tr>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={selectable ? columns.length + 1 : columns.length} className="px-3 py-6">
                  {/* El vacío por búsqueda se distingue del vacío real: si no, parece que no hay datos. */}
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeIcon icon={hasFilter ? Search01Icon : InboxIcon} size={24} strokeWidth={2} />
                      </EmptyMedia>
                      <EmptyTitle>
                        {hasFilter
                          ? (emptyFilteredText ?? <>Ningún resultado para «{globalFilter}»</>)
                          : emptyText}
                      </EmptyTitle>
                    </EmptyHeader>
                    {hasFilter && (canChangeSearch || onClearFilters) && (
                      <button
                        type="button"
                        onClick={() => {
                          setGlobalFilter("");
                          onClearFilters?.();
                        }}
                        className="mt-3 text-sm font-medium text-primary-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </Empty>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const rowId = (row.original as any).id;
                const isSelected =
                  (selectedRowIds && selectedRowIds.has(rowId)) ||
                  (selectedRowId != null && rowId === selectedRowId);
                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? "selected" : undefined}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button, a, input, label, select, [role="button"]')) return;
                      onRowClick?.(row.original);
                    }}
                    className={cn(onRowClick && "cursor-pointer")}
                  >
                    {selectable && (
                      <TableCell className="w-12 px-2">
                        <label className="grid min-h-9 min-w-9 place-items-center">
                          <input type="checkbox" checked={!!isSelected} disabled={!onToggleRow && !onRowClick}
                            aria-label={`Seleccionar fila ${row.index + 1}`}
                            onChange={() => (onToggleRow ?? onRowClick)?.(row.original)}
                            className="size-4 rounded-sm accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />
                        </label>
                      </TableCell>
                    )}
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      const align = cell.column.columnDef.meta?.align;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            cell.column.id === "actions" ? "w-px whitespace-nowrap" : "min-w-24 whitespace-normal break-words",
                            align === "right" && "text-right tabular-nums",
                            align === "center" && "text-center",
                            cell.column.columnDef.meta?.className
                          )}
                        >
                          {cellIndex === 0 && onRowClick && <button type="button" onClick={(event) => { event.stopPropagation(); onRowClick(row.original); }} className="sr-only focus:not-sr-only focus:mb-1 focus:rounded-sm focus:px-2 focus:py-1 focus:ring-2 focus:ring-ring">Abrir fila {row.index + 1}</button>}
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {table.getFooterGroups().some(fg => fg.headers.some(h => h.column.columnDef.footer)) && (
            <TableFooter>
              {table.getFooterGroups().map((fg) => (
                <tr key={fg.id}>
                  {selectable && <TableCell />}
                  {fg.headers.map((header) => {
                    const align = header.column.columnDef.meta?.align;
                    return (
                      <TableCell
                        key={header.id}
                        className={cn(
                          "whitespace-nowrap",
                          align === "right" && "text-right tabular-nums",
                          align === "center" && "text-center",
                          header.column.columnDef.meta?.className
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
                      </TableCell>
                    );
                  })}
                </tr>
              ))}
            </TableFooter>
          )}
      </Table>
      {/* Vista móvil: tarjetas (bonitas si el panel define mobileCard; genéricas si no). */}
      <div className="space-y-3 md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card py-8 text-center text-muted-foreground">
            {hasFilter ? <>Ningún resultado para «{globalFilter}»</> : emptyText}
          </p>
        ) : (
          table.getRowModel().rows.map((row) => {
            const rowId = (row.original as any).id;
            const isSelected =
              (selectedRowIds && selectedRowIds.has(rowId)) || (selectedRowId != null && rowId === selectedRowId);
            return (
              // Tarjeta clickeable: también se abre con Enter/Espacio. Se ignoran
              // las teclas que vienen de controles internos (botones del card).
              <div
                key={row.id}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={() => onRowClick?.(row.original)}
                onKeyDown={(e) => {
                  if (!onRowClick || e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row.original);
                  }
                }}
                className={`${onRowClick ? "cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " : ""}${isSelected ? "rounded-2xl ring-2 ring-primary-2" : ""}`}
              >
                {mobileCard ? (
                  mobileCard(row.original)
                ) : (
                  <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
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
          className="grid size-11 place-items-center rounded-xl border border-input bg-card text-foreground transition-colors hover:border-primary-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
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
          className="grid size-11 place-items-center rounded-xl border border-input bg-card text-foreground transition-colors hover:border-primary-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
        </button>
      </div>
    </nav>
  );
}
