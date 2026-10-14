// Estado de los pozos del mes: una barra por pozo, en la escala de SU
// presupuesto (heredado + recogido), con segmentos que dicen a dónde fue la
// plata y de dónde salió lo que faltó:
//
//   verde           gastado con su propio pozo
//   ámbar rayado    prestado a otros pozos que se pasaron
//   ámbar           cubierto por otros (bolsa extra u otros pozos)
//   rojo            cubierto por la ganancia
//   fondo vacío     lo que pasa al mes siguiente
//
// Si el pozo se pasó, la barra se alarga más allá de su presupuesto y una
// marca vertical señala dónde terminaba. Reglas: Docs/03-Finanzas.md §12.
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  GiftIcon,
  FilterIcon,
} from '@hugeicons/core-free-icons';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { MonthLedger, PozoLedgerRow } from '~/state/api/reports-api';

const POZO_ICONS: Record<string, typeof Megaphone01Icon> = {
  publicidad: Megaphone01Icon,
  mantenimiento: Wrench01Icon,
  utiles: FolderLibraryIcon,
  garantias: Shield01Icon,
  prestamos: BankIcon,
  suscripciones: Invoice01Icon,
  servicios: Building04Icon,
  salario: UserDollarIcon,
};

const HATCH: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, var(--color-warning) 0 3px, color-mix(in oklab, var(--color-warning) 25%, transparent) 3px 6px)',
};

interface Segment {
  key: string;
  value: number;
  className?: string;
  style?: CSSProperties;
  label: string;
}

const fmt = (n: number) => formatCordobas(n, 'C$', 2);

function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

function noteFor(row: PozoLedgerRow): ReactNode {
  const exceso = row.tomadoExtra + row.tomadoPozos + row.tomadoGanancia;
  if (row.pozo === 'salario') {
    if (row.tomadoGanancia > 0) return <>Se pasó {fmt(row.tomadoGanancia)}; se cubrió con <span className="text-destructive">la ganancia</span>.</>;
    return row.saldoFinal > 0 ? <>Sobran {fmt(row.saldoFinal)}: pasan a la bolsa extra del mes siguiente.</> : <>Sin sobrante este mes.</>;
  }
  if (exceso > 0) {
    const fuentes: string[] = [];
    if (row.tomadoExtra > 0) fuentes.push(`la bolsa extra (${fmt(row.tomadoExtra)})`);
    if (row.tomadoPozos > 0) fuentes.push(`otros pozos (${fmt(row.tomadoPozos)})`);
    if (row.tomadoGanancia > 0) fuentes.push(`la ganancia (${fmt(row.tomadoGanancia)})`);
    return (
      <>
        Se pasó <span className="font-medium text-foreground">{fmt(exceso)}</span>; se cubrió con{' '}
        <span className={row.tomadoGanancia > 0 ? 'text-destructive' : undefined}>{joinEs(fuentes)}</span>.
      </>
    );
  }
  const partes: string[] = [];
  if (row.prestado > 0) partes.push(`Prestó ${fmt(row.prestado)} a otros pozos`);
  partes.push(row.saldoFinal > 0 ? `pasan ${fmt(row.saldoFinal)} al mes siguiente` : 'no queda saldo');
  const txt = partes.join('; ');
  return <>{txt.charAt(0).toUpperCase() + txt.slice(1)}.</>;
}

function segmentsFor(row: PozoLedgerRow): { segments: Segment[]; total: number; budget: number } {
  const budget = row.pozo === 'salario' ? row.recogido : row.heredado + row.recogido;
  const sePaso = row.disponible < 0;
  const propio = sePaso ? budget : row.gastado;
  const segments: Segment[] = [
    { key: 'propio', value: propio, className: 'bg-success', label: 'Gastado con su pozo' },
    { key: 'prestado', value: row.prestado, style: HATCH, label: 'Prestado a otros pozos' },
    { key: 'otros', value: row.tomadoExtra + row.tomadoPozos, className: 'bg-warning', label: 'Cubierto por otros' },
    { key: 'ganancia', value: row.tomadoGanancia, className: 'bg-destructive', label: 'Cubierto por la ganancia' },
  ].filter((s) => s.value > 0.004);
  return { segments, total: Math.max(budget, row.gastado, 0.01), budget };
}

