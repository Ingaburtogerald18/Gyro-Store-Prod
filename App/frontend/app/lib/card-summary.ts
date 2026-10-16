// Qué dice una tarjeta de producto debajo del nombre: una línea de opciones y, si suma, un dato de la
// ficha. Solo con datos cargados; nada se deduce del nombre. Lo completo vive en la ficha.
import type { CatalogProduct } from '@shared/schemas';
import { normalizeSearch } from './search';

// Lo que más se pregunta antes de comprar: cómo se conecta, con qué es compatible y si trae micrófono.
const DECIDING_LABEL = /conect|conexi|bluetooth|compatib|micr[oó]fono|inal[aá]mbric/i;
// Una línea de texto chico en una tarjeta de celular (unos 170 px).
const OPTIONS_BUDGET = 28;
const MAX_VALUE = 18;
const MAX_LABEL = 22;

const compact = (s: string) => normalizeSearch(s).replace(/[^a-z0-9]+/g, '');

type Summarized = Pick<CatalogProduct, 'name' | 'axesSummary' | 'colorCount' | 'specs'>;

/** Opciones ofrecidas en una línea. Los colores van solo si entran: también se ven en las fotos. */
export function cardOptions(p: Summarized): string {
  const seen = new Set<string>();
  const axes = p.axesSummary
    .map((a) => a.trim())
    .filter((a) => a && !seen.has(compact(a)) && seen.add(compact(a)))
    .slice(0, 2);
  const colors = p.colorCount > 1 ? `${p.colorCount} colores` : '';
  const line = axes.join(' · ');
  if (!line) return colors;
  return colors && `${line} · ${colors}`.length <= OPTIONS_BUDGET ? `${line} · ${colors}` : line;
}

/**
 * Datos de la ficha que entran enteros en la tarjeta, sin repetir las opciones ni el nombre. Primero
 * los que ayudan a elegir (conexión, compatibilidad, micrófono); después, en el orden de la ficha.
 */
export function cardSpecs(p: Summarized, max: number): { label: string; value: string }[] {
  const shown = p.axesSummary.map(compact).filter(Boolean);
  const name = compact(p.name);
  const candidates = p.specs
    .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
    .filter((s) => s.label && s.value && s.value.length <= MAX_VALUE && s.label.length <= MAX_LABEL)
    .filter((s) => {
      const value = compact(s.value);
      // Un valor de 1 o 2 letras («Sí») aparece dentro de cualquier opción: no cuenta como repetido.
      return value.length > 0 && !(value.length >= 3 && name.includes(value)) && !shown.some((o) => value.includes(o) || (value.length >= 3 && o.includes(value)));
    });
  const deciding = candidates.filter((s) => DECIDING_LABEL.test(s.label));
  return [...deciding, ...candidates.filter((s) => !deciding.includes(s))].slice(0, max);
}
