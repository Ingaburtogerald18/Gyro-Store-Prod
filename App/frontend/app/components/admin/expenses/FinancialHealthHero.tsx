import React from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  Alert02Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Coins02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { ExpensesOverflowResponse } from '~/store/api/reportsApi';

export function FinancialHealthHero({
  data,
  isLoading,
  monthLabel,
}: {
  data?: ExpensesOverflowResponse;
  isLoading?: boolean;
  monthLabel?: string;
}) {
  const gananciaBruta = data?.gananciaBruta ?? 0;
  const totalDesbordamiento = data?.totalDesbordamiento ?? 0;
  const gananciaReal = data?.gananciaReal ?? 0;
  const totalRecogido = data?.totalRecogido ?? 0;
  const totalGastado = data?.totalGastado ?? 0;
  const presupuestoDisponible = data?.presupuestoDisponible ?? 0;
  const hasOverflow = totalDesbordamiento > 0;

  const percentUsed = totalRecogido > 0
    ? Math.min(100, Math.round((totalGastado / totalRecogido) * 100))
    : totalGastado > 0 ? 100 : 0;

  const fmt = (n: number) => formatCordobas(n, 'C$', 2);

  return (
    <div className="space-y-6">
      {/* ── Presupuesto operativo (medidor único) ── */}
      <div className="relative overflow-hidden rounded-card border border-border bg-card p-6 shadow-sm">
        <div
          className={cn(
            'pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-10 blur-3xl',
            hasOverflow ? 'bg-destructive' : 'bg-primary-2',
          )}
        />

        <div className="relative z-10">
          {/* Header badges */}
          <div className="flex items-center gap-2 mb-4">
            <span className="flex h-6 items-center gap-1.5 rounded-full bg-primary-2/10 px-2.5 text-[11px] font-medium text-primary-2">
              <HugeIcon icon={Coins01Icon} size={14} strokeWidth={2} aria-hidden />
              Presupuesto Operativo {monthLabel ? `· ${monthLabel}` : ''}
            </span>
            {hasOverflow ? (
              <span className="flex h-6 items-center gap-1 rounded-full bg-destructive/10 px-2.5 text-[11px] font-medium text-destructive border border-destructive/20">
                <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
                Excedido
              </span>
            ) : (
              <span className="flex h-6 items-center gap-1 rounded-full bg-success/10 px-2.5 text-[11px] font-medium text-success border border-success/20">
                <HugeIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={2} aria-hidden />
                {percentUsed}% usado
              </span>
            )}
          </div>

          {/* Main layout: budget meter + sub-metrics */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            {/* Left: budget meter */}
            <div className="flex-1 space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Disponible</p>
                  <span
                    className={cn(
                      'nums text-3xl font-bold tracking-tight sm:text-4xl',
                      presupuestoDisponible >= 0
                        ? 'text-success'
                        : 'text-destructive',
                    )}
                  >
                    {isLoading ? 'C$ …' : fmt(presupuestoDisponible)}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">de</p>
                  <span className="nums text-lg font-semibold text-foreground">
                    {isLoading ? '…' : fmt(totalRecogido)}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    hasOverflow
                      ? 'bg-destructive'
                      : percentUsed > 80
                      ? 'bg-warning'
                      : 'bg-success',
                  )}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>

              {/* Recogido / Gastado summary */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Recogido de ventas: <span className="nums font-medium text-foreground">{fmt(totalRecogido)}</span></span>
                <span>Gastado: <span className="nums font-medium text-foreground">{fmt(totalGastado)}</span></span>
              </div>
            </div>

            {/* Right: Ganancia Real */}
            <div className="lg:w-[220px] rounded-card border border-border/70 bg-card/60 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Ganancia Real</span>
                <HugeIcon icon={Coins02Icon} size={14} strokeWidth={2} className="text-muted-foreground" aria-hidden />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={cn(
                    'nums text-2xl font-bold',
                    gananciaReal > 0
                      ? 'text-success'
                      : gananciaReal < 0
                      ? 'text-destructive'
                      : 'text-foreground',
                  )}
                >
                  {isLoading ? '…' : fmt(gananciaReal)}
                </span>
                {gananciaReal >= 0 ? (
                  <HugeIcon icon={ArrowUp01Icon} size={14} strokeWidth={2} className="text-success" aria-hidden />
                ) : (
                  <HugeIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} className="text-destructive" aria-hidden />
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ganancia bruta: {fmt(gananciaBruta)}
              </p>
              {hasOverflow && (
                <p className="text-[11px] text-destructive font-medium">
                  Excedente: -{fmt(totalDesbordamiento)}
                </p>
              )}
            </div>
          </div>

          {/* Overflow alert */}
          {hasOverflow && (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <HugeIcon icon={Alert02Icon} size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
                <p>
                  Los gastos superaron el presupuesto por <strong>{fmt(totalDesbordamiento)}</strong>.
                  Este excedente se descuenta de la ganancia bruta del mes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
