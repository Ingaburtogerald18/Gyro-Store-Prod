import { z } from 'zod';
import type { wholesaleDiscountItemSchema } from './finance-config';

// ── CATEGORÍAS UNIFICADAS ──
// Fuente de verdad única para el panel y el catálogo público.
export const categorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  icon: z.string().max(16).nullable().optional(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoryInputSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones.'),
  name: z.string().min(1).max(100),
  icon: z.string().max(16).nullable().optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

// Schema base para los templates de productos.
//
// `axes`/`specs` se validan como jsonb OPACO a propósito. La forma canónica de
// `axes` es un array ordenado ([{ key, label, options, isColor }]), pero en la
// base conviven filas viejas con forma de diccionario. Fijar acá una de las dos
// haría que la otra reventara con un 500 en la validación, ANTES de llegar a
// `modules/catalog/catalog-presenter.ts`, que es quien sabe normalizar ambas.
export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  description: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  category: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  axes: z.unknown(),
  specs: z.unknown(),
});

// Vista PÚBLICA del ítem de catálogo: lo único que puede salir al storefront.
//
// Es la BASE del contrato y el schema interno la extiende, no al revés. La
// dirección importa: si mañana se agrega una columna sensible (un costo, un
// margen), no se vuelve pública por olvido — hay que agregarla acá a mano.
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

// Vista INTERNA (panel/admin): agrega los precios calculados de la cadena
// financiera. `precio_sugerido` y `precio_tentativo` dejan leer el margen del
// negocio hacia atrás (Docs/03-Finanzas.md §3), así que NUNCA se sirven en endpoints públicos.
export const catalogItemSchema = publicCatalogItemSchema.extend({
  precio_sugerido: z.number().nullable(),
  precio_tentativo: z.number().nullable(),
});

// ── Contrato de CABLE del catálogo público ──
//
// `publicCatalogItemSchema` (arriba) valida lo que sale de la BASE: filas crudas
// en snake_case con el template anidado y jsonb opacos. Eso NO es lo que conviene
// mandarle al navegador: armar el nombre, resolver las variantes desde los ejes y
// sumar stock es trabajo de servidor (necesita tablas que el cliente no ve).
//
// Por eso el backend aplica un presentador (server/modules/catalog/catalog-presenter.ts)
// y responde ESTE shape: plano, camelCase, listo para pintar. Es el mismo contrato
// que ya consume el storefront, así que los componentes se reciclan sin tocarse.
export const specRowSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// Disponibilidad cualitativa: lo único que el cliente ve del inventario.
//   · available   → hay unidades en los lotes vinculados.
//   · coming_soon → sin unidades en bodega y con una compra en camino. Sin precio
//                   y no se puede pedir.
//   · sold_out    → la variante está vinculada a bodega y no quedan unidades.
//   · unknown     → no hay vínculo con bodega (o no tiene precio): se ofrece
//                   «Consultar disponibilidad» por WhatsApp, nunca como compra.
export const AVAILABILITY = ['available', 'coming_soon', 'sold_out', 'unknown'] as const;
export const availabilitySchema = z.enum(AVAILABILITY);
export type Availability = z.infer<typeof availabilitySchema>;

export const catalogProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().optional(),
  // Nombre de la categoría a la que pertenece
  category: z.string(),
  categoryId: z.string().uuid().nullable().optional(),
  images: z.array(z.string()),
  // Precio que muestra la tarjeta: el menor de las variantes comprables (o de
  // todas, si ninguna lo es). Con `priceFrom` se presenta como «Desde …». Es 0
  // en «Próximamente», que no muestra precio.
  price: z.number(),
  // Precio «antes» SOLO cuando todas las variantes comparten el mismo precio y
  // la misma rebaja: una tarjeta no muestra la rebaja del modelo entero si
  // solo una variante está rebajada.
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
  // Con UNA sola combinación, su identidad: la tarjeta agrega directo sin
  // inventar una variante «Estándar».
  singleVariant: z.string().optional(),
  templateId: z.string().nullable(),
  // Solo en la vista previa del modo edición: la tienda real nunca lo manda.
  unpublished: z.boolean().optional(),
});

// Eje de variante ya resuelto (ej. { key: 'color', options: ['negro', ...] }).
// Solo se expone en el DETALLE: la tarjeta del listado no necesita el árbol
// completo de opciones, le alcanza con `axesSummary`.
export const catalogAxisSchema = z.object({
  key: z.string(),
  // Etiqueta visible del eje ("Tipo de conector"). Sin ella el selector de la
  // ficha tendría que mostrar el id interno.
  label: z.string(),
  options: z.array(z.string()),
  isColor: z.boolean(),
});

// Una combinación concreta de opciones, con su precio y su stock REAL ya
// resuelto contra bodega. Los códigos de lote que la respaldan no viajan: son
// datos internos del inventario.
// `variantName` es la IDENTIDAD de la combinación: las opciones en el orden de
// los ejes unidas con ' / ' — la misma llave con la que el panel guarda el
// vínculo con bodega (`variant_mappings`). El servidor la resuelve contra el
// producto al crear el pedido; nunca confía en el precio ni el stock del cliente.
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

// FUENTE ÚNICA de bancos y monedas de las cuentas de la TIENDA (distintas de las
// de pago al vendedor, más abajo: PAYOUT_BANKS). El `<select>` del panel se arma
// desde estas listas; duplicarlas en el componente es cómo se llega a una opción
// que el backend rechaza.
export const STORE_BANKS = ['BAC', 'Lafise', 'Banpro', 'Ficohsa'] as const;
export const STORE_CURRENCIES = ['NIO', 'USD'] as const;

export const storeBankAccountSchema = z.object({
  // `''` es el estado "todavía sin elegir": una cuenta recién agregada nace vacía
  // y el select muestra su placeholder. Sin este literal, el formulario no podría
  // ni representar una fila nueva — agregar una cuenta sería un error de tipos.
  // El `superRefine` de `businessInfoSchema` la rechaza al guardar, así que vacía
  // nunca llega a la base.
  bank: z.enum(STORE_BANKS).or(z.literal('')),
  currency: z.enum(STORE_CURRENCIES),
  number: z.string().trim().min(4, 'Número demasiado corto.').max(40, 'Número demasiado largo.'),
  holder: z.string().max(80).optional(),
});
export type StoreBankAccount = z.infer<typeof storeBankAccountSchema>;

// Información del negocio editable desde el panel (pestaña "General"). Vive en
// `app_config` (key 'business_info'); el valor inicial se siembra desde las env
// vars (BRAND_NAME/WHATSAPP_NUMBER/CONTACT_EMAIL). Sin .default() a propósito
// (divergiría input/output y rompe zodResolver en el form).
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
  })
  // El banco vacío se permite MIENTRAS se llena el formulario (ver
  // `storeBankAccountSchema`), pero no al guardar. El error se dirige a la fila
  // exacta para que salga bajo ese select y no como un mensaje suelto arriba.
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
