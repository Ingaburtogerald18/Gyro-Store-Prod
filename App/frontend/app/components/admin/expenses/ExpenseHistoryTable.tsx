import React, { useState } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  Calendar03Icon,
  Delete01Icon,
  FilterIcon,
  FolderLibraryIcon,
  Search01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatCordobas, errMsg } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import {
  useGetExpensesListQuery,
  useDeleteExpenseMutation,
  type ExpenseItem,
} from '~/store/api/reportsApi';

const POZO_BADGES: Record<string, { label: string; className: string }> = {
  publicidad: {
    label: 'Publicidad',
    className: 'bg-muted text-muted-foreground border-border',
  },
  mantenimiento: {
    label: 'Mantenimiento',
    className: 'bg-muted text-muted-foreground border-border',
  },
  utiles: {
    label: 'Útiles',
    className: 'bg-muted text-muted-foreground border-border',
  },
  garantias: {
    label: 'Garantías',
    className: 'bg-muted text-muted-foreground border-border',
  },
  prestamos: {
    label: 'Préstamos',
    className: 'bg-muted text-muted-foreground border-border',
  },
  suscripciones: {
    label: 'Suscripciones',
    className: 'bg-muted text-muted-foreground border-border',
  },
  servicios: {
    label: 'Servicios',
    className: 'bg-muted text-muted-foreground border-border',
  },
  salario: {
    label: 'Salario',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function ExpenseHistoryTable({
  selectedPozo,
  onPozoChange,
  startDate,
  endDate,
}: {
  selectedPozo?: string;
  onPozoChange: (pozo: string) => void;
  startDate?: string;
  endDate?: string;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseItem | null>(null);

  const { data, isLoading, isFetching } = useGetExpensesListQuery({
    pozo: selectedPozo && selectedPozo !== 'todos' ? selectedPozo : undefined,
    desde: startDate,
    hasta: endDate,
    page,
    pageSize,
  });

  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation();

  const expenses = data?.expenses ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatMoney = (n: number) => formatCordobas(n, 'C$', 2);

  const handleDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await deleteExpense(expenseToDelete.id).unwrap();
      toast.success('Gasto eliminado exitosamente.');
      setExpenseToDelete(null);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo eliminar el gasto.'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Historial de gastos</h3>
          <p className="text-xs text-muted-foreground">
            {total} gasto{total === 1 ? '' : 's'} registrado{total === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select
              value={selectedPozo || 'todos'}
              onValueChange={(val) => {
                onPozoChange(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <HugeIcon icon={FilterIcon} size={14} strokeWidth={2} className="text-muted-foreground" aria-hidden />
                  <SelectValue placeholder="Filtrar por pozo" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los pozos</SelectItem>
                <SelectItem value="publicidad">Publicidad</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="utiles">Útiles de oficina</SelectItem>
                <SelectItem value="garantias">Garantías</SelectItem>
                <SelectItem value="prestamos">Préstamos</SelectItem>
                <SelectItem value="suscripciones">Suscripciones</SelectItem>
                <SelectItem value="servicios">Servicios básicos</SelectItem>
                <SelectItem value="salario">Fondo salario</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table container */}
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Pozo</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3">Registrado por</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading || isFetching ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Spinner />
                      <span>Cargando gastos...</span>
                    </div>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <HugeIcon icon={FolderLibraryIcon} size={20} className="text-muted-foreground" aria-hidden />
                      </div>
                      <p className="text-sm font-medium text-foreground">No hay gastos registrados</p>
                      <p className="text-xs max-w-sm text-muted-foreground">
                        {selectedPozo && selectedPozo !== 'todos'
                          ? `No se encontraron gastos para el pozo seleccionado en este periodo.`
                          : `Los gastos registrados aparecerán aquí y se descontarán del presupuesto de su pozo correspondiente.`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                expenses.map((item) => {
                  const badge = POZO_BADGES[item.pozo] || {
                    label: item.pozo,
                    className: 'bg-muted text-muted-foreground',
                  };
                  const dateFormatted = new Date(item.createdAt).toLocaleDateString('es-NI', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <tr key={item.id} className="hover:bg-accent/30 transition-colors">
                      {/* Fecha */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground font-medium">
                        {dateFormatted}
                      </td>

                      {/* Pozo Badge */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium border',
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3 text-xs font-medium text-foreground">
                        {item.category}
                      </td>

                      {/* Descripción */}
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-muted-foreground" title={item.description || ''}>
                        {item.description || '—'}
                      </td>

                      {/* Monto */}
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-foreground nums">
                        <span className="font-semibold">{formatMoney(item.monto)}</span>
                        {item.montoUsd != null && (
                          <span className="block text-2xs text-muted-foreground">
                            ${item.montoUsd.toFixed(2)} USD × {item.exchangeRate}
                          </span>
                        )}
                      </td>

                      {/* Registrado por */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <HugeIcon icon={UserIcon} size={13} strokeWidth={2} className="text-muted-foreground shrink-0" aria-hidden />
                          <span className="truncate max-w-[140px]">
                            {item.createdByName || item.createdByEmail || 'Admin'}
                          </span>
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {item.source === 'loan_payment' ? (
                          // Pago de la tabla vieja de préstamos: cuenta como gasto de
                          // Préstamos, pero se edita recién cuando se migre a gastos.
                          <span className="text-2xs text-muted-foreground" title="Pago de préstamo registrado antes de que los préstamos fueran gastos. Se podrá editar cuando se migre.">
                            Registro anterior
                          </span>
                        ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpenseToDelete(item)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Eliminar gasto"
                        >
                          <HugeIcon icon={Delete01Icon} size={15} strokeWidth={2} aria-hidden />
                        </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              Página {page} de {totalPages} ({total} registros)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="h-7 text-xs"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-7 text-xs"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!expenseToDelete} onOpenChange={(open) => !open && setExpenseToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar este gasto?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El monto de{' '}
              <strong>{expenseToDelete ? formatMoney(expenseToDelete.monto) : ''}</strong> se devolverá
              al saldo disponible del pozo {expenseToDelete?.pozo}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setExpenseToDelete(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner className="mr-2" /> : null}
              Eliminar gasto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
