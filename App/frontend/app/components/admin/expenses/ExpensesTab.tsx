import React, { useState } from 'react';
import { FinancialHealthHero } from './FinancialHealthHero';
import { PozoCardsGrid } from './PozoCardsGrid';
import { RegisterExpenseDialog } from './RegisterExpenseDialog';
import { ExpenseHistoryTable } from './ExpenseHistoryTable';
import { useGetExpensesOverflowQuery } from '~/store/api/reportsApi';

export function ExpensesTab({
  queryParams,
  monthLabel,
}: {
  queryParams?: { startDate?: string; endDate?: string };
  monthLabel?: string;
}) {
  const [selectedPozo, setSelectedPozo] = useState<string>('todos');

  const { data: overflowData, isLoading, refetch } = useGetExpensesOverflowQuery(queryParams);

  return (
    <div className="space-y-10">
      {/* Top action row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Control de Gastos y Presupuesto
          </h2>
          <p className="text-xs text-muted-foreground">
            Presupuesto consolidado del período. Registra gastos y monitorea el saldo disponible.
          </p>
        </div>

        <div>
          <RegisterExpenseDialog
            pozos={overflowData?.pozos}
            defaultPozo={selectedPozo !== 'todos' ? selectedPozo : undefined}
            onSuccess={refetch}
          />
        </div>
      </div>

      {/* Section 1: Salud Financiera (Hero) */}
      <section>
        <FinancialHealthHero
          data={overflowData}
          isLoading={isLoading}
          monthLabel={monthLabel}
        />
      </section>

      {/* Section 2: Estado de Pozos (8 tarjetas en grid) */}
      <section>
        <PozoCardsGrid
          pozos={overflowData?.pozos}
          selectedPozo={selectedPozo}
          onSelectPozo={setSelectedPozo}
          isLoading={isLoading}
        />
      </section>

      {/* Section 4: Historial de Gastos (Tabla con filtros y paginación) */}
      <section>
        <ExpenseHistoryTable
          selectedPozo={selectedPozo}
          onPozoChange={setSelectedPozo}
          startDate={queryParams?.startDate}
          endDate={queryParams?.endDate}
        />
      </section>
    </div>
  );
}
