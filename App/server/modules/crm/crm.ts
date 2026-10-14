// CRM: contactos, actividad, ficha 360 y seguimientos. El formulario público
// entra directo a contacts/contact_activities (no hay envío de correos).
import { db } from '../../core/supabase';
import { firstOfEmbed } from '../../utils/first-of-embed';
import { noticesForFollowUps } from './stock-notices';
import type {
  PublicContactInput,
  Contact,
  Contact360,
  ContactActivity,
  FollowUp,
  AdminContactInput,
  AdminContactUpdate,
  FollowUpInput,
  FollowUpUpdate,
} from '../../../shared/schemas';

export interface Lead {
  contactId: string;
  activityId: string;
}

// Busca o crea por teléfono (único): si escribe dos veces se suma una actividad al mismo contacto.
// No pisa el nombre: el equipo pudo corregirlo a mano.
export async function createLead(input: PublicContactInput): Promise<Lead> {
  const { data: existing, error: findError } = await db
    .from('contacts')
    .select('id')
    .eq('phone', input.phone)
    .maybeSingle();
  if (findError) throw findError;

  let contactId: string;
  if (existing) {
    contactId = existing.id;
  } else {
    const { data: created, error: createError } = await db
      .from('contacts')
      .insert({ phone: input.phone, name: input.name, origin: 'organic' })
      .select('id')
      .single();
    if (createError) throw createError;
    contactId = created.id;
  }

  // `contacts` no tiene columna de email (Docs/02-Arquitectura.md §6): si lo mandaron, viaja
  // dentro de la nota de la actividad en vez de perderse.
  const note = input.email ? `Correo: ${input.email}\n\n${input.message}` : input.message;

  const { data: activity, error: activityError } = await db
    .from('contact_activities')
    .insert({ contact_id: contactId, type: 'contact_form', note })
    .select('id')
    .single();
  if (activityError) throw activityError;

  return { contactId, activityId: activity.id };
}

// Busca o crea el contacto de un pedido web y deja la actividad para la ficha 360. Nunca lanza:
// un pedido no se rompe porque el CRM falló.
export async function findOrCreateOrderContact(
  phone: string,
  name: string,
): Promise<string | null> {
  try {
    const { data: existing } = await db
      .from('contacts')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    let contactId: string;
    if (existing) {
      contactId = existing.id;
    } else {
      const { data: created } = await db
        .from('contacts')
        .insert({ phone, name, origin: 'whatsapp_link' })
        .select('id')
        .single();
      if (created) {
        contactId = created.id;
      } else {
        // Carrera: otro pedido del mismo teléfono lo creó en el ínterin
        // (contacts.phone es UNIQUE). Re-leer en vez de fallar.
        const { data: retry } = await db
          .from('contacts')
          .select('id')
          .eq('phone', phone)
          .maybeSingle();
        if (!retry) return null;
        contactId = retry.id;
      }
    }

    await db
      .from('contact_activities')
      .insert({ contact_id: contactId, type: 'web_order', note: 'Pedido desde el catálogo web.' });

    return contactId;
  } catch {
    return null;
  }
}

// ── Panel: contactos, ficha 360 y seguimientos ──

const CONTACT_COLUMNS = 'id, phone, name, origin, stage, created_at';

interface ContactRow {
  id: string;
  phone: string | null;
  name: string | null;
  origin: string | null;
  stage: string | null;
  created_at: string;
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    origin: row.origin ?? 'other',
    stage: row.stage,
    createdAt: row.created_at,
  };
}

export async function listContacts(filter: { search?: string; stage?: string } = {}): Promise<Contact[]> {
  let query = db.from('contacts').select(CONTACT_COLUMNS).order('created_at', { ascending: false });
  if (filter.stage) query = query.eq('stage', filter.stage);
  if (filter.search?.trim()) {
    // Comas/paréntesis romperían el filtro `or` de PostgREST: se neutralizan.
    const term = filter.search.trim().replace(/[,()%]/g, ' ');
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as ContactRow[]).map(toContact);
}

// find-or-create por teléfono (contacts.phone es unique): si ya existe, se
// devuelve ese en vez de fallar por el constraint.
export async function createContact(input: AdminContactInput): Promise<Contact> {
  const { data: existing } = await db
    .from('contacts')
    .select(CONTACT_COLUMNS)
    .eq('phone', input.phone)
    .maybeSingle();
  if (existing) return toContact(existing as unknown as ContactRow);

  const { data, error } = await db
    .from('contacts')
    .insert({
      phone: input.phone,
      name: input.name || null,
      origin: input.origin ?? 'other',
      stage: input.stage ?? 'nuevo',
    })
    .select(CONTACT_COLUMNS)
    .single();
  if (error) throw error;
  return toContact(data as unknown as ContactRow);
}

// El teléfono NO se edita (es la identidad): solo nombre/etapa/origen.
export async function updateContact(id: string, patch: AdminContactUpdate): Promise<Contact | null> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name || null;
  if (patch.stage !== undefined) fields.stage = patch.stage;
  if (patch.origin !== undefined) fields.origin = patch.origin;

  if (Object.keys(fields).length === 0) {
    const { data } = await db.from('contacts').select(CONTACT_COLUMNS).eq('id', id).maybeSingle();
    return data ? toContact(data as unknown as ContactRow) : null;
  }
  const { data, error } = await db
    .from('contacts')
    .update(fields)
    .eq('id', id)
    .select(CONTACT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toContact(data as unknown as ContactRow) : null;
}

