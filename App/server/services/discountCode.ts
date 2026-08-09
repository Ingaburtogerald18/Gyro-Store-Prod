// Códigos de descuento (portado de v1 server/routes/discountCodes.js).
//
// Dos caminos de lectura, a propósito distintos (igual que v1):
//   · checkDiscountCode()  → SOLO lee, NO consume uso. Lo usa POST /validate
//     (preview instantáneo en el checkout / factura): el cliente puede llamarlo
//     las veces que quiera sin gastar el cupo del código.
//   · redeemDiscountCode() → canje real: revalida TODO e incrementa used_count
//     ATÓMICAMENTE vía la función SQL `redeem_discount_code` (migración 0009),
//     que serializa el acceso a la fila con `for update`. Se llama SOLO al crear
//     el pedido/factura, nunca desde el preview del cliente.
import { db } from '../supabase';
import { BadRequestError } from '../utils/httpError';
import { logger } from '../utils/logger';
import type { DiscountCodeInput } from '../../shared/schemas';

export type DiscountType = 'percent' | 'fixed';

export interface DiscountCode {
  code: string;
  type: DiscountType;
  value: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  note: string;
  createdAt: string | null;
  createdBy: string;
  redeemedAt: string | null;
  redeemedSource: string | null;
  redeemedLabel: string | null;
  redeemedMethod: string | null;
  redeemedAmount: number | null;
}

interface DiscountCodeRow {
  code: string;
  type: DiscountType;
  value: number | null;
  max_uses: number | null;
  used_count: number | null;
  active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string | null;
  created_by: string | null;
  discount_code_redemptions?: Array<{
    source: string;
    reference_id: string | null;
    reference_label: string | null;
    method: string | null;
    amount: number;
    redeemed_by: string | null;
    redeemed_at: string;
  }> | null;
}

const COLUMNS =
  'code, type, value, max_uses, used_count, active, expires_at, note, created_at, created_by';

function toDiscountCode(row: DiscountCodeRow): DiscountCode {
  const redemption = (row.discount_code_redemptions && row.discount_code_redemptions.length > 0)
    ? row.discount_code_redemptions[0]
    : null;

  return {
    code: row.code,
    type: row.type,
    value: Number(row.value ?? 0),
    maxUses: row.max_uses ?? 0,
    usedCount: row.used_count ?? 0,
    active: row.active !== false,
    expiresAt: row.expires_at,
    note: row.note ?? '',
    createdAt: row.created_at,
    createdBy: row.created_by ?? '',
    redeemedAt: redemption ? redemption.redeemed_at : null,
    redeemedSource: redemption ? redemption.source : null,
    redeemedLabel: redemption ? redemption.reference_label : null,
    redeemedMethod: redemption ? redemption.method : null,
    redeemedAmount: redemption ? Number(redemption.amount) : null,
  };
}

