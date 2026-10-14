import { z } from 'zod';
import { PHONE_RE } from './staff';

// Ficha 360, agenda de seguimientos y gestión de contactos. El inbox/bot de
// WhatsApp es CRM-B/C y depende de Meta — NO entra acá. Las tablas ya existen
// (migración 0001): contacts, contact_activities, follow_ups.

// 'store' = pidió «Avisame cuando haya» en la tienda (migración 0028).
export const CONTACT_ORIGINS = ['fb_ads', 'organic', 'whatsapp_link', 'referral', 'store', 'other'] as const;
export type ContactOrigin = (typeof CONTACT_ORIGINS)[number];
export const CONTACT_ORIGIN_LABELS: Record<ContactOrigin, string> = {
  fb_ads: 'Anuncio FB/IG',
  organic: 'Orgánico',
  whatsapp_link: 'Link WhatsApp',
  referral: 'Referido',
  store: 'Tienda',
  other: 'Otro',
};

// El pipeline (Docs/05-Pendientes.md §4 lo deja a definir): se arranca con estas etapas. En
// la base `stage` es texto libre, así que una lectura vieja con otro valor no
// rompe (se muestra tal cual).
export const CONTACT_STAGES = ['nuevo', 'contactado', 'cotizado', 'ganado', 'perdido'] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];
export const CONTACT_STAGE_LABELS: Record<ContactStage, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  cotizado: 'Cotizado',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

export const FOLLOW_UP_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const contactSchema = z.object({
  id: z.uuid(),
  phone: z.string().nullable(),
  name: z.string().nullable(),
  origin: z.string(),
  stage: z.string().nullable(),
  createdAt: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;

// Alta desde el panel. El teléfono es la identidad (contacts.phone es unique).
export const adminContactInputSchema = z.object({
  phone: z.string().trim().min(6, 'Teléfono inválido.').max(20),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  origin: z.enum(CONTACT_ORIGINS).optional(),
  stage: z.enum(CONTACT_STAGES).optional(),
});
export type AdminContactInput = z.infer<typeof adminContactInputSchema>;

// Edición: nombre/etapa/origen. El teléfono NO se cambia (es la identidad).
export const adminContactUpdateSchema = z.object({
  name: z.string().trim().max(120).optional(),
  stage: z.enum(CONTACT_STAGES).nullable().optional(),
  origin: z.enum(CONTACT_ORIGINS).optional(),
});
export type AdminContactUpdate = z.infer<typeof adminContactUpdateSchema>;

export const contactActivitySchema = z.object({
  id: z.uuid(),
  type: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ContactActivity = z.infer<typeof contactActivitySchema>;

export const contactActivityInputSchema = z.object({
  note: z.string().trim().min(1, 'Escribí una nota.').max(1000),
});

export const followUpSchema = z.object({
  id: z.uuid(),
  contactId: z.string().uuid(),
  scheduledDate: z.string().nullable(),
  reason: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  // Enriquecidos para la agenda (JOIN con el contacto).
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  // Aviso de la tienda: `arrived` cuando su variante ya tiene stock («Ya llegó, avisar»).
  stockNotice: z.object({ label: z.string(), arrived: z.boolean() }).nullable().optional(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

export const followUpInputSchema = z.object({
  contactId: z.string().uuid(),
  scheduledDate: z.string().min(1, 'Elegí una fecha.'),
  reason: z.string().trim().min(1, 'Escribí el motivo.').max(280),
});
export type FollowUpInput = z.infer<typeof followUpInputSchema>;

export const followUpUpdateSchema = z.object({
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  scheduledDate: z.string().optional(),
  reason: z.string().trim().max(280).optional(),
});
export type FollowUpUpdate = z.infer<typeof followUpUpdateSchema>;

// Ficha 360: contacto + historial de compras (ventas reales + pedidos web) +
// actividad + seguimientos + LTV (suma de ventas confirmadas).
export const contact360OrderSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['sale', 'web']),
  status: z.string(),
  total: z.number(),
  createdAt: z.string(),
});
export type Contact360Order = z.infer<typeof contact360OrderSchema>;

export const contact360Schema = z.object({
  contact: contactSchema,
  orders: z.array(contact360OrderSchema),
  activities: z.array(contactActivitySchema),
  followUps: z.array(followUpSchema),
  ltv: z.number(),
  orderCount: z.number(),
});
export type Contact360 = z.infer<typeof contact360Schema>;

// El formulario público de "Contacto" captura el lead directo en el CRM
// (contacts/contact_activities) — v1 solo mandaba un correo (sin servicio de
// email en v2 todavía). Teléfono obligatorio: es la clave de `contacts.phone`
// (unique) — mismo criterio que Docs/05-Pendientes.md §5 ("teléfono siempre obligatorio, es la
// llave"). `contacts` no tiene columna de email; si lo mandan, viaja dentro
// de la nota de la actividad en vez de perderse.
export const publicContactInputSchema = z.object({
  name: z.string().min(2, 'Ingresá tu nombre.').max(80),
  phone: z
    .string()
    .min(1, 'El teléfono es obligatorio.')
    .max(20, 'El teléfono es demasiado largo.')
    .regex(PHONE_RE, 'Ingresá un teléfono válido: 8 a 15 dígitos, con + opcional.'),
  email: z.string().email('Correo inválido.').max(120).optional().or(z.literal('')),
  message: z.string().min(1, 'Escribí tu mensaje.').max(1000, 'Máximo 1000 caracteres.'),
});
export type PublicContactInput = z.infer<typeof publicContactInputSchema>;

// WhatsApp de Nicaragua: 8 dígitos de celular (5, 7 u 8 al inicio), con o sin +505.
// Se guarda sin el código de país, como lo escriben los pedidos web.
export const nicaraguaWhatsappSchema = z
  .string()
  .trim()
  .max(24, 'El teléfono es demasiado largo.')
  .transform((v) => v.replace(/[\s().-]/g, '').replace(/^\+?505(?=\d{8}$)/, ''))
  .pipe(z.string().regex(/^[578]\d{7}$/, 'Escribí un WhatsApp de Nicaragua: 8 dígitos que empiezan con 5, 7 u 8.'));

// «Avisame cuando haya» (migración 0028): el producto y la variante los pone la ficha.
export const stockNoticeInputSchema = z.object({
  name: z.string().trim().min(2, 'Escribí tu nombre.').max(80),
  phone: nicaraguaWhatsappSchema,
  catalogItemId: z.uuid(),
  variantName: z.string().max(200),
});
export type StockNoticeInput = z.input<typeof stockNoticeInputSchema>;
export type StockNotice = z.output<typeof stockNoticeInputSchema>;
