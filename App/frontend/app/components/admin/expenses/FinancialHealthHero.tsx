import React from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  Alert02Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Coins02Icon,
} from '@hugeicons/core-free-icons';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { MonthLedger } from '~/store/api/reportsApi';

/**
 * Resumen del mes según las reglas de pozos (Docs/reporteria-reglas.md):
 * presupuesto de los pozos (heredado + recogido + bolsa extra), lo gastado, lo
 * que queda, y la Ganancia real (la misma cifra que el KPI de Reportería).
 * El fondo salario va aparte: es intocable en el mes.
 */
export function FinancialHealthHero({
  data,
  isLoading,
  monthLabel,
}: {
  data?: MonthLedger;
  isLoading?: boolean;
  monthLabel?: string;
}) {
  const fmt = (n: number) => formatCordobas(n, 'C$', 2);
  const pozos = (data?.pozos ?? []).filter((p) => p.pozo !== 'salario');
  const salario = data?.pozos.find((p) => p.pozo === 'salario');

  const heredado = pozos.reduce((s, p) => s + p.heredado, 0);
  const recogido = pozos.reduce((s, p) => s + p.recogido, 0);
  const extraInicio = data?.extraInicio ?? 0;
  const presupuesto = heredado + recogido + extraInicio;
  const gastado = pozos.reduce((s, p) => s + p.gastado, 0);
  const extraRestante = extraInicio - (data?.extraUsado ?? 0);
  const disponible = pozos.reduce((s, p) => s + p.saldoFinal, 0) + extraRestante;

  const deGanancia = data?.deGanancia.total ?? 0;
  const gananciaTienda = data?.gananciaTienda ?? 0;
  const gananciaReal = data?.gananciaReal ?? 0;
  const excedido = deGanancia > 0;

  const percentUsed = presupuesto > 0 ? Math.min(100, (gastado / presupuesto) * 100) : gastado > 0 ? 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex h-6 items-center gap-1.5 rounded-full bg-primary-2/10 px-2.5 text-2xs font-medium text-primary-2">
          <HugeIcon icon={Coins01Icon} size={14} strokeWidth={2} aria-hidden />
          Presupuesto operativo {monthLabel ? `· ${monthLabel}` : ''}
        </span>
        {excedido ? (
          <span className="flex h-6 items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 text-2xs font-medium text-destructive">
            <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
            Tomó de la ganancia
          </span>
        ) : (
          <span className="flex h-6 items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 text-2xs font-medium text-success">
            <HugeIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={2} aria-hidden />
            {Math.round(percentUsed)}% usado
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
        {/* Presupuesto de los pozos */}
        <div className="flex-1 space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Disponible para el mes siguiente</p>
              <span className="nums font-display text-3xl font-bold tracking-tight text-success sm:text-4xl">
                {isLoading ? 'C$ …' : fmt(disponible)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">de</p>
              <span className="nums text-lg font-semibold text-foreground">{isLoading ? '…' : fmt(presupuesto)}</span>
            </div>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                excedido ? 'bg-destructive' : percentUsed > 80 ? 'bg-warning' : 'bg-success',
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
            <div>
              <dt>Heredado</dt>
              <dd className="nums font-medium text-foreground">{fmt(heredado)}</dd>
            </div>
            <div>
              <dt>Recogido de ventas</dt>
              <dd className="nums font-medium text-foreground">{fmt(recogido)}</dd>
            </div>
            <div>
              <dt>Bolsa extra</dt>
              <dd className="nums font-medium text-foreground">{fmt(extraInicio)}</dd>
            </div>
            <div>
              <dt>Gastado</dt>
              <dd className="nums font-medium text-foreground">{fmt(gastado)}</dd>
            </div>
          </dl>

          {salario && (
            <p className="text-2xs text-muted-foreground">
              Fondo salario: {fmt(salario.recogido)} recogido, {fmt(salario.gastado)} pagado.
              {data && data.sobranteSalario > 0 && (
                <> Sobran <span className="nums font-medium text-foreground">{fmt(data.sobranteSalario)}</span>, que pasan a la bolsa extra del mes siguiente.</>
              )}
            </p>
          )}
        </div>

        {/* Ganancia real */}
        <div className="rounded-2xl border border-border/70 bg-card/60 p-4 lg:w-[240px]">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Ganancia real</span>
            <HugeIcon icon={Coins02Icon} size={14} strokeWidth={2} className="text-muted-foreground" aria-hidden />
          </div>
          <span
            className={cn(
              'nums mt-1 block font-display text-2xl font-bold',
              gananciaReal > 0 ? 'text-success' : gananciaReal < 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {isLoading ? '…' : fmt(gananciaReal)}
          </span>
          <p className="mt-1 text-2xs text-muted-foreground">Ganancia tienda: {fmt(gananciaTienda)}</p>
          {excedido && (
            <p className="text-2xs font-medium text-destructive">Gastos pagados con ganancia: −{fmt(deGanancia)}</p>
          )}
        </div>
      </div>

      {data && data.deGanancia.comunes > 0 && (
        <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="flex items-start gap-2">
            <HugeIcon icon={Alert02Icon} size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
            <p>
              Los pozos se quedaron sin saldo: <strong>{fmt(data.deGanancia.comunes)}</strong> de gastos salieron de la ganancia del mes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