export async function addContactActivity(contactId: string, note: string): Promise<ContactActivity> {
  const { data, error } = await db
    .from('contact_activities')
    .insert({ contact_id: contactId, type: 'note', note })
    .select('id, type, note, created_at')
    .single();
  if (error) throw error;
  return { id: data.id, type: data.type, note: data.note, createdAt: data.created_at };
}

type OrderTotalRow = { id: string; status: string; total: number | null; created_at: string };
type ActivityRow = { id: string; type: string | null; note: string | null; created_at: string };

export async function getContact360(id: string): Promise<Contact360 | null> {
  const { data: contactRow, error } = await db
    .from('contacts')
    .select(CONTACT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!contactRow) return null;
  const contact = toContact(contactRow as unknown as ContactRow);

  // Historial de compras: por teléfono si lo tiene (es la identidad y lo que
  // capturan los pedidos); si no, por contact_id.
  const phone = contact.phone;
  const salesQ = phone
    ? db.from('orders').select('id, status, total, created_at').eq('phone', phone)
    : db.from('orders').select('id, status, total, created_at').eq('contact_id', id);
  const webQ = phone
    ? db.from('public_orders').select('id, status, total, created_at').eq('phone', phone)
    : db.from('public_orders').select('id, status, total, created_at').eq('contact_id', id);

  const [salesRes, webRes, actsRes, fusRes] = await Promise.all([
    salesQ,
    webQ,
    db
      .from('contact_activities')
      .select('id, type, note, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false }),
    db
      .from('follow_ups')
      .select('id, contact_id, scheduled_date, reason, status, created_at')
      .eq('contact_id', id)
      .order('scheduled_date', { ascending: true }),
  ]);
  for (const r of [salesRes, webRes, actsRes, fusRes]) if (r.error) throw r.error;

  const sales = ((salesRes.data ?? []) as unknown as OrderTotalRow[]).map((o) => ({
    id: o.id,
    kind: 'sale' as const,
    status: o.status,
    total: Number(o.total ?? 0),
    createdAt: o.created_at,
  }));
  const web = ((webRes.data ?? []) as unknown as OrderTotalRow[]).map((o) => ({
    id: o.id,
    kind: 'web' as const,
    status: o.status,
    total: Number(o.total ?? 0),
    createdAt: o.created_at,
  }));
  const orders = [...sales, ...web].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // LTV = ventas reales CONFIRMADAS (aprobadas o pagadas). Los pedidos web sin
  // cerrar no cuentan (Docs/05-Pendientes.md §4).
  const ltv = sales
    .filter((o) => o.status === 'approved' || o.status === 'paid')
    .reduce((sum, o) => sum + o.total, 0);

  const activities: ContactActivity[] = ((actsRes.data ?? []) as unknown as ActivityRow[]).map((a) => ({
    id: a.id,
    type: a.type,
    note: a.note,
    createdAt: a.created_at,
  }));
  const followUps: FollowUp[] = ((fusRes.data ?? []) as unknown as FollowUpRow[]).map(toFollowUp);

  return { contact, orders, activities, followUps, ltv, orderCount: orders.length };
}

// ── Agenda de seguimientos ──

interface FollowUpRow {
  id: string;
  contact_id: string;
  scheduled_date: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  contact?: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
}

function toFollowUp(row: FollowUpRow): FollowUp {
  const c = firstOfEmbed(row.contact ?? null);
  return {
    id: row.id,
    contactId: row.contact_id,
    scheduledDate: row.scheduled_date,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    contactName: c?.name ?? null,
    contactPhone: c?.phone ?? null,
  };
}

const FOLLOW_UP_SELECT =
  'id, contact_id, scheduled_date, reason, status, created_at, contact:contacts(name, phone)';

export async function listFollowUps(filter: { status?: string; upto?: string } = {}): Promise<FollowUp[]> {
  let query = db.from('follow_ups').select(FOLLOW_UP_SELECT).order('scheduled_date', { ascending: true });
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.upto) query = query.lte('scheduled_date', filter.upto);
  const { data, error } = await query;
  if (error) throw error;
  const followUps = ((data ?? []) as unknown as FollowUpRow[]).map(toFollowUp);
  const notices = await noticesForFollowUps(followUps.map((f) => f.id));
  return followUps.map((f) => ({ ...f, stockNotice: notices.get(f.id) ?? null }));
}

export async function createFollowUp(input: FollowUpInput, createdBy: string | null): Promise<FollowUp> {
  const { data, error } = await db
    .from('follow_ups')
    .insert({
      contact_id: input.contactId,
      scheduled_date: input.scheduledDate,
      reason: input.reason,
      status: 'pending',
      created_by: createdBy,
    })
    .select(FOLLOW_UP_SELECT)
    .single();
  if (error) throw error;
  return toFollowUp(data as unknown as FollowUpRow);
}

export async function updateFollowUp(id: string, patch: FollowUpUpdate): Promise<FollowUp | null> {
  const fields: Record<string, unknown> = {};
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.scheduledDate !== undefined) fields.scheduled_date = patch.scheduledDate;
  if (patch.reason !== undefined) fields.reason = patch.reason;

  const { data, error } = await db
    .from('follow_ups')
    .update(fields)
    .eq('id', id)
    .select(FOLLOW_UP_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data ? toFollowUp(data as unknown as FollowUpRow) : null;
}
