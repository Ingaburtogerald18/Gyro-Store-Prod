import { HugeIcon } from "~/components/ui/icon";
import {
  Add01Icon,
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  LockIcon,
  MoreHorizontalIcon,
  RefreshIcon,
  Tag01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { PageHeader } from '~/components/layout/PageHeader';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Field, FieldError } from '~/components/ui/field';
import { AccountDialog, ClosureDialog, MovementDialog, TransferDialog } from '~/components/admin/caja/CajaForms';
import { toast } from 'sonner';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Kbd,
  Metric,
  MetricStrip,
  ToolbarSearch,
  ToolbarSelect,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from '~/components/admin/workspace';
import {
  useGetAccountsQuery,
  useGetMovementsQuery,
  useGetCuadreQuery,
  useGetDailySummaryQuery,
  useGetExpenseCategoriesQuery,
  useUpdateExpenseCategoriesMutation,
  useGetClosuresQuery,
} from '~/store/api/cajaApi';
import { formatByCurrency, formatLongDate } from '~/lib/formatters';
import { format } from 'date-fns';
import type { AccountMovement } from '@shared/schemas';

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Caja y bancos', { admin: true }) }];
};


export default function AdminCajaRoute() {
  const { data: accounts = [], isLoading: isLoadingAcc } = useGetAccountsQuery();
  const { data: movements = [], isLoading: isLoadingMov, refetch } = useGetMovementsQuery();
  const { data: cuadre } = useGetCuadreQuery(); // Para los saldos consolidados
  const { data: resumen } = useGetDailySummaryQuery(); // Qué se vendió hoy
  const { data: expenseCategories = [] } = useGetExpenseCategoriesQuery();
  const { data: closures = [] } = useGetClosuresQuery();

  const [updateCatsMut, { isLoading: isSavingCats }] = useUpdateExpenseCategoriesMutation();

  const [isMovOpen, setIsMovOpen] = useState(false);
  const [isAccOpen, setIsAccOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCatsOpen, setIsCatsOpen] = useState(false);
  const [isClosureOpen, setIsClosureOpen] = useState(false);

  // Saldo actual por cuenta (incluye saldo inicial; lo calcula el backend).
  const balanceOf = (accountId: string) =>
    cuadre?.saldosCuentas.find((s) => s.accountId === accountId)?.balance ?? 0;

  // Los formularios (movimiento, cuenta, traspaso, cierre) viven en
  // components/admin/caja/CajaForms.tsx con react-hook-form.

  // Form states Categorías (borrador editable en el modal)
  const [catDraft, setCatDraft] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  // El duplicado se avisa DEBAJO del campo, no en un toast.
  const [catError, setCatError] = useState('');

  const activeAccounts = useMemo(() => accounts.filter((a) => a.activo), [accounts]);

  // Barra de herramientas: búsqueda + cuenta + tipo. Filtran la tabla acá
  // (la tabla recibe las filas ya filtradas y no dibuja su propio buscador).
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'ingreso' | 'egreso'>('all');

  // "N" abre Registrar movimiento: es la acción de todo el día en la compu.
  useShortcut('n', () => setIsMovOpen(true));
  const accName = (id: string) => accounts.find((a) => a.id === id)?.nombre ?? 'Desconocida';
  const accMonedaOf = (id: string) => accounts.find((a) => a.id === id)?.moneda;

  const openCategories = () => {
    setCatDraft(expenseCategories);
    setNewCat('');
    setCatError('');
    setIsCatsOpen(true);
  };

  const addCat = () => {
    const v = newCat.trim();
    if (!v) {
      setCatError('Escribí el nombre de la categoría.');
      return;
    }
    if (catDraft.some((c) => c.toLowerCase() === v.toLowerCase())) {
      setCatError('Esa categoría ya existe.');
      return;
    }
    setCatDraft((prev) => [...prev, v]);
    setNewCat('');
    setCatError('');
  };

  const handleSaveCategories = async () => {
    try {
      await updateCatsMut(catDraft).unwrap();
      toast.success('Categorías guardadas.');
      setIsCatsOpen(false);
    } catch (err: any) {
      toast.error(err.data?.error || 'No se pudieron guardar las categorías.');
    }
  };

  const openClosure = () => setIsClosureOpen(true);

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (accountFilter !== 'all' && m.account_id !== accountFilter) return false;
      if (tipoFilter !== 'all' && m.tipo !== tipoFilter) return false;
      if (!q) return true;
      return [m.descripcion, m.categoria, accName(m.account_id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- accName deriva de `accounts`.
  }, [movements, search, accountFilter, tipoFilter, accounts]);

  const columns = [
    {
      header: 'Fecha',
      accessorKey: 'ocurrio_at',
      cell: (info: any) => (
        <span className="whitespace-nowrap">
          {formatLongDate(info.getValue())}{' '}
          <span className="text-xs text-muted-foreground">{format(new Date(info.getValue()), 'HH:mm')}</span>
        </span>
      ),
    },
    {
      header: 'Cuenta',
      accessorKey: 'account_id',
      cell: (info: any) => accName(info.getValue()),
    },
    {
      header: 'Tipo',
      accessorKey: 'tipo',
      cell: (info: any) => {
        const t = info.getValue();
        return (
          // El tipo va en texto normal con su flecha; el color lo lleva el
          // monto (verde solo lo que entra), no una palabra en MAYÚSCULAS.
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {t === 'ingreso' ? <HugeIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} className="text-success" /> : <HugeIcon icon={ArrowDownRight01Icon} size={14} strokeWidth={2} />}
            {t === 'ingreso' ? 'Ingreso' : 'Egreso'}
          </span>
        );
      },
    },
    {
      header: 'Monto',
      accessorKey: 'monto',
      meta: { align: 'right' as const },
      cell: (info: any) => {
        const mov = info.row.original as AccountMovement;
        const sign = mov.tipo === 'egreso' ? '−' : '+';
        return (
          <span className={`nums font-medium ${mov.tipo === 'ingreso' ? 'text-success' : 'text-foreground'}`}>
            {sign}
            {formatByCurrency(Number(info.getValue()), accMonedaOf(mov.account_id))}
          </span>
        );
      },
    },
    {
      header: 'Categoría',
      accessorKey: 'categoria',
    },
    {
      header: 'Descripción',
      accessorKey: 'descripcion',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Una acción principal, una secundaria y el resto en "Más": antes eran
          cinco botones del mismo peso compitiendo en el encabezado. */}
      <PageHeader
        eyebrow="Operación"
        title="Caja y bancos"
        description="Libro diario de ingresos y egresos de las cuentas."
        className="mb-0"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-2 rounded-md">
                  <HugeIcon icon={MoreHorizontalIcon} size={16} strokeWidth={2} aria-hidden />
                  Más
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setIsAccOpen(true)}>
                  <HugeIcon icon={Wallet01Icon} size={16} strokeWidth={2} className="mr-2" />
                  Nueva cuenta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openCategories}>
                  <HugeIcon icon={Tag01Icon} size={16} strokeWidth={2} className="mr-2" />
                  Categorías de gasto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsTransferOpen(true)} disabled={activeAccounts.length < 2}>
                  <HugeIcon icon={RefreshIcon} size={16} strokeWidth={2} className="mr-2" />
                  Traspaso entre cuentas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={openClosure} disabled={activeAccounts.length === 0} className="h-9 gap-2 rounded-md">
              <HugeIcon icon={LockIcon} size={16} strokeWidth={2} aria-hidden />
              Cerrar día
            </Button>
            <Button onClick={() => setIsMovOpen(true)} className="h-9 gap-2 rounded-md">
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
              Registrar movimiento
              <Kbd>N</Kbd>
            </Button>
          </>
        }
      />

      <Workspace>
        <WorkspaceToolbar>
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar descripción o categoría" />
          <ToolbarSelect
            label="Cuenta"
            value={accountFilter}
            onChange={setAccountFilter}
            options={[{ value: 'all', label: 'Todas' }, ...accounts.map((a) => ({ value: a.id, label: a.nombre }))]}
          />
          <ToolbarSelect
            label="Tipo"
            value={tipoFilter}
            onChange={setTipoFilter}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'ingreso', label: 'Ingresos' },
              { value: 'egreso', label: 'Egresos' },
            ]}
          />
        </WorkspaceToolbar>

        {/* Saldo por cuenta: una métrica por cuenta, en la misma franja. */}
        {accounts.length > 0 && (
          <MetricStrip columns={accounts.length >= 4 ? 4 : accounts.length === 3 ? 3 : 2}>
            {accounts.map((acc) => (
              <Metric
                key={acc.id}
                label={acc.nombre}
                value={formatByCurrency(balanceOf(acc.id), acc.moneda)}
                sub={`${acc.tipo === 'banco' ? 'Cuenta bancaria' : 'Caja de efectivo'} · ${acc.moneda}`}
              />
            ))}
          </MetricStrip>
        )}

        {/* RESUMEN DEL DÍA: qué se vendió hoy y por qué canal debería haber
            entrado el dinero. Es la referencia para cuadrar contra las cuentas. */}
        {resumen && resumen.ventas.count > 0 && (
          <div className="border-b border-border">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
              <h2 className="text-sm font-semibold text-foreground">Resumen de hoy</h2>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{resumen.ventas.count}</span>{' '}
                {resumen.ventas.count === 1 ? 'venta' : 'ventas'} ·{' '}
                <span className="font-semibold text-foreground tabular-nums">{formatByCurrency(resumen.ventas.total)}</span> vendido ·
                movimientos{' '}
                <span className="font-semibold text-success">+{formatByCurrency(resumen.caja.ingresos)}</span>{' '}
                <span className="font-semibold text-foreground">−{formatByCurrency(resumen.caja.egresos)}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4">
              <SummaryTile label="En efectivo" hint="Debe estar en tu caja" value={formatByCurrency(resumen.ventas.efectivo)} />
              <SummaryTile label="Transferencia" hint="Debe estar en un banco" value={formatByCurrency(resumen.ventas.transferencia)} />
              <SummaryTile label="Tarjeta" hint="Debe estar en un banco" value={formatByCurrency(resumen.ventas.tarjeta)} />
              <SummaryTile label="Sin definir" hint="Ventas sin factura, revisalas" value={formatByCurrency(resumen.ventas.sinDefinir)} muted />
            </div>
          </div>
        )}

        <div className="p-4">
          <QueryState loading={isLoadingMov || isLoadingAcc} onRetry={refetch}>
            <DataTable
              columns={columns}
              data={filteredMovements}
              hideSearch
              tableId="caja-movimientos"
              emptyText="Todavía no hay movimientos registrados."
              emptyFilteredText="Ningún movimiento coincide con la búsqueda o los filtros."
              onClearFilters={() => {
                setSearch('');
                setAccountFilter('all');
                setTipoFilter('all');
              }}
            />
          </QueryState>
        </div>
      </Workspace>

      {closures.length > 0 && (
        <section className="rounded-card border border-border bg-card">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Últimos cierres</h2>
          </header>
          <div className="divide-y divide-border">
            {closures.slice(0, 6).map((c) => {
              const cuadra = Math.abs(c.diferencia) < 0.01;
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-[7rem] font-medium text-foreground">{accName(c.account_id)}</span>
                  <span className="text-muted-foreground tabular-nums">{formatLongDate(c.fecha)}</span>
                  <span className="text-muted-foreground">
                    Esperado <span className="tabular-nums text-foreground">{formatByCurrency(c.saldo_esperado, accMonedaOf(c.account_id))}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Contado <span className="tabular-nums text-foreground">{formatByCurrency(c.saldo_contado, accMonedaOf(c.account_id))}</span>
                  </span>
                  <span
                    className={`ml-auto rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      cuadra
                        ? 'bg-success/10 text-success'
                        : c.diferencia > 0
                          ? 'bg-info/10 text-info'
                          : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {cuadra
                      ? 'Cuadró'
                      : `${c.diferencia > 0 ? 'Sobrante ' : 'Faltante '}${formatByCurrency(Math.abs(c.diferencia), accMonedaOf(c.account_id))}`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <MovementDialog
        open={isMovOpen}
        onOpenChange={setIsMovOpen}
        accounts={activeAccounts}
        expenseCategories={expenseCategories}
      />
      <AccountDialog open={isAccOpen} onOpenChange={setIsAccOpen} />
      <TransferDialog open={isTransferOpen} onOpenChange={setIsTransferOpen} accounts={activeAccounts} />
      <ClosureDialog
        open={isClosureOpen}
        onOpenChange={setIsClosureOpen}
        accounts={activeAccounts}
        balanceOf={balanceOf}
        cashSalesToday={resumen?.ventas.efectivo}
      />

      {/* MODAL CATEGORÍAS DE GASTO */}
      <Dialog open={isCatsOpen} onOpenChange={setIsCatsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorías de gasto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field data-invalid={!!catError}>
            <div className="flex gap-2">
              <Input
                placeholder="Nueva categoría (ej. Combustible)"
                aria-label="Nueva categoría"
                aria-invalid={!!catError}
                value={newCat}
                onChange={e => { setNewCat(e.target.value); setCatError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }}
              />
                <Button type="button" variant="outline" onClick={addCat} aria-label="Agregar categoría">
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
              </Button>
            </div>
            {catError && <FieldError>{catError}</FieldError>}
            </Field>
            {catDraft.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay categorías. Agregá la primera arriba.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {catDraft.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-muted px-3 py-1 text-sm text-foreground">
                    {c}
                    <button
                      type="button"
                      onClick={() => setCatDraft(prev => prev.filter(x => x !== c))}
                      aria-label={`Quitar ${c}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <HugeIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" disabled={isSavingCats} onClick={handleSaveCategories}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// Celda del resumen del día: monto grande + etiqueta + pista de dónde debería
// estar ese dinero. `muted` atenúa el bucket "sin definir", que no es un logro.
function SummaryTile({
  label,
  hint,
  value,
  muted,
}: {
  label: string;
  hint: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="px-5 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-bold tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
