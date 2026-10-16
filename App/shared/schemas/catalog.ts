import { z } from 'zod';
import type { wholesaleDiscountItemSchema } from './finance-config';

// ── CATEGORÍAS UNIFICADAS ──
// Fuente de verdad única para el panel y el catálogo público.
export const categorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  icon: z.string().max(16).nullable().optional(),
  // Texto propio de la página de la categoría; opcional para respuestas guardadas antes de 0033.
  description: z.string().max(500).optional(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoryInputSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones.'),
  name: z.string().min(1).max(100),
  icon: z.string().max(16).nullable().optional(),
  description: z.string().trim().max(500).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

// `axes` y `specs` como jsonb opaco: en la base conviven dos formas y las normaliza el presentador
// (catalog-presenter.ts). Fijar una acá haría fallar la otra con un 500.
export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  category: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  axes: z.unknown(),
  specs: z.unknown(),
  updated_at: z.string().nullable().optional(),
});

// Vista pública: lo único que sale a la tienda. Es la base y la interna la extiende, así una columna
// sensible nueva no se vuelve pública por olvido.
export const publicCatalogItemSchema = z.object({
  id: z.uuid(),
  template_id: z.uuid().nullable(),

  // Precios que el comprador sí puede ver (lo que se le cobra).
  base_price: z.number().nullable(),
  price: z.number().nullable(),

  // Configuraciones de variantes e imágenes
  variant_mappings: z.record(z.string(), z.unknown()),
  axis_options: z.record(z.string(), z.unknown()),
  images: z.array(z.unknown()),
  images_by_color: z.record(z.string(), z.unknown()),

  // Estado y orden
  published: z.boolean(),
  is_promo: z.boolean(),
  sort_order: z.number().int(),
  category_id: z.string().uuid().nullable().optional(),

  // Timestamps
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),

  // Relación embebida (Join desde el backend)
  template: templateSchema.nullable(),
  category: z.object({
    id: z.string(),
    name: z.string()
  }).nullable().optional(),
});

// Vista interna: suma los precios de la cadena financiera, que dejan deducir el margen. Nunca pública.
export const catalogItemSchema = publicCatalogItemSchema.extend({
  precio_sugerido: z.number().nullable(),
  precio_tentativo: z.number().nullable(),
});

// ── Contrato hacia el navegador ── El presentador del servidor (catalog-presenter.ts) arma este
// objeto plano: nombre, variantes y stock necesitan tablas que el cliente no ve.
export const specRowSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// Lo único que el cliente ve del inventario: available, coming_soon (sin precio, no se pide),
// sold_out y unknown (sin vínculo o sin precio: se consulta por WhatsApp).
export const AVAILABILITY = ['available', 'coming_soon', 'sold_out', 'unknown'] as const;
export const availabilitySchema = z.enum(AVAILABILITY);
export type Availability = z.infer<typeof availabilitySchema>;

export const catalogProductSchema = z.object({
  id: z.uuid(),
  // URL de la ficha (/producto/<slug>): el nombre, único en el catálogo (shared/detail-slug.ts).
  slug: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  // Nombre de la categoría a la que pertenece
  category: z.string(),
  // Marca cargada en la plantilla; sin ella no se declara ninguna.
  brand: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  images: z.array(z.string()),
  // El menor precio de las variantes comprables («Desde…» con `priceFrom`); 0 en «Próximamente».
  price: z.number(),
  // Precio «antes» solo si todas las variantes tienen el mismo precio y la misma rebaja.
  compareAtPrice: z.number().optional(),
  // Las variantes no valen todas lo mismo: la tarjeta dice «Desde».
  priceFrom: z.boolean().default(false),
  // Unidades disponibles sumadas (0 si se desconoce). Sirve para limitar
  // cantidades; la interfaz nunca la muestra como número.
  stock: z.number(),
  availability: availabilitySchema.default('unknown'),
  // Alguna variante tiene promoción vigente.
  isPromo: z.boolean(),
  // 'all' = todas las variantes rebajadas; 'some' = solo algunas (la tarjeta
  // no promete la rebaja para todas); 'none' = sin promoción.
  promoScope: z.enum(['none', 'some', 'all']).default('none'),
  specs: z.array(specRowSchema),
  // Opciones no-color ofrecidas: alimentan las pills de la tarjeta.
  axesSummary: z.array(z.string()),
  // Nº de combinaciones: si es >1 hay que elegir variante antes de agregar.
  variantCount: z.number().int(),
  // Colores ofrecidos: la tarjeta dice «3 colores» sin repetir los nombres, que se ven en las fotos.
  colorCount: z.number().int().default(0),
  // Último cambio real del producto o su plantilla: el sitemap lo usa como lastmod.
  updatedAt: z.string().optional(),
  // Con UNA sola combinación, su identidad: la tarjeta agrega directo sin
  // inventar una variante «Estándar».
  singleVariant: z.string().optional(),
  templateId: z.string().nullable(),
  // Solo en la vista previa del modo edición: la tienda real nunca lo manda.
  unpublished: z.boolean().optional(),
});

