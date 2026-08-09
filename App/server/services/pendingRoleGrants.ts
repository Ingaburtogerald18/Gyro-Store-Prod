// Roles reservados por correo para personal que un admin agregó desde Personal
// pero que todavía no inició sesión con Microsoft ni una vez (ver la nota de
// la sección `pending_role_grants` de database/01_schema.sql para el porqué).
import { db } from '../supabase';
import type { AppRole } from '../config';

export interface PendingRoleGrant {
  email: string;
  name: string | null;
  roles: AppRole[];
  createdAt: string;
}

// Crea o reemplaza la reserva de un correo (agregar de nuevo con otro rol
// simplemente pisa la anterior — no hay historial que conservar de algo que
// nunca se activó).
export async function upsertPendingGrant(input: {
  email: string;
  name: string;
  roles: AppRole[];
  createdBy: string | null;
}): Promise<PendingRoleGrant> {
  const { data, error } = await db
    .from('pending_role_grants')
    .upsert(
      {
        email: input.email,
        name: input.name,
        roles: input.roles,
        created_by: input.createdBy,
      },
      { onConflict: 'email' },
    )
    .select('email, name, roles, created_at')
    .single();
  if (error) throw error;
  return { email: data.email, name: data.name, roles: data.roles ?? [], createdAt: data.created_at };
}

export async function listPendingGrants(): Promise<PendingRoleGrant[]> {
  const { data, error } = await db
    .from('pending_role_grants')
    .select('email, name, roles, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    email: row.email,
    name: row.name,
    roles: row.roles ?? [],
    createdAt: row.created_at,
  }));
}

export async function getPendingGrant(email: string): Promise<PendingRoleGrant | null> {
  const { data, error } = await db
    .from('pending_role_grants')
    .select('email, name, roles, created_at')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { email: data.email, name: data.name, roles: data.roles ?? [], createdAt: data.created_at };
}

// La consume el primer login real (middleware/auth.ts): le copia los roles al
// perfil recién creado y borra la reserva — es de un solo uso, como un código
// de invitación.
export async function consumePendingGrant(email: string): Promise<AppRole[] | null> {
  const { data, error } = await db
    .from('pending_role_grants')
    .delete()
    .eq('email', email)
    .select('roles')
    .maybeSingle();
  if (error) throw error;
  return data?.roles ?? null;
}

export async function deletePendingGrant(email: string): Promise<boolean> {
  const { data, error } = await db
    .from('pending_role_grants')
    .delete()
    .eq('email', email)
    .select('email')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
