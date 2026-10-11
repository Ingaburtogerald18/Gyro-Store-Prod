/** Cifra con separador de miles y `decimals` fijos. Base de todo formato numérico. */
export function formatNumber(value: number, decimals = 0): string {
  return (value || 0).toLocaleString('es-NI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formatea un monto en córdobas: 1710 → "C$1,710".
 * `decimals` sube a 2 en los módulos que trabajan con centavos (facturación,
 * costos de inventario); el storefront y los totales redondeados quedan en 0.
 */
export function formatCordobas(amount: number, symbol = 'C$', decimals = 0): string {
  return `${symbol}${formatNumber(amount, decimals)}`;
}

/** Redondea para cálculo (no formatea): 123.456 → 123.46. */
export function roundTo(value: number, decimals = 2): number {
  return Number((value || 0).toFixed(decimals));
}

// El número puede venir en formato humano ("+505 8594 4758") desde Configuración:
// se limpia acá para que todos los que llaman queden protegidos sin tocar cada sitio.
export function buildWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** "Audífonos KZ EDX Pro" → "audifonos-kz-edx-pro" */
export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// URL del detalle: slug legible + id al final para que la ruta lo resuelva sin
// depender del nombre (que puede cambiar).
function detailUrl(base: string, id: string, name: string): string {
  const slug = createSlug(name);
  return `/${base}/${slug ? `${slug}--${id}` : id}`;
}
export const getProductUrl = (id: string, name: string) => detailUrl('producto', id, name);
export const getComboUrl = (id: string, name: string) => detailUrl('combo', id, name);

export const EXCHANGE_RATE = 36.6241;

/**
 * Fecha corta para listados y fichas: `08 ago` o `08 ago 2026`.
 * Devuelve `—` para nulos e inválidas: un guion se lee como "no hay dato".
 */
export function formatShortDate(
  iso: string | null | undefined,
  { withYear = false }: { withYear?: boolean } = {},
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/**
 * Fecha canónica del panel: "28 abr 2026". Un 'yyyy-MM-dd' suelto se lee como
 * fecha local: `new Date('2026-04-28')` es UTC y en Nicaragua daría el 27.
 */
export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '—';
  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = onlyDate
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date
    .toLocaleDateString('es-NI', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace('.', '');
}

/** Fecha y hora en Nicaragua ("12 oct 2026, 11:59 p. m."), se mire desde donde se mire. */
export function formatNicaraguaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const timeZone = 'America/Managua';
  const day = date
    .toLocaleDateString('es-NI', { day: 'numeric', month: 'short', year: 'numeric', timeZone })
    .replace('.', '');
  return `${day}, ${date.toLocaleTimeString('es-NI', { hour: 'numeric', minute: '2-digit', timeZone })}`;
}

/**
 * "KZ EDX Pro | Jack 3.5mm | Mic | Turquesa" → { model: "KZ EDX Pro",
 * variant: "Jack 3.5mm · Mic · Turquesa" }. Solo para MOSTRAR: el nombre
 * guardado no cambia. En una celda, el modelo va en negrita y la variante abajo.
 */
export function splitProductName(name: string): { model: string; variant: string } {
  const [model, ...rest] = (name ?? '').split(' | ');
  return { model: model.trim(), variant: rest.map((s) => s.trim()).join(' · ') };
}

// Mensaje de error de una respuesta RTK Query fallida (`{ data: { error } }`),
// con fallback si no vino en ese shape.
export function errMsg(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  return fallback;
}

// `items` que todavía no aparecen en `linkedIds` (ej. ventas aprobadas sin
// factura/plan de cuotas todavía) — un solo id "ya vinculado" por item.
export function withoutIds<T, K>(items: T[], linkedIds: K[], getId: (item: T) => K): T[] {
  const linked = new Set(linkedIds);
  return items.filter((item) => !linked.has(getId(item)));
}

export function formatUsd(amount: number, maxDecimals: number = 2, minDecimals: number = 2): string {
  const max = Math.max(2, maxDecimals);
  return '$' + amount.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(Math.max(2, minDecimals), max),
    maximumFractionDigits: max
  });
}

export function cordobasFromUsd(usd: number): string {
  return formatCordobas((usd || 0) * EXCHANGE_RATE);
}

// Caja y Bancos guarda el código de moneda por cuenta ("NIO", "USD"): el monto se
// muestra con el símbolo que corresponde, no con el código pegado al número.
export function formatByCurrency(amount: number, code?: string | null, decimals = 2): string {
  const currency = (code || 'NIO').toUpperCase();
  if (currency === 'USD') return formatUsd(amount, decimals, decimals);
  if (currency === 'NIO' || currency === 'C$') return formatCordobas(amount, 'C$', decimals);
  return `${formatNumber(amount, decimals)} ${currency}`;
}

/** Texto plano de una descripción con HTML, conservando los cortes de párrafo y
 *  de línea. Borrar las etiquetas a secas pegaba los párrafos en un solo bloque
 *  ("…con garantía.Incluye…"). Se pinta con `whitespace-pre-line`. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Mensajes de WhatsApp desde el catálogo. «Pedir» solo con una selección
 * válida (lleva variante, cantidad y precio); «consultar» sirve sin elegir y
 * no promete stock.
 */
export function productWhatsappMessage({
  kind,
  name,
  variant,
  quantity = 1,
  total,
  url,
}: {
  kind: 'order' | 'availability' | 'info';
  name: string;
  variant?: string;
  quantity?: number;
  /** Ya formateado con formatCordobas. */
  total?: string;
  url: string;
}): string {
  const label = variant ? `${name} (${variant})` : name;
  if (kind === 'order') {
    const qty = quantity > 1 ? `${quantity}× ` : '';
    return `Hola, quiero pedir: ${qty}${label}${total ? ` — ${total}` : ''}. ${url}`;
  }
  if (kind === 'availability') return `Hola, ¿tienen disponible ${label}? ${url}`;
  return `Hola, quiero consultar por ${label}. ${url}`;
}
