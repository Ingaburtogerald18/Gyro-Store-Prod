import { z } from 'zod';
import { specRowSchema, type templateSchema } from './catalog';

// ── Plantillas ── Un eje es una dimensión de variante ("Color": ["Negro", "Azul"]). `key` es la llave
// en `axis_options`, `label` lo que ve el cliente; `isColor` se muestra con fotos.
export const templateAxisSchema = z.object({
  key: z.string().min(1, 'La clave del eje es obligatoria.').max(40),
  label: z.string().min(1, 'La etiqueta del eje es obligatoria.').max(60),
  options: z.array(z.string().min(1).max(60)).min(1, 'Cada eje necesita al menos una opción.').max(40),
  isColor: z.boolean().optional(),
});
export type TemplateAxis = z.infer<typeof templateAxisSchema>;

// Una plantilla por modelo: nombre, descripción y categoría son los que muestra
// la tienda. La nota interna nunca sale del panel.
export const templateInputSchema = z.object({
  name: z.string().trim().min(2, 'Escribí el nombre del modelo.').max(120),
  description: z.string().max(3000).optional(),
  internalNote: z.string().max(3000).optional(),
  categoryId: z.string({ error: 'Elegí la categoría.' }).uuid('Elegí la categoría.'),
  // Techo de ejes: las combinaciones crecen como producto cartesiano, así que
  // unos pocos ejes ya generan cientos de filas en la tabla de mapeo.
  axes: z.array(templateAxisSchema).max(6, 'Máximo 6 ejes por plantilla.'),
  specs: z.array(specRowSchema).max(30),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const adminTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  internalNote: z.string(),
  categoryId: z.string().uuid().nullable(),
  axes: z.array(templateAxisSchema),
  specs: z.array(specRowSchema),
  updatedAt: z.string(),
  // Productos del catálogo que la usan: uno en las plantillas nuevas, varios en
  // las viejas compartidas (ahí la compra elige a cuál va).
  products: z.array(z.object({ id: z.uuid(), name: z.string(), published: z.boolean() })),
});
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;

// ── Vínculo variante ↔ bodega ── Cada combinación apunta a uno o más códigos de lote: mientras alguno
// tenga unidades se vende, y el stock es la suma. La disponibilidad nunca se guarda a mano.
export const variantMappingSchema = z.object({
  codes: z.array(z.string().min(1).max(40)).max(20),
  price: z.number().min(0).max(9_999_999).optional(),
  // Solo aplica si es mayor que 0 y menor que el precio regular.
  promoPrice: z.number().min(0).max(9_999_999).optional(),
});
export type VariantMapping = z.infer<typeof variantMappingSchema>;

export const variantMappingsSchema = z.record(z.string().max(200), variantMappingSchema);
export type VariantMappings = z.infer<typeof variantMappingsSchema>;

// Formulario de producto del panel: precios, fotos y vínculo con bodega; ejes y specs vienen de la plantilla.
export const adminProductInputSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio.').max(120),
  description: z.string().max(2000).optional(),
  // Precio de venta. Se permite 0 para "consultar precio".
  price: z.number().min(0, 'El precio no puede ser negativo.').max(9_999_999),
  // Precio "antes": habilita el badge de descuento cuando es mayor que price.
  basePrice: z.number().min(0).max(9_999_999).optional(),
  // `.default([])`: con un eje de color el editor oculta las fotos generales y el campo queda undefined.
  // Vacío es lo correcto: la portada sale de la primera foto por color.
  images: z.array(z.string().max(2048)).max(8, 'Máximo 8 imágenes por producto.').default([]),
  // Fotos por color. `.default([])`: un color sin fotos llega undefined desde el editor.
  colorImages: z.record(z.string().max(60), z.array(z.string().max(2048)).max(8).default([])).optional(),
  // `.default([])`: las specs vienen de la plantilla y el formulario nunca registra el campo.
  specs: z.array(specRowSchema).max(30).default([]),
  categoryId: z.string().uuid().nullable().optional(),
  published: z.boolean(),
  isPromo: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  // Link a la biblioteca de SharePoint (fotos/videos del artículo). Solo staff;
  // no se expone en el storefront público. '' = sin link.
  spoLink: z.string().trim().url('Debe ser una URL válida.').or(z.literal('')).optional(),

  // ── Molde y variantes ──
  templateId: z.string().uuid().nullable().optional(),
  // Opciones que ofrece este producto por eje; vacío = todas las de la plantilla.
  axisOptions: z.record(z.string().max(40), z.array(z.string().max(60))).optional(),
  variantMappings: variantMappingsSchema.optional(),
});

export type AdminProductInput = z.infer<typeof adminProductInputSchema>;

// Vista del panel: agrega lo que el storefront NO puede ver (los precios de la
// cadena financiera) y el estado de publicación.
export const adminProductSchema = z.object({
  id: z.uuid(),
  templateId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  basePrice: z.number().nullable(),
  precioSugerido: z.number().nullable(),
  precioTentativo: z.number().nullable(),
  images: z.array(z.string()),
  colorImages: z.record(z.string(), z.array(z.string())),
  specs: z.array(specRowSchema),
  categoryId: z.string().uuid().nullable(),
  published: z.boolean(),
  isPromo: z.boolean(),
  sortOrder: z.number().int(),
  // Link a la biblioteca de SharePoint del artículo (solo staff). Null = sin link.
  spoLink: z.string().nullable(),
  updatedAt: z.string(),
  // Ejes heredados del molde: la tabla de mapeo los necesita para generar las
  // combinaciones sin tener que pedir la plantilla por separado.
  axes: z.array(templateAxisSchema),
  axisOptions: z.record(z.string(), z.array(z.string())),
  variantMappings: variantMappingsSchema,
});

export type AdminProduct = z.infer<typeof adminProductSchema>;

export type Template = z.infer<typeof templateSchema>;
