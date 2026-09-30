import React from 'react';
import { HugeIcon } from '~/components/ui/icon';
import {
  Megaphone01Icon,
  Wrench01Icon,
  FolderLibraryIcon,
  Shield01Icon,
  BankIcon,
  Invoice01Icon,
  Building04Icon,
  UserDollarIcon,
  FilterIcon,
} from '@hugeicons/core-free-icons';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { PozoOverflowItem } from '~/store/api/reportsApi';

const POZO_ICONS: Record<string, any> = {
  publicidad: Megaphone01Icon,
  mantenimiento: Wrench01Icon,
  utiles: FolderLibraryIcon,
  garantias: Shield01Icon,
  prestamos: BankIcon,
  suscripciones: Invoice01Icon,
  servicios: Building04Icon,
  salario: UserDollarIcon,
};

const POZO_COLORS: Record<string, string> = {
  publicidad: 'bg-tone-sky',
  mantenimiento: 'bg-warning',
  utiles: 'bg-tone-emerald',
  garantias: 'bg-tone-purple',
  prestamos: 'bg-tone-indigo',
  suscripciones: 'bg-tone-rose',
  servicios: 'bg-muted-foreground',
  salario: 'bg-success',
};

export function PozoCardsGrid({
  pozos,
  selectedPozo,
  onSelectPozo,
  isLoading,
}: {
  pozos?: PozoOverflowItem[];
  selectedPozo?: string;
  onSelectPozo: (pozo: string) => void;
  isLoading?: boolean;
}) {
  const fmt = (n: number) => formatCordobas(n, 'C$', 0);

  const totalRecogido = pozos?.reduce((sum, p) => sum + p.recogido, 0) ?? 0;
  const totalGastado = pozos?.reduce((sum, p) => sum + p.gastado, 0) ?? 0;

  const sorted = pozos
    ? [...pozos].sort((a, b) => b.recogido - a.recogido)
    : [];

  return (
    <div className="space-y-6">
      {/* ── Distribución de lo recogido ── */}
      <div className="rounded-card border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Distribución del presupuesto</h3>
            <p className="text-xs text-muted-foreground">
              Lo que generaron las ventas para cada categoría este período.
            </p>
          </div>
          {selectedPozo && selectedPozo !== 'todos' && (
            <button
              type="button"
              onClick={() => onSelectPozo('todos')}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-primary-2 hover:bg-accent transition-colors"
            >
              <HugeIcon icon={FilterIcon} size={13} strokeWidth={2} aria-hidden />
              Mostrar todos
            </button>
          )}
        </div>

        <div className="space-y-3">
          {sorted.map((item) => {
            const IconComponent = POZO_ICONS[item.pozo] || FolderLibraryIcon;
            const barColor = POZO_COLORS[item.pozo] || 'bg-muted-foreground';
            const percentOfTotal = totalRecogido > 0
              ? Math.round((item.recogido / totalRecogido) * 100)
              : 0;
            const isSelected = selectedPozo === item.pozo;

            return (
              <div
                key={item.pozo}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPozo(isSelected ? 'todos' : item.pozo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPozo(isSelected ? 'todos' : item.pozo);
                  }
                }}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-primary-2/10 ring-1 ring-primary-2'
                    : 'hover:bg-accent/40',
                )}
              >
                {/* Icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <HugeIcon icon={IconComponent} size={15} strokeWidth={2} aria-hidden />
                </div>

                {/* Label + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="nums text-xs font-semibold text-foreground">
                        {fmt(item.recogido)}
                      </span>
                      <span className="nums text-2xs text-muted-foreground">
                        {percentOfTotal}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', barColor)}
                      style={{ width: `${percentOfTotal}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Gastos por categoría ── */}
      {totalGastado > 0 && (
        <div className="rounded-card border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Gastos por categoría</h3>
            <p className="text-xs text-muted-foreground">
              Cuánto se ha gastado de cada categoría este período.
            </p>
          </div>

          <div className="space-y-2">
            {sorted
              .filter((item) => item.gastado > 0)
              .sort((a, b) => b.gastado - a.gastado)
              .map((item) => {
                const percentOfGastado = totalGastado > 0
                  ? Math.round((item.gastado / totalGastado) * 100)
                  : 0;
                const barColor = POZO_COLORS[item.pozo] || 'bg-muted-foreground';

                return (
                  <div key={item.pozo} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">
                      {item.label}
                    </span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500 opacity-60', barColor)}
                        style={{ width: `${percentOfGastado}%` }}
                      />
                    </div>
                    <span className="nums text-xs font-medium text-foreground shrink-0 w-20 text-right">
                      {fmt(item.gastado)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
