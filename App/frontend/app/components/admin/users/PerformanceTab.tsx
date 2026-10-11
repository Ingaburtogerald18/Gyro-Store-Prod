// Tab de rendimiento del empleado (extraída de admin.usuarios.tsx). Consulta la
// comisión por estado de venta y la muestra en cuatro StatCard.
import { HugeIcon } from "~/components/ui/icon";
import { PieChartIcon } from "@hugeicons/core-free-icons";
import { useGetUserPerformanceQuery } from "~/store/api/usersApi";
import { StatCard } from "~/components/ui/stat-card";
import { QueryState } from "~/components/ui/QueryState";
import { BrandLoader } from "~/components/ui/module-loader";
import { formatCordobas } from "~/lib/formatters";

export function PerformanceTab({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useGetUserPerformanceQuery(userId);

  return (
    <QueryState
      loading={isLoading}
      error={isError}
      empty={!data}
      loadingFallback={
        <div className="flex justify-center p-8">
          <BrandLoader text="Cargando rendimiento..." />
        </div>
      }
      emptyFallback={
        <div className="p-8 text-center text-muted-foreground">
          <HugeIcon icon={PieChartIcon} size={32} strokeWidth={2} className="mx-auto mb-2 opacity-50" aria-hidden />
          Sin datos de rendimiento disponibles.
        </div>
      }
    >
      {data && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <StatCard
            label="Pendientes"
            color="amber"
            countTo={data.pendingApproval.comision}
            format={(n) => formatCordobas(n, "C$", 2)}
            sub={`${data.pendingApproval.count} ventas`}
            hint="Comisión de ventas pendientes de aprobación"
            delay={0}
          />
          <StatCard
            label="Aprobadas"
            color="neutral"
            countTo={data.approvedUnpaid.comision}
            format={(n) => formatCordobas(n, "C$", 2)}
            sub={`${data.approvedUnpaid.count} ventas`}
            hint="Comisión de ventas aprobadas sin pagar"
            delay={0.05}
          />
          <StatCard
            label="Pagadas"
            color="sky"
            countTo={data.paid.comision}
            format={(n) => formatCordobas(n, "C$", 2)}
            sub={`${data.paid.count} ventas`}
            hint="Comisión de ventas ya pagadas"
            delay={0.1}
          />
          <StatCard
            label="Balance"
            color="indigo"
            countTo={data.balance}
            format={(n) => formatCordobas(n, "C$", 2)}
            hint="Ajustes pendientes de liquidar en el próximo corte"
            delay={0.15}
          />
        </div>
      )}
    </QueryState>
  );
}