// El código es la PK: MAYÚSCULAS, sin espacios (igual que el doc id de v1).
export function normalizeCode(raw: string): string {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Dos queries en vez de un embed PostgREST, a propósito.
//
// El embed `discount_code_redemptions(...)` obliga a PostgREST a resolver la FK
// por introspección. Si la FK falta o el schema cache quedó viejo tras un DDL,
// la consulta falla ENTERA con PGRST200 y el panel muestra la lista vacía — o
// sea, un dato secundario (¿ya se canjeó?) tumba el listado principal.
//
// Con dos queries el canje es información ADICIONAL: si su tabla no responde,
// los códigos igual se listan y solo se pierde la columna de canje.
export async function listDiscountCodes(): Promise<DiscountCode[]> {
  const { data, error } = await db
    .from('discount_codes')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as unknown as DiscountCodeRow[];
  if (rows.length === 0) return [];

  const { data: redemptions, error: redemptionError } = await db
    .from('discount_code_redemptions')
    .select('code, source, reference_id, reference_label, method, amount, redeemed_by, redeemed_at')
    .in('code', rows.map((r) => r.code))
    .order('redeemed_at', { ascending: false });

  // No se relanza: sin canjes la lista sigue siendo útil.
  if (redemptionError) {
    logger.warn('[discount-codes] No se pudieron leer los canjes', { message: redemptionError.message });
  }

  // Un código es de uso único (max_uses = 1), así que basta el más reciente.
  const byCode = new Map<string, NonNullable<DiscountCodeRow['discount_code_redemptions']>[number]>();
  for (const r of (redemptions ?? []) as unknown as Array<
    NonNullable<DiscountCodeRow['discount_code_redemptions']>[number] & { code: string }
  >) {
    if (!byCode.has(r.code)) byCode.set(r.code, r);
  }

  return rows.map((row) => {
    const redemption = byCode.get(row.code);
    return toDiscountCode({
      ...row,
      discount_code_redemptions: redemption ? [redemption] : null,
    });
  });
}

// El código lo genera la BASE: `discount_codes.code` tiene como default
// `'GS-DC-' || nextval('discount_code_seq')` (migración 0011). Por eso acá NO se
// inserta `code` y no hay chequeo de duplicado: `nextval()` es atómico, así que
// dos requests simultáneos no pueden sacar el mismo número — un chequeo
// "¿existe?" en TypeScript sí podría dejarlos pasar a los dos.
export async function createDiscountCode(
  input: DiscountCodeInput,
  createdBy: string,
): Promise<DiscountCode> {
  const { data, error } = await db
    .from('discount_codes')
    .insert({
      type: input.type,
      value: input.value,
      max_uses: input.maxUses ?? 1,
      used_count: 0,
      active: true,
      expires_at: input.expiresAt ? input.expiresAt : null,
      note: input.note ?? '',
      created_by: createdBy || '',
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toDiscountCode(data as unknown as DiscountCodeRow);
}

// Hoy solo activar/desactivar: reemitir un código es más seguro que editar uno
// ya repartido (mismo criterio que v1).
export async function setDiscountCodeActive(
  rawCode: string,
  active: boolean,
): Promise<DiscountCode> {
  const code = normalizeCode(rawCode);
  const { data, error } = await db
    .from('discount_codes')
    .update({ active })
    .eq('code', code)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BadRequestError('Código no encontrado.');
  return toDiscountCode(data as unknown as DiscountCodeRow);
}

export interface CheckedCode {
  code: string;
  type: DiscountType;
  value: number;
}

// Preview de solo lectura: valida sin descontar un uso.
export async function checkDiscountCode(rawCode: string): Promise<CheckedCode> {
  const code = normalizeCode(rawCode);
  if (!code) throw new BadRequestError('Código requerido.');

  const { data, error } = await db
    .from('discount_codes')
    .select('code, type, value, active, expires_at, max_uses, used_count')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BadRequestError('Código inválido.');
  if (data.active === false) throw new BadRequestError('Este código ya no está activo.');
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new BadRequestError('Este código venció.');
  }
  if ((data.max_uses ?? 0) > 0 && (data.used_count ?? 0) >= (data.max_uses ?? 0)) {
    throw new BadRequestError('Este código ya fue canjeado.');
  }
  return { code: data.code, type: data.type as DiscountType, value: Number(data.value ?? 0) };
}

export interface RedeemContext {
  source: 'checkout' | 'invoice' | 'sale';
  referenceId?: string;
  referenceLabel: string;
  method?: string | null;
  amount: number;
  redeemedBy?: string | null;
}

// Canje real: revalida + incrementa used_count atómicamente en la BD.
export async function redeemDiscountCode(rawCode: string, ctx: RedeemContext): Promise<CheckedCode> {
  const code = normalizeCode(rawCode);
  if (!code) throw new BadRequestError('Código requerido.');

  const { data, error } = await db.rpc('redeem_discount_code', { 
    p_code: code,
    p_source: ctx.source,
    p_reference_id: ctx.referenceId || null,
    p_reference_label: ctx.referenceLabel,
    p_method: ctx.method || null,
    p_amount: ctx.amount,
    p_redeemed_by: ctx.redeemedBy || null
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.ok !== true) {
    throw new BadRequestError(row?.err || 'Código de descuento inválido.');
  }
  return { code: row.r_code as string, type: row.r_type as DiscountType, value: Number(row.r_value ?? 0) };
}

// Monto a descontar dado un `base` (subtotal). El fijo nunca descuenta más que
// el base; el porcentaje se aplica sobre él. Devuelve un número sin redondear:
// el llamador redondea con su propia función `round` para mantener la moneda.
export function computeCodeDiscount(type: DiscountType, value: number, base: number): number {
  if (base <= 0) return 0;
  return type === 'percent' ? base * (value / 100) : Math.min(value, base);
}
