// Selector de cantidad de la ficha. Es un <input type="number"> real: escribir
// "12" es más rápido que tocar doce veces y en móvil abre el teclado numérico.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, MinusSignIcon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';

export function QuantityStepper({
  value,
  onChange,
  /** Techo real: no dejar pedir más de lo que hay. 0 = sin límite conocido. */
  max = 0,
  id = 'quantity',
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  id?: string;
}) {
  // El techo del contrato es 999 por línea (publicOrderItemInputSchema); si hay
  // stock conocido, manda el menor de los dos.
  const ceiling = max > 0 ? Math.min(max, 999) : 999;
  const clamp = (n: number) => Math.min(Math.max(Math.trunc(n) || 1, 1), ceiling);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        Cantidad
      </Label>
      <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-card p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= 1}
          aria-label="Quitar una unidad"
          className="h-11 w-11"
        >
          <HugeIcon icon={MinusSignIcon} size={14} strokeWidth={2} aria-hidden />
        </Button>

        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={ceiling}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label="Cantidad"
          // Sin flechas nativas: los botones ya cumplen esa función.
          className="h-11 w-12 bg-transparent text-center text-base font-bold text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= ceiling}
          aria-label="Agregar una unidad"
          className="h-11 w-11"
        >
          <HugeIcon icon={Add01Icon} size={14} strokeWidth={2} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
