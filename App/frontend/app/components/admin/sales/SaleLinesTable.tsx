// Editor multilínea de la venta: N líneas a la vez, cada una con producto,
// cantidad y precio. Portado de `OrderLineItemsTable` de v1.
//
// Diferencia de fondo con v1: allá la línea se identificaba por `productId` y
// el precio sugerido se calculaba en el cliente (`useOrderCalculator` +
// `getPricingConfig`). Acá la identidad es el NOMBRE del producto — es lo que
// acepta `SaleLineInput` del backend v2 — y el descuento de mayoreo lo resuelve
// el servidor en cada cotización, así que no se recalcula de este lado.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Alert02Icon, Delete02Icon, PackageIcon } from '@hugeicons/core-free-icons';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Button } from '~/components/ui/button';
import { Combobox } from '~/components/ui/combobox';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { SellableProduct } from '~/store/api/salesApi';

/**
 * Línea EN EDICIÓN. Cantidad y precio admiten `''` a propósito: un campo que
 * se está tipeando todavía no es un número, y forzarlo a 0 haría que la línea
 * pareciera válida (y disparara una cotización) antes de tiempo.
 */
export interface EditorLine {
  uid: string;
  productName: string;
  quantity: number | '';
  salePrice: number | '';
}

export const newEditorLine = (): EditorLine => ({
  uid: crypto.randomUUID(),
  productName: '',
  quantity: '',
  salePrice: '',
});

export function SaleLinesTable({
  lines,
  products,
  duplicateNames,
  onChange,
  onAddLine,
  disabled,
}: {
  lines: EditorLine[];
  products: SellableProduct[];
  /** Nombres repetidos en más de una línea: el backend no lo admite. */
  duplicateNames: Set<string>;
  onChange: (lines: EditorLine[]) => void;
  onAddLine?: () => void;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const productNames = products.map((p) => p.productName);
  const stockByName = new Map(products.map((p) => [p.productName, p.stock]));

  function update(index: number, patch: Partial<EditorLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function remove(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {lines.map((line, i) => {
          const product = products.find((p) => p.productName === line.productName);
          const subtotal = (Number(line.quantity) || 0) * (Number(line.salePrice) || 0);
          const overStock =
            !!product && typeof line.quantity === 'number' && line.quantity > product.stock;
          const isDuplicate = !!line.productName && duplicateNames.has(line.productName);

          return (
            <motion.div
              key={line.uid}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
              className={cn(
                'space-y-3 rounded-card border bg-muted/40 p-3.5',
                (overStock || isDuplicate) && 'border-destructive/40',
              )}
            >
              {/* Fila 1: número + producto + stock + quitar */}
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <Combobox
                    value={line.productName}
                    onChange={(value) => {
                      // Al elegir un producto del catálogo se propone su precio,
                      // pero solo si la línea todavía no tiene uno escrito a mano.
                      const match = products.find((p) => p.productName === value);
                      update(i, {
                        productName: value,
                        ...(match && line.salePrice === '' ? { salePrice: match.price } : {}),
                      });
                    }}
                    options={productNames}
                    placeholder="Buscar por nombre o código…"
                    disabled={disabled}
                    aria-invalid={overStock || isDuplicate}
                    // Un producto puede venir de varios lotes: se busca contra
                    // TODOS sus códigos, no solo el primero.
                    getSearchText={(option) =>
                      products.find((p) => p.productName === option)?.codes.join(' ') ?? ''
                    }
                    renderOptionMeta={(option) => {
                      const stock = stockByName.get(option) ?? 0;
                      const code = products.find((p) => p.productName === option)?.code;
                      return (
                        <span className="flex shrink-0 items-center gap-2 text-xs">
                          {/* Se muestra el código para poder confirmar que el
                              resultado es el que se tipeó cuando la búsqueda fue
                              por código y no por nombre. */}
                          {code && <span className="font-mono text-muted-foreground">{code}</span>}
                          <span
                            className={cn(
                              'nums',
                              stock <= 0 ? 'font-semibold text-destructive' : 'text-muted-foreground',
                            )}
                          >
                            {stock} en stock
                          </span>
                        </span>
                      );
                    }}
                  />
                </div>

                {product && (
                  <span
                    className={cn(
                      'nums hidden shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium sm:flex',
                      overStock
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary-2',
                    )}
                  >
                    <HugeIcon icon={PackageIcon} size={12} strokeWidth={2} aria-hidden />
                    {product.stock} en stock
                  </span>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(i)}
                  disabled={disabled || lines.length === 1}
                  aria-label={`Quitar línea ${i + 1}`}
                  className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                </Button>
              </div>

              {/* Fila 2: cantidad + precio + subtotal */}
              <div className="flex flex-wrap items-end gap-3 sm:flex-nowrap">
                <Field className="w-28 shrink-0">
                  <FieldLabel htmlFor={`qty-${line.uid}`} className="text-xs">
                    Cantidad
                  </FieldLabel>
                  <Input
                    id={`qty-${line.uid}`}
                    type="number"
                    min={1}
                    max={product?.stock}
                    placeholder="0"
                    disabled={disabled}
                    aria-invalid={overStock}
                    value={line.quantity}
                    onChange={(e) =>
                      update(i, {
                        quantity: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0,
                      })
                    }
                    // La rueda sobre un number input cambia el valor sin querer
                    // mientras se scrollea la página: se desenfoca antes.
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  />
                </Field>

                <Field className="w-28 shrink-0">
                  <FieldLabel htmlFor={`price-${line.uid}`} className="text-xs">
                    Precio unitario (C$)
                  </FieldLabel>
                  <Input
                    id={`price-${line.uid}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    disabled={disabled}
                    value={line.salePrice}
                    onChange={(e) =>
                      update(i, {
                        salePrice: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                      })
                    }
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  />
                </Field>

                <div className="w-full pt-1 text-right sm:w-auto sm:shrink-0 sm:pb-2">
                  <span className="block text-xs text-muted-foreground">Subtotal</span>
                  <span className="nums text-sm font-bold text-foreground">
                    {formatCordobas(subtotal)}
                  </span>
                </div>
              </div>

              {overStock && product && (
                <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  <HugeIcon icon={Alert02Icon} size={14} strokeWidth={2} className="shrink-0" aria-hidden />
                  Solo hay {product.stock} uds disponibles.
                </p>
              )}

              {isDuplicate && (
                <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  <HugeIcon icon={Alert02Icon} size={14} strokeWidth={2} className="shrink-0" aria-hidden />
                  Este producto está en otra línea: juntá las unidades en una sola.
                </p>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {onAddLine && (
        <Button
          type="button"
          variant="outline"
          onClick={onAddLine}
          disabled={disabled}
          className="w-full border-dashed sm:w-auto"
        >
          <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-1.5" aria-hidden />
          Agregar producto
        </Button>
      )}
    </div>
  );
}
