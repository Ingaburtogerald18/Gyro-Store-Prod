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
import type { PozoLedgerRow } from '~/store/api/reportsApi';

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

/**
 * Estado de cada pozo en el mes: presupuesto (heredado + recogido), gastado,
 * de dónde se cubrió lo que se pasó y lo que hereda el mes siguiente.
 */
export function PozoCardsGrid({
  pozos,
  selectedPozo,
  onSelectPozo,
  isLoading,
}: {
  pozos?: PozoLedgerRow[];
  selectedPozo?: string;
  onSelectPozo: (pozo: string) => void;
  isLoading?: boolean;
}) {
  const fmt = (n: number) => formatCordobas(n, 'C$', 2);
  const rows = pozos ?? [];

  return (
    <div className="rounded-card border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Estado de los pozos</h3>
          <p className="text-xs text-muted-foreground">
            Lo heredado más lo que aportaron las ventas, lo gastado y lo que pasa al mes siguiente.
          </p>
        </div>
        {selectedPozo && selectedPozo !== 'todos' && (
          <button
            type="button"
            onClick={() => onSelectPozo('todos')}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-primary-2 transition-colors hover:bg-accent"
          >
            <HugeIcon icon={FilterIcon} size={13} strokeWidth={2} aria-hidden />
            Mostrar todos
          </button>
        )}
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="h-64 animate-pulse rounded-card bg-muted" />
      ) : (
        <div className="space-y-1">
          {rows.map((item) => {
            const IconComponent = POZO_ICONS[item.pozo] || FolderLibraryIcon;
            const presupuesto = item.heredado + item.recogido;
            const pctUsado = presupuesto > 0 ? Math.min(100, (item.gastado / presupuesto) * 100) : item.gastado > 0 ? 100 : 0;
            const sePaso = item.disponible < 0;
            const isSelected = selectedPozo === item.pozo;
            const cubierto: string[] = [];
            if (item.tomadoExtra > 0) cubierto.push(`${fmt(item.tomadoExtra)} de la bolsa extra`);
            if (item.tomadoPozos > 0) cubierto.push(`${fmt(item.tomadoPozos)} de otros pozos`);
            if (item.tomadoGanancia > 0) cubierto.push(`${fmt(item.tomadoGanancia)} de la ganancia`);

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
                  'group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors',
                  isSelected ? 'bg-primary-2/10 ring-1 ring-primary-2' : 'hover:bg-accent/40',
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <HugeIcon icon={IconComponent} size={15} strokeWidth={2} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-foreground">{item.label}</span>
                    <span className="nums shrink-0 text-xs text-muted-foreground">
                      <span className={cn('font-semibold', sePaso ? 'text-destructive' : 'text-foreground')}>{fmt(item.gastado)}</span>
                      {' '}de {fmt(presupuesto)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', sePaso ? 'bg-destructive' : 'bg-primary')}
                      style={{ width: `${pctUsado}%` }}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-2xs text-muted-foreground">
                    <span>
                      {item.heredado > 0 && <>Heredado {fmt(item.heredado)} · </>}
                      Recogido {fmt(item.recogido)}
                      {cubierto.length > 0 && <span className="text-destructive"> · Se pasó: {cubierto.join(', ')}</span>}
                      {item.prestado > 0 && <> · Prestó {fmt(item.prestado)}</>}
                    </span>
                    <span className="nums">
                      {item.pozo === 'salario' ? 'Sobra' : 'Pasa al mes siguiente'}:{' '}
                      <span className="font-medium text-foreground">{fmt(item.saldoFinal)}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
