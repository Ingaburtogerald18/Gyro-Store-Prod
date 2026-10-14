import { z } from 'zod';
import { landingConfigSchema, type LandingConfig } from './landing';
import type { CatalogProduct } from './catalog';

// Solo URLs ya subidas: una foto en cola (blob:) no sirve en otro navegador.
const draftImagesSchema = z
  .array(z.string().max(2048).regex(/^https?:\/\//, 'Hay una foto que no terminó de subir.'))
  .max(8, 'Máximo 8 imágenes por producto.');

// Lo que el borrador cambia de cada producto; lo que falta queda como está publicado.
export const draftProductChangeSchema = z.object({
  images: draftImagesSchema.optional(),
  imagesByColor: z.record(z.string().max(200), draftImagesSchema).optional(),
  published: z.boolean().optional(),
});

export const draftComboChangeSchema = z.object({
  images: draftImagesSchema.optional(),
  published: z.boolean().optional(),
});

export const storeDraftProductsSchema = z.object({
  items: z.record(z.uuid(), draftProductChangeSchema).default({}),
  combos: z.record(z.uuid(), draftComboChangeSchema).default({}),
  /** Orden de los productos en la tienda; sin esto, el publicado. */
  order: z.array(z.uuid()).max(5000).optional(),
});

export type DraftProductChange = z.infer<typeof draftProductChangeSchema>;
export type DraftComboChange = z.infer<typeof draftComboChangeSchema>;
export type StoreDraftProducts = z.infer<typeof storeDraftProductsSchema>;

export const editorSessionSchema = z.object({ session: z.uuid() });

/** `landing: null` = la portada no cambia respecto de la publicada. */
export const storeDraftInputSchema = editorSessionSchema.extend({
  landing: landingConfigSchema.nullable(),
  products: storeDraftProductsSchema,
});

export const editorHeartbeatSchema = editorSessionSchema.extend({ active: z.boolean() });

// Al cerrar la pestaña se libera con lo último que faltaba guardar.
export const editorReleaseSchema = editorSessionSchema.extend({
  draft: storeDraftInputSchema.omit({ session: true }).optional(),
});

export const storePublishInputSchema = editorSessionSchema.extend({
  landing: landingConfigSchema,
  products: storeDraftProductsSchema,
});

export type StoreDraftInput = z.infer<typeof storeDraftInputSchema>;
export type StorePublishInput = z.infer<typeof storePublishInputSchema>;

export interface StoreDraft {
  landing: LandingConfig | null;
  products: StoreDraftProducts;
  changedAt: string | null;
  changedBy: string | null;
}

export interface EditorLockHolder {
  name: string;
  since: string;
}

/** Respuesta al entrar al modo edición. */
export interface EditorEntry {
  draft: StoreDraft | null;
  published: LandingConfig;
}

export const restoreVersionSchema = editorSessionSchema.extend({
  /** El admin confirmó descartar el borrador sin publicar. */
  discardDraft: z.boolean(),
});

/** Una de las últimas 5 publicaciones. */
export interface StoreVersion {
  id: string;
  publishedAt: string;
  publishedBy: string | null;
  /** Qué cambió respecto de la anterior. */
  summary: string[];
  /** La que muestra la tienda ahora. */
  current: boolean;
}

/** Producto tal como está publicado, para la sección Productos del modo edición. */
export interface EditorProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  templateId: string | null;
  published: boolean;
  images: string[];
  imagesByColor: Record<string, string[]>;
  /** Colores que ofrece; vacío si la plantilla no tiene eje de color. */
  colors: string[];
  /** La tarjeta de la tienda con lo publicado: precio, estado y fotos. */
  card: CatalogProduct;
}