function Bar({ segments, total, budget, animKey }: { segments: Segment[]; total: number; budget: number; animKey: string }) {
  const reduce = useReducedMotion();
  const overflow = budget > 0 && budget < total - 0.004;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        key={animKey}
        className="flex h-full w-full"
        style={{ originX: 0 }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${fmt(s.value)}`}
            className={cn('h-full', s.className)}
            style={{ width: `${(s.value / total) * 100}%`, ...s.style }}
          />
        ))}
      </motion.div>
      {overflow && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-foreground/70"
          style={{ left: `${(budget / total) * 100}%` }}
          title={`Presupuesto: ${fmt(budget)}`}
        />
      )}
    </div>
  );
}

const LEGEND: { label: string; className?: string; style?: CSSProperties }[] = [
  { label: 'Gastado con su pozo', className: 'bg-success' },
  { label: 'Prestado a otros', style: HATCH },
  { label: 'Cubierto por otros', className: 'bg-warning' },
  { label: 'Cubierto por la ganancia', className: 'bg-destructive' },
  { label: 'Pasa al mes siguiente', className: 'bg-muted ring-1 ring-inset ring-border' },
];

export function PozoFlowBars({
  ledger,
  isLoading,
  selectedPozo,
  onSelectPozo,
  className,
}: {
  ledger?: MonthLedger;
  isLoading?: boolean;
  /** Con `onSelectPozo`, cada fila filtra el historial de gastos (pestaña Gastos). */
  selectedPozo?: string;
  onSelectPozo?: (pozo: string) => void;
  className?: string;
}) {
  const rows = ledger?.pozos ?? [];
  const animKey = ledger?.month ?? 'none';

  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Estado de los pozos</h3>
          <p className="text-xs text-muted-foreground">
            Cada barra es el presupuesto del pozo (heredado + lo que aportaron las ventas). La marca indica dónde terminaba si se pasó.
          </p>
        </div>
        {onSelectPozo && selectedPozo && selectedPozo !== 'todos' && (
          <button
            type="button"
            onClick={() => onSelectPozo('todos')}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1 text-xs font-medium text-primary-2 transition-colors hover:bg-accent"
          >
            <HugeIcon icon={FilterIcon} size={13} strokeWidth={2} aria-hidden />
            Mostrar todos
          </button>
        )}
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-2xs text-muted-foreground" aria-label="Leyenda">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2.5 rounded-sm', l.className)} style={l.style} />
            {l.label}
          </li>
        ))}
      </ul>

      {isLoading && rows.length === 0 ? (
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <div className="divide-y divide-border/70">
          {rows.map((row) => {
            const { segments, total, budget } = segmentsFor(row);
            const Icon = POZO_ICONS[row.pozo] ?? FolderLibraryIcon;
            const selectable = !!onSelectPozo;
            const selected = selectedPozo === row.pozo;
            const toggle = () => onSelectPozo?.(selected ? 'todos' : row.pozo);
            return (
              <div
                key={row.pozo}
                {...(selectable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: toggle,
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle();
                        }
                      },
                      'aria-pressed': selected,
                    }
                  : {})}
                className={cn(
                  'flex items-start gap-3 px-2 py-3',
                  selectable && 'cursor-pointer rounded-xl transition-colors hover:bg-accent/40',
                  selected && 'bg-primary-2/10 ring-1 ring-primary-2',
                )}
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <HugeIcon icon={Icon} size={15} strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-medium text-foreground">{row.label}</span>
                    <span className="nums text-xs text-muted-foreground">
                      <span className={cn('font-display font-semibold', row.disponible < 0 ? 'text-destructive' : 'text-foreground')}>
                        {fmt(row.gastado)}
                      </span>{' '}
                      de {fmt(budget)}
                      {row.heredado > 0 && <span className="hidden sm:inline"> · {fmt(row.heredado)} heredado</span>}
                    </span>
                  </div>
                  <Bar segments={segments} total={total} budget={budget} animKey={animKey} />
                  <p className="text-2xs text-muted-foreground">{noteFor(row)}</p>
                </div>
              </div>
            );
          })}

          {ledger && (
            <div className="flex items-start gap-3 px-2 py-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <HugeIcon icon={GiftIcon} size={15} strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium text-foreground">Bolsa extra</span>
                  <span className="nums text-xs text-muted-foreground">
                    <span className="font-display font-semibold text-foreground">{fmt(ledger.extraUsado)}</span> usada de {fmt(ledger.extraInicio)}
                  </span>
                </div>
                <Bar
                  segments={ledger.extraUsado > 0 ? [{ key: 'usado', value: ledger.extraUsado, className: 'bg-warning', label: 'Usada por pozos que se pasaron' }] : []}
                  total={Math.max(ledger.extraInicio, 0.01)}
                  budget={ledger.extraInicio}
                  animKey={animKey}
                />
                <p className="text-2xs text-muted-foreground">
                  Sobrantes de salario de meses anteriores. Para el mes siguiente quedan{' '}
                  <span className="nums font-medium text-foreground">{fmt(ledger.extraSiguiente)}</span>
                  {ledger.sobranteSalario > 0 && <> (incluye {fmt(ledger.sobranteSalario)} que sobraron del salario este mes)</>}.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
