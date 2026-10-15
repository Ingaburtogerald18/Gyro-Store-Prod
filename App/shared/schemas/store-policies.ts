import { z } from 'zod';

// Configuración → Atención (`app_config.store_policies`). Los resúmenes son datos confirmados y se
// muestran siempre; la página de garantía y cambios solo sale a la tienda cuando está publicada.
export const POLICY_STATUSES = ['draft', 'published'] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

const policySummarySchema = z.object({
  title: z.string().trim().min(1, 'Escribí un título.').max(60, 'Máximo 60 caracteres.'),
  text: z.string().trim().max(280, 'Máximo 280 caracteres.'),
});
export type PolicySummary = z.infer<typeof policySummarySchema>;

export const storePoliciesSchema = z.object({
  payment: policySummarySchema,
  managua: policySummarySchema,
  outside: policySummarySchema,
  pickup: policySummarySchema,
  warranty: policySummarySchema,
  shippingNote: z.string().trim().max(280, 'Máximo 280 caracteres.'),
  warrantyPage: z.object({
    status: z.enum(POLICY_STATUSES),
    text: z.string().trim().max(5000, 'Máximo 5000 caracteres.'),
    // Lo pone el servidor cuando cambia el texto o el estado; el formulario no lo edita.
    updatedAt: z.string().nullable(),
  }),
});
export type StorePolicies = z.infer<typeof storePoliciesSchema>;

/** Lo que ve la tienda: la página de garantía solo si está publicada, nunca el borrador. */
export type PublicStorePolicies = Omit<StorePolicies, 'warrantyPage'> & {
  warrantyPage: { text: string; updatedAt: string | null } | null;
};

export function toPublicPolicies(policies: StorePolicies): PublicStorePolicies {
  const { warrantyPage, ...summaries } = policies;
  return {
    ...summaries,
    warrantyPage: warrantyPage.status === 'published' && warrantyPage.text
      ? { text: warrantyPage.text, updatedAt: warrantyPage.updatedAt }
      : null,
  };
}
