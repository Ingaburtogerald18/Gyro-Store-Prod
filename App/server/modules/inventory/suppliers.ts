// Proveedores de las órdenes de compra.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import type { SupplierInput } from '../../../shared/schemas';
import { escapeLike, isUniqueViolation, requireOrdersTable } from './purchase-order-common';

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  storeUrl: string;
  notes: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  contact: string | null;
  store_url: string | null;
  notes: string | null;
}

export const SUPPLIER_COLUMNS = 'id, name, contact, store_url, notes';

export function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact ?? '',
    storeUrl: row.store_url ?? '',
    notes: row.notes ?? '',
  };
}

function supplierRow(input: SupplierInput) {
  return {
    name: input.name.trim(),
    contact: input.contact?.trim() ?? '',
    store_url: input.storeUrl?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
  };
}

export async function listSuppliers(): Promise<Supplier[]> {
  await requireOrdersTable();
  const { data, error } = await db.from('suppliers').select(SUPPLIER_COLUMNS).order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as SupplierRow[]).map(toSupplier);
}

async function findSupplierByName(name: string): Promise<SupplierRow | null> {
  const { data, error } = await db
    .from('suppliers')
    .select(SUPPLIER_COLUMNS)
    .ilike('name', escapeLike(name.trim()))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SupplierRow | null) ?? null;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  await requireOrdersTable();
  const existing = await findSupplierByName(input.name);
  if (existing) throw new BadRequestError(`Ya existe un proveedor llamado "${existing.name}".`);
  const { data, error } = await db.from('suppliers').insert(supplierRow(input)).select(SUPPLIER_COLUMNS).single();
  if (isUniqueViolation(error)) throw new BadRequestError(`Ya existe un proveedor llamado "${input.name.trim()}".`);
  if (error) throw error;
  return toSupplier(data as SupplierRow);
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<Supplier | null> {
  await requireOrdersTable();
  const { data, error } = await db
    .from('suppliers')
    .update(supplierRow(input))
    .eq('id', id)
    .select(SUPPLIER_COLUMNS)
    .maybeSingle();
  if (isUniqueViolation(error)) throw new BadRequestError(`Ya existe un proveedor llamado "${input.name.trim()}".`);
  if (error) throw error;
  return data ? toSupplier(data as SupplierRow) : null;
}

/**
 * Un proveedor «nuevo» con el nombre de uno existente reutiliza ese y completa sus datos vacíos:
 * así no se duplican al cargarlos desde la orden.
 */
export async function resolveSupplierId(
  supplierId: string | null | undefined,
  newSupplier: SupplierInput | undefined,
): Promise<string | null | undefined> {
  if (newSupplier) {
    const existing = await findSupplierByName(newSupplier.name);
    if (existing) {
      const fill: Record<string, string> = {};
      if (!existing.contact && newSupplier.contact) fill.contact = newSupplier.contact.trim();
      if (!existing.store_url && newSupplier.storeUrl) fill.store_url = newSupplier.storeUrl.trim();
      if (Object.keys(fill).length) {
        const { error } = await db.from('suppliers').update(fill).eq('id', existing.id);
        if (error) throw error;
      }
      return existing.id;
    }
    const { data, error } = await db.from('suppliers').insert(supplierRow(newSupplier)).select('id').single();
    if (isUniqueViolation(error)) {
      // Otra persona lo creó en el mismo momento: se usa ese.
      const raced = await findSupplierByName(newSupplier.name);
      if (raced) return raced.id;
    }
    if (error) throw error;
    return data.id as string;
  }
  if (supplierId) {
    const { data, error } = await db.from('suppliers').select('id').eq('id', supplierId).maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('El proveedor elegido ya no existe.');
    return supplierId;
  }
  return supplierId; // null = sin proveedor; undefined = no se toca
}
