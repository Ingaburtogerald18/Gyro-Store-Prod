import { HugeIcon } from "~/components/ui/icon";
import {
  Add01Icon,
  ArrowDownRight01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  LockIcon,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Label } from '~/components/ui/label';
import { toast } from 'sonner';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import { StatCard } from '~/components/ui/stat-card';
import {
  useGetAccountsQuery,
  useGetMovementsQuery,
  useRegisterMovementMutation,
  useCreateAccountMutation,
  useGetCuadreQuery,
  useGetDailySummaryQuery,
  useRegisterTransferMutation,
  useGetExpenseCategoriesQuery,
  useUpdateExpenseCategoriesMutation,
  useGetClosuresQuery,
  useCreateClosureMutation,
} from '~/store/api/cajaApi';
import { formatByCurrency } from '~/lib/formatters';
import { format } from 'date-fns';
import type { AccountMovement } from '@shared/schemas';

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Caja y Bancos', { admin: true }) }];
};

// Sentinela del Select de categorías: "escribir una categoría suelta" sin
// tocar el catálogo. Un string que ninguna categoría real puede tener.
const CUSTOM_CAT = '__otra__';

export default function AdminCajaRoute() {
  const { data: accounts = [], isLoading: isLoadingAcc } = useGetAccountsQuery();
  const { data: movements = [], isLoading: isLoadingMov, refetch } = useGetMovementsQuery();
  const { data: cuadre } = useGetCuadreQuery(); // Para los saldos consolidados
  const { data: resumen } = useGetDailySummaryQuery(); // Qué se vendió hoy
  const { data: expenseCategories = [] } = useGetExpenseCategoriesQuery();
  const { data: closures = [] } = useGetClosuresQuery();

  const [registerMovMut, { isLoading: isRegistering }] = useRegisterMovementMutation();
  const [createAccMut, { isLoading: isCreatingAcc }] = useCreateAccountMutation();
  const [transferMut, { isLoading: isTransferring }] = useRegisterTransferMutation();
  const [updateCatsMut, { isLoading: isSavingCats }] = useUpdateExpenseCategoriesMutation();
  const [closureMut, { isLoading: isClosing }] = useCreateClosureMutation();

  const [isMovOpen, setIsMovOpen] = useState(false);
  const [isAccOpen, setIsAccOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCatsOpen, setIsCatsOpen] = useState(false);
  const [isClosureOpen, setIsClosureOpen] = useState(false);

  // Saldo actual por cuenta (incluye saldo inicial; lo calcula el backend).
  const balanceOf = (accountId: string) =>
    cuadre?.saldosCuentas.find((s) => s.accountId === accountId)?.balance ?? 0;

  // Form states Movimiento
  const [accountId, setAccountId] = useState('');
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState('');   // texto libre (ingreso o "Otra")
  const [catSelect, setCatSelect] = useState('');   // categoría elegida del catálogo (egreso)
  const [descripcion, setDescripcion] = useState('');

  // Form states Account
  const [accNombre, setAccNombre] = useState('');
  const [accTipo, setAccTipo] = useState<'efectivo' | 'banco'>('efectivo');
  const [accMoneda, setAccMoneda] = useState('NIO');
  const [accSaldoInicial, setAccSaldoInicial] = useState('');

  // Form states Traspaso
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferMonto, setTransferMonto] = useState('');
  const [transferDesc, setTransferDesc] = useState('');

  // Form states Categorías (borrador editable en el modal)
  const [catDraft, setCatDraft] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');

  // Form states Cierre
  const [closureAccId, setClosureAccId] = useState('');
  const [closureContado, setClosureContado] = useState('');
  const [closureNotas, setClosureNotas] = useState('');

  const activeAccounts = useMemo(() => accounts.filter((a) => a.activo), [accounts]);
  const accName = (id: string) => accounts.find((a) => a.id === id)?.nombre ?? 'Desconocida';
  const accMonedaOf = (id: string) => accounts.find((a) => a.id === id)?.moneda;

  const handleRegisterMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCat =
      tipo === 'egreso' && catSelect && catSelect !== CUSTOM_CAT ? catSelect : categoria.trim();
    if (!accountId || !monto || !finalCat) {
      toast.error('Llená cuenta, monto y categoría');
      return;
    }
    try {
      await registerMovMut({
        account_id: accountId,
        tipo,
        monto: Number(monto),
        categoria: finalCat,
        descripcion: descripcion || undefined,
      }).unwrap();
      toast.success('Movimiento registrado');
      setIsMovOpen(false);
      setMonto('');
      setCategoria('');
      setCatSelect('');
      setDescripcion('');
    } catch (err: any) {
      toast.error(err.data?.error || 'Error al registrar movimiento');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accNombre) return;
    try {
      await createAccMut({
        nombre: accNombre,
        tipo: accTipo,
        moneda: accMoneda,
        saldo_inicial: accSaldoInicial ? Number(accSaldoInicial) : 0,
      }).unwrap();
      toast.success('Cuenta creada');
      setIsAccOpen(false);
      setAccNombre('');
      setAccSaldoInicial('');
    } catch (err: any) {
      toast.error(err.data?.error || 'Error al crear cuenta');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId || !transferMonto) {
      toast.error('Elegí origen, destino y monto');
      return;
    }
    if (fromId === toId) {
      toast.error('El origen y el destino deben ser distintos');
      return;
    }
    try {
      await transferMut({
        from_account_id: fromId,
        to_account_id: toId,
        monto: Number(transferMonto),
        descripcion: transferDesc || undefined,
      }).unwrap();
      toast.success('Traspaso registrado');
      setIsTransferOpen(false);
      setTransferMonto('');
      setTransferDesc('');
    } catch (err: any) {
      toast.error(err.data?.error || 'Error al registrar el traspaso');
    }
  };

  const openCategories = () => {
    setCatDraft(expenseCategories);
    setNewCat('');
    setIsCatsOpen(true);
  };

  const addCat = () => {
    const v = newCat.trim();
    if (!v) return;
    if (catDraft.some((c) => c.toLowerCase() === v.toLowerCase())) {
      toast.error('Esa categoría ya existe');
      return;
    }
    setCatDraft((prev) => [...prev, v]);
    setNewCat('');
  };

  const handleSaveCategories = async () => {
    try {
      await updateCatsMut(catDraft).unwrap();
      toast.success('Categorías guardadas');
      setIsCatsOpen(false);
    } catch (err: any) {
      toast.error(err.data?.error || 'Error al guardar categorías');
    }
  };

  const openClosure = () => {
    const preferred = activeAccounts.find((a) => a.tipo === 'efectivo') ?? activeAccounts[0];
    setClosureAccId(preferred?.id ?? '');
    setClosureContado('');
    setClosureNotas('');
    setIsClosureOpen(true);
  };

  const closureExpected = closureAccId ? balanceOf(closureAccId) : 0;
  const closureDiff =
    closureContado.trim() === '' ? null : Number(closureContado) - closureExpected;

  const handleClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closureAccId || closureContado.trim() === '') {
      toast.error('Elegí la cuenta y escribí lo que contaste');
      return;
    }
    try {
      const res = await closureMut({
        account_id: closureAccId,
        saldo_contado: Number(closureContado),
        notas: closureNotas || undefined,
      }).unwrap();
      const dif = res.diferencia;
      if (Math.abs(dif) < 0.01) {
        toast.success('Caja cuadrada — sin diferencia');
      } else if (dif > 0) {
        toast.success(`Cierre guardado. Sobrante de ${formatByCurrency(dif, accMonedaOf(closureAccId))}`);
      } else {
        toast.warning(`Cierre guardado. Faltante de ${formatByCurrency(Math.abs(dif), accMonedaOf(closureAccId))}`);
      }
      setIsClosureOpen(false);
    } catch (err: any) {
      toast.error(err.data?.error || 'Error al cerrar la caja');
    }
  };

  const columns = [
    {
      header: 'Fecha',
      accessorKey: 'ocurrio_at',
      cell: (info: any) => format(new Date(info.getValue()), 'dd/MM/yyyy HH:mm'),
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
          <span className={`inline-flex items-center gap-1 ${t === 'ingreso' ? 'text-success' : 'text-destructive'}`}>
            {t === 'ingreso' ? <HugeIcon icon={ArrowUpRight01Icon} size={16} strokeWidth={2} /> : <HugeIcon icon={ArrowDownRight01Icon} size={16} strokeWidth={2} />}
            {t.toUpperCase()}
          </span>
        );
      },
    },
    {
      header: 'Monto',
      accessorKey: 'monto',
      cell: (info: any) => {
        const mov = info.row.original as AccountMovement;
        const sign = mov.tipo === 'egreso' ? '−' : '+';
        return (
          <span className="nums">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader title="Caja y Bancos" description="Libro diario de ingresos y egresos de las cuentas." />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setIsAccOpen(true)}>Nueva Cuenta</Button>
          <Button variant="outline" onClick={openCategories}>
            <HugeIcon icon={Tag01Icon} size={16} strokeWidth={2} className="mr-2" /> Categorías
          </Button>
          <Button variant="outline" onClick={() => setIsTransferOpen(true)} disabled={activeAccounts.length < 2}>
            <HugeIcon icon={RefreshIcon} size={16} strokeWidth={2} className="mr-2" /> Traspaso
          </Button>
          <Button variant="outline" onClick={openClosure} disabled={activeAccounts.length === 0}>
            <HugeIcon icon={LockIcon} size={16} strokeWidth={2} className="mr-2" /> Cerrar día
          </Button>
          <Button onClick={() => setIsMovOpen(true)} className="shadow-sm">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" /> Registrar Movimiento
          </Button>
        </div>
      </div>

      {/* RESUMEN DEL DÍA: qué se vendió hoy y por qué canal debería haber entrado
          el dinero. Es la referencia para cuadrar contra caja y bancos. */}
      {resumen && resumen.ventas.count > 0 && (
        <section className="rounded-card border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Resumen de hoy</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground tabular-nums">{resumen.ventas.count}</span>{' '}
              {resumen.ventas.count === 1 ? 'venta' : 'ventas'} ·{' '}
              <span className="font-bold text-foreground tabular-nums">{formatByCurrency(resumen.ventas.total)}</span> vendido
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="En efectivo" hint="Debe estar en tu caja" value={formatByCurrency(resumen.ventas.efectivo)} />
            <SummaryTile label="Transferencia" hint="Debe estar en un banco" value={formatByCurrency(resumen.ventas.transferencia)} />
            <SummaryTile label="Tarjeta" hint="Debe estar en un banco" value={formatByCurrency(resumen.ventas.tarjeta)} />
            <SummaryTile
              label="Sin definir"
              hint="Ventas sin factura — revisá"
              value={formatByCurrency(resumen.ventas.sinDefinir)}
              muted
            />
          </div>

          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Movimientos de caja registrados hoy:{' '}
            <span className="font-semibold text-success">+{formatByCurrency(resumen.caja.ingresos)}</span>{' '}
            <span className="font-semibold text-destructive">−{formatByCurrency(resumen.caja.egresos)}</span>
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <StatCard
            key={acc.id}
            label={acc.nombre}
            value={formatByCurrency(balanceOf(acc.id), acc.moneda)}
            icon={Wallet01Icon}
            sub={acc.tipo === 'banco' ? 'Cuenta Bancaria' : 'Caja de Efectivo'}
          />
        ))}
      </div>

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
                  <span className="text-muted-foreground tabular-nums">{format(new Date(c.fecha), 'dd/MM/yyyy')}</span>
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
                          ? 'bg-primary/10 text-primary'
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

      <QueryState loading={isLoadingMov || isLoadingAcc} onRetry={refetch}>
        <DataTable
          columns={columns}
          data={movements}
          searchPlaceholder="Buscar en descripción..."
        />
      </QueryState>

      {/* MODAL MOVIMIENTO */}
      <Dialog open={isMovOpen} onOpenChange={setIsMovOpen}>
        <DialogContent>
          <form onSubmit={handleRegisterMovement}>
            <DialogHeader>
              <DialogTitle>Registrar Ingreso / Egreso</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Tipo de Movimiento</Label>
                <Select value={tipo} onValueChange={(v: any) => { setTipo(v); setCatSelect(''); setCategoria(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso de dinero</SelectItem>
                    <SelectItem value="egreso">Egreso / Gasto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cuenta</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Seleccioná..." /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.nombre} ({acc.moneda})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input required type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} />
              </div>

              {/* Egreso con catálogo: Select de rubros + opción de escribir uno suelto.
                  Ingreso: texto libre (depósito de venta, aporte, etc.). */}
              <div className="space-y-2">
                <Label>Categoría</Label>
                {tipo === 'egreso' && expenseCategories.length > 0 ? (
                  <>
                    <Select value={catSelect} onValueChange={setCatSelect}>
                      <SelectTrigger><SelectValue placeholder="Elegí un rubro..." /></SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_CAT}>Otra…</SelectItem>
                      </SelectContent>
                    </Select>
                    {catSelect === CUSTOM_CAT && (
                      <Input placeholder="Escribí la categoría" value={categoria} onChange={e => setCategoria(e.target.value)} />
                    )}
                  </>
                ) : (
                  <Input
                    placeholder="Ej. Depósito venta, Aporte socio…"
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Descripción (Opcional)</Label>
                <Input value={descripcion} onChange={e => setDescripcion(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isRegistering}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL CUENTA */}
      <Dialog open={isAccOpen} onOpenChange={setIsAccOpen}>
        <DialogContent>
          <form onSubmit={handleCreateAccount}>
            <DialogHeader>
              <DialogTitle>Nueva Cuenta</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input required placeholder="Ej. BAC Lafise" value={accNombre} onChange={e => setAccNombre(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={accTipo} onValueChange={(v: any) => setAccTipo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo Físico</SelectItem>
                    <SelectItem value="banco">Banco / Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Input required value={accMoneda} onChange={e => setAccMoneda(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-2">
                  <Label>Saldo inicial</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={accSaldoInicial}
                    onChange={e => setAccSaldoInicial(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                El saldo inicial es el dinero que ya tenés en esta cuenta hoy. Se suma al saldo desde el arranque.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isCreatingAcc}>Crear Cuenta</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL TRASPASO */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent>
          <form onSubmit={handleTransfer}>
            <DialogHeader>
              <DialogTitle>Traspaso entre cuentas</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Desde</Label>
                  <Select value={fromId} onValueChange={setFromId}>
                    <SelectTrigger><SelectValue placeholder="Origen..." /></SelectTrigger>
                    <SelectContent>
                      {activeAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <HugeIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} className="mb-2.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-2">
                  <Label>Hacia</Label>
                  <Select value={toId} onValueChange={setToId}>
                    <SelectTrigger><SelectValue placeholder="Destino..." /></SelectTrigger>
                    <SelectContent>
                      {activeAccounts.filter(a => a.id !== fromId).map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input required type="number" step="0.01" min="0" value={transferMonto} onChange={e => setTransferMonto(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Descripción (Opcional)</Label>
                <Input placeholder="Ej. Depósito del efectivo del día" value={transferDesc} onChange={e => setTransferDesc(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isTransferring}>Registrar traspaso</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL CATEGORÍAS DE GASTO */}
      <Dialog open={isCatsOpen} onOpenChange={setIsCatsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorías de gasto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nueva categoría (ej. Combustible)"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }}
              />
                <Button type="button" variant="outline" onClick={addCat} aria-label="Agregar producto del catálogo">
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
              </Button>
            </div>
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

      {/* MODAL CIERRE DEL DÍA */}
      <Dialog open={isClosureOpen} onOpenChange={setIsClosureOpen}>
        <DialogContent>
          <form onSubmit={handleClosure}>
            <DialogHeader>
              <DialogTitle>Cierre del día</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Cuenta a cerrar</Label>
                <Select value={closureAccId} onValueChange={setClosureAccId}>
                  <SelectTrigger><SelectValue placeholder="Seleccioná..." /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-card border border-border bg-muted/40 px-4 py-3">
                <span className="text-sm text-muted-foreground">El sistema espera</span>
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {formatByCurrency(closureExpected, accMonedaOf(closureAccId))}
                </span>
              </div>

              {/* Referencia: si estás cerrando una caja de efectivo, cuánto se
                  vendió hoy en efectivo (lo que debería haber entrado). */}
              {resumen && resumen.ventas.efectivo > 0 && accounts.find(a => a.id === closureAccId)?.tipo === 'efectivo' && (
                <p className="text-xs text-muted-foreground">
                  Referencia: hoy se vendieron{' '}
                  <span className="font-semibold text-foreground">{formatByCurrency(resumen.ventas.efectivo)}</span>{' '}
                  en efectivo. Si esas ventas no están cargadas como ingreso en esta caja, van a aparecer como sobrante.
                </p>
              )}

              <div className="space-y-2">
                <Label>¿Cuánto contaste físicamente?</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={closureContado}
                  onChange={e => setClosureContado(e.target.value)}
                  className="text-lg tabular-nums"
                />
              </div>

              {closureDiff !== null && (
                <div
                  className={`flex items-center justify-between rounded-card px-4 py-3 text-sm font-semibold ${
                    Math.abs(closureDiff) < 0.01
                      ? 'bg-success/10 text-success'
                      : closureDiff > 0
                        ? 'bg-primary/10 text-primary'
                        : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  <span>
                    {Math.abs(closureDiff) < 0.01 ? 'Cuadra perfecto' : closureDiff > 0 ? 'Sobrante' : 'Faltante'}
                  </span>
                  <span className="tabular-nums">{formatByCurrency(Math.abs(closureDiff), accMonedaOf(closureAccId))}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notas (Opcional)</Label>
                <Input placeholder="Ej. Faltó vuelto de una venta" value={closureNotas} onChange={e => setClosureNotas(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Al guardar, si hay diferencia se registra un ajuste para que el saldo quede igual a lo que contaste.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isClosing}>Guardar cierre</Button>
            </DialogFooter>
          </form>
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
    <div className="rounded-card border border-border bg-muted/30 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