// Solo en el detalle: la tarjeta se arregla con `axesSummary`.
export const catalogAxisSchema = z.object({
  key: z.string(),
  // Etiqueta visible del eje ("Tipo de conector"). Sin ella el selector de la
  // ficha tendría que mostrar el id interno.
  label: z.string(),
  options: z.array(z.string()),
  isColor: z.boolean(),
});

// Combinación con precio y stock reales; los códigos de lote no viajan. `variantName` (opciones unidas
// con ' / ') es la misma llave del mapeo; el servidor la resuelve y no confía en el cliente.
export const catalogVariantSchema = z.object({
  variantName: z.string(),
  axisValues: z.array(z.string()),
  // Precio vigente de ESTA combinación (promoción incluida); 0 en «Próximamente».
  price: z.number(),
  // Precio regular cuando la combinación tiene promoción.
  compareAtPrice: z.number().optional(),
  isPromo: z.boolean().default(false),
  stock: z.number().int(),
  availability: availabilitySchema.default('unknown'),
});

export const catalogDetailSchema = catalogProductSchema.extend({
  axes: z.array(catalogAxisSchema),
  variants: z.array(catalogVariantSchema),
  colorImages: z.record(z.string(), z.array(z.string())).optional(),
});

export type CatalogVariant = z.infer<typeof catalogVariantSchema>;

export type SpecRow = z.infer<typeof specRowSchema>;
export type WholesaleDiscount = z.infer<typeof wholesaleDiscountItemSchema>;

export const imageResourcesSchema = z.object({
  logoStatic: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  logoAnimated: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  favicon: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  posLogo: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  // Imágenes del carrito (ver cartContentSchema): carrito vacío, banner de
  // promo arriba de los productos y pantalla de "Pedido recibido".
  cartEmpty: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  cartBanner: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  orderSuccess: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
  // Ilustración del acceso de colaboradores (/login). Vacía → logo estático.
  loginImage: z.string().url('Debe ser una URL válida').or(z.literal('')).optional(),
});
export type ImageResources = z.infer<typeof imageResourcesSchema>;

// Categorías eliminadas: ahora se manejan en el propio categorySchema de la BD.

// Bancos y monedas de las cuentas de la tienda (los de pago al vendedor son PAYOUT_BANKS).
// El select del panel sale de acá para que no ofrezca algo que el backend rechaza.
export const STORE_BANKS = ['BAC', 'Lafise', 'Banpro', 'Ficohsa'] as const;
export const STORE_CURRENCIES = ['NIO', 'USD'] as const;

export const storeBankAccountSchema = z.object({
  // `''` = todavía sin elegir: una cuenta nueva nace vacía. El superRefine la rechaza al guardar.
  bank: z.enum(STORE_BANKS).or(z.literal('')),
  currency: z.enum(STORE_CURRENCIES),
  number: z.string().trim().min(4, 'Número demasiado corto.').max(40, 'Número demasiado largo.'),
  holder: z.string().max(80).optional(),
});
export type StoreBankAccount = z.infer<typeof storeBankAccountSchema>;

// Horario de atención en texto, una fila por grupo de días («Lunes a viernes» · «8:00 a. m. a 5:00 p. m.»).
export const businessHoursRowSchema = z.object({
  days: z.string().trim().min(1, 'Escribí los días.').max(40, 'Máximo 40 caracteres.'),
  hours: z.string().trim().min(1, 'Escribí el horario.').max(60, 'Máximo 60 caracteres.'),
});
export type BusinessHoursRow = z.infer<typeof businessHoursRowSchema>;

// Datos del negocio editables en General (`app_config.business_info`). Sin .default() a propósito:
// divergiría input y output y rompe zodResolver.
export const businessInfoSchema = z
  .object({
    brandName: z.string().min(1, 'El nombre de la tienda es obligatorio.').max(80),
    ruc: z.string().max(40),
    whatsapp: z.string().min(1, 'El WhatsApp es obligatorio.').max(30),
    contactEmail: z.string().email('Correo inválido.').or(z.literal('')),
    address: z.string().max(200),
    locationUrl: z.string().url().or(z.literal('')).optional().default(''),
    currency: z.string().min(1, 'La moneda es obligatoria.').max(10),
    socialLinks: z.object({
      instagram: z.string().max(300).optional().default(''),
      facebook: z.string().max(300).optional().default(''),
      tiktok: z.string().max(300).optional().default(''),
    }).optional().default({ instagram: '', facebook: '', tiktok: '' }),
    bankAccounts: z.array(storeBankAccountSchema).optional().default([]),
    businessHours: z.array(businessHoursRowSchema).max(7, 'Máximo 7 filas.').optional().default([]),
  })
  // El error va a la fila exacta para que salga bajo su select.
  .superRefine((data, ctx) => {
    data.bankAccounts?.forEach((account, index) => {
      if (!account.bank) {
        ctx.addIssue({
          code: 'custom',
          path: ['bankAccounts', index, 'bank'],
          message: 'Elegí el banco.',
        });
      }
    });
  });
export type BusinessInfo = z.infer<typeof businessInfoSchema>;

export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CatalogAxis = z.infer<typeof catalogAxisSchema>;
export type CatalogDetail = z.infer<typeof catalogDetailSchema>;
export type PublicCatalogItem = z.infer<typeof publicCatalogItemSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
