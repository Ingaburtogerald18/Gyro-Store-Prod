import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CATÁLOGO ──
// ============================================================================

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
// `services/catalogPresenter.ts`, que es quien sabe normalizar ambas.
export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
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
// negocio hacia atrás (doc 11 §3), así que NUNCA se sirven en endpoints públicos.
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
// Por eso el backend aplica un presentador (server/services/catalogPresenter.ts)
// y responde ESTE shape: plano, camelCase, listo para pintar. Es el mismo contrato
// que ya consume el storefront, así que los componentes se reciclan sin tocarse.
export const specRowSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const catalogProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().optional(),
  // Nombre de la categoría a la que pertenece
  category: z.string(),
  categoryId: z.string().uuid().nullable().optional(),
  images: z.array(z.string()),
  price: z.number(),
  compareAtPrice: z.number().optional(),
  stock: z.number(),
  isPromo: z.boolean(),
  specs: z.array(specRowSchema),
  // Opciones no-color ofrecidas: alimentan las pills de la tarjeta.
  axesSummary: z.array(z.string()),
  // Nº de combinaciones: si es >1 hay que elegir variante antes de agregar.
  variantCount: z.number().int(),
  templateId: z.string().nullable(),
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
export const catalogVariantSchema = z.object({
  variantName: z.string(),
  axisValues: z.array(z.string()),
  price: z.number(),
  stock: z.number().int(),
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
    }).optional().default({}),
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

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CATÁLOGO (ADMIN) ──
// ============================================================================

// ── Plantillas (el molde reutilizable) ──
//
// Un eje es una dimensión de variante: "Color" con opciones ["Negro", "Azul"].
// `key` es el id interno (llave en `axis_options`), `label` lo que ve el
// cliente. `isColor` marca el eje que se representa con fotos en vez de texto.
export const templateAxisSchema = z.object({
  key: z.string().min(1, 'La clave del eje es obligatoria.').max(40),
  label: z.string().min(1, 'La etiqueta del eje es obligatoria.').max(60),
  options: z.array(z.string().min(1).max(60)).min(1, 'Cada eje necesita al menos una opción.').max(40),
  isColor: z.boolean().optional(),
});
export type TemplateAxis = z.infer<typeof templateAxisSchema>;

export const templateInputSchema = z.object({
  name: z.string().min(2, 'El nombre de la plantilla es obligatorio.').max(120),
  description: z.string().max(3000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
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
  categoryId: z.string().uuid().nullable(),
  axes: z.array(templateAxisSchema),
  specs: z.array(specRowSchema),
  updatedAt: z.string(),
});
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;

// ── Vínculo variante ↔ bodega ──
//
// Cada combinación exacta de opciones ("Negro / Con micrófono") apunta a uno o
// más lotes de `purchases` POR SU CÓDIGO. Se guardan varios porque un lote se
// agota y entra otro del mismo artículo: mientras alguno tenga disponible, la
// variante se vende. El stock mostrado es la SUMA de los lotes vinculados.
//
// `price` es un override opcional: si falta, la variante usa el precio del
// producto. Nunca se guarda la disponibilidad a mano — se deriva del stock.
export const variantMappingSchema = z.object({
  codes: z.array(z.string().min(1).max(40)).max(20),
  price: z.number().min(0).max(9_999_999).optional(),
});
export type VariantMapping = z.infer<typeof variantMappingSchema>;

export const variantMappingsSchema = z.record(z.string().max(200), variantMappingSchema);
export type VariantMappings = z.infer<typeof variantMappingsSchema>;

// Entrada del formulario de producto del panel. Los precios, imágenes y el
// vínculo con bodega viven en `catalog_items`; los ejes y las specs base vienen
// del molde (`templates`), que el producto solo referencia.
export const adminProductInputSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio.').max(120),
  description: z.string().max(2000).optional(),
  // Precio de venta. Se permite 0 para "consultar precio".
  price: z.number().min(0, 'El precio no puede ser negativo.').max(9_999_999),
  // Precio "antes": habilita el badge de descuento cuando es mayor que price.
  basePrice: z.number().min(0).max(9_999_999).optional(),
  // `.default([])`: cuando el producto usa un eje de COLOR, el editor oculta la
  // caja de "fotos generales" (muestra fotos por color en su lugar) y react-hook-form
  // deja `images` en `undefined` al desmontar ese campo. Sin el default, la validación
  // fallaba con "expected array, received undefined" y NO dejaba crear productos con
  // template de color. Vacío es lo correcto: la portada sale de la primera foto por color.
  images: z.array(z.string().max(2048)).max(8, 'Máximo 8 imágenes por producto.').default([]),
  // Fotos asignadas por variante de color (ej. "Negro": ["url1", "url2"])
  // `.default([])` en el valor: un color sin fotos llega como `undefined` desde el
  // editor (react-hook-form registra la caja vacía así); sin el default, la validación
  // reventaba con "expected array, received undefined" para ese color.
  colorImages: z.record(z.string().max(60), z.array(z.string().max(2048)).max(8).default([])).optional(),
  // `.default([])` por robustez: las specs vienen del molde, no de este form, así
  // que el campo nunca se registra en react-hook-form; un `undefined` no debe tumbar
  // la validación.
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
  // Recorte de opciones: qué ofrece ESTE producto por eje. Vacío = todas las
  // del molde (misma convención que v1, la respeta `includedOptions`).
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

// ============================================================================
// ── SCHEMAS DEL DOMINIO: LANDING (Hero slider) ──
// ============================================================================

// Una diapositiva del hero. `actionType` "modal" abre "Quiénes Somos";
// "link" navega a `actionTarget`. `locked` (la de marca) impide mover o
// eliminar, pero sí editar.
export const heroSlideSchema = z.object({
  id: z.string().min(1).max(64),
  eyebrow: z.string().max(60),
  title: z.string().max(120),
  description: z.string().max(400),
  mediaUrl: z.string().max(2048),
  mediaType: z.enum(['image', 'video']),
  buttonText: z.string().max(40),
  actionType: z.enum(['modal', 'link']),
  actionTarget: z.string().max(2048),
  locked: z.boolean().optional(),
});

// Techo de diapositivas: el hero es una vitrina, no un carrusel infinito.
export const MAX_HERO_SLIDES = 12;

export const landingConfigSchema = z.object({
  // Ids de categoría en el orden/visibilidad que eligió el admin. Vacío = todas
  // en su orden natural (los nombres salen del catálogo, no de aquí).
  headerCategories: z.array(z.string().max(64)).max(50),
  heroSlides: z.array(heroSlideSchema).max(MAX_HERO_SLIDES),
  // Categorías que se muestran como carriles en la home.
  homeCategories: z.array(z.string().max(64)).max(50).optional(),
});

export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type LandingConfig = z.infer<typeof landingConfigSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: COMBOS ──
// ============================================================================

// Un componente del combo: un producto del catálogo con su cantidad. `name` es
// un snapshot para mostrar el contenido sin re-pedir el catálogo. El precio del
// combo es PLANO (lo fija el admin), NO se calcula de acá.
export const comboItemSchema = z.object({
  catalogItemId: z.string().uuid(),
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(999),
});
export type ComboItem = z.infer<typeof comboItemSchema>;

export const comboSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  price: z.number().nullable(),
  // Contenido del combo: productos del catálogo con su cantidad.
  items: z.array(comboItemSchema),
  images: z.array(z.string()),
  published: z.boolean(),
  sort_order: z.number().int(),
});

// ── Combos (ADMIN) ──
// Entrada del editor del panel (POST/PUT /api/admin/combos, requireAdmin). El
// precio es el del PAQUETE; el servicio lo mapea a las columnas snake_case.
export const adminComboInputSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio.').max(120),
  price: z.number().min(0, 'El precio no puede ser negativo.').max(9_999_999),
  images: z.array(z.string().max(2048)).max(8, 'Máximo 8 imágenes por combo.'),
  items: z.array(comboItemSchema).max(30, 'Máximo 30 artículos por combo.'),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
});
export type AdminComboInput = z.infer<typeof adminComboInputSchema>;

export const adminComboSchema = adminComboInputSchema.extend({
  id: z.uuid(),
  updatedAt: z.string(),
});
export type AdminCombo = z.infer<typeof adminComboSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CRM (ADMIN, Fase CRM-A) ──
// ============================================================================
// Ficha 360, agenda de seguimientos y gestión de contactos. El inbox/bot de
// WhatsApp es CRM-B/C y depende de Meta — NO entra acá. Las tablas ya existen
// (migración 0001): contacts, contact_activities, follow_ups.

export const CONTACT_ORIGINS = ['fb_ads', 'organic', 'whatsapp_link', 'referral', 'other'] as const;
export type ContactOrigin = (typeof CONTACT_ORIGINS)[number];
export const CONTACT_ORIGIN_LABELS: Record<ContactOrigin, string> = {
  fb_ads: 'Anuncio FB/IG',
  organic: 'Orgánico',
  whatsapp_link: 'Link WhatsApp',
  referral: 'Referido',
  other: 'Otro',
};

// El pipeline (doc 10 §10 lo deja "a definir"): se arranca con estas etapas. En
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

// ============================================================================
// ── TIPOS INFERIDOS GLOBALES ──
// ============================================================================

export type Template = z.infer<typeof templateSchema>;
export type PublicCatalogItem = z.infer<typeof publicCatalogItemSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type Combo = z.infer<typeof comboSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: PERSONAL (ADMIN) ──
// ============================================================================

// Teléfono nicaragüense o internacional: 8 a 15 dígitos, con `+` opcional.
// El límite de 15 es el máximo de E.164. Sin esta regex, `phone` aceptaba
// cualquier string (incluido un payload de 5 MB o texto para inyectar en el
// mensaje de WhatsApp que se arma después).
//
// Vive acá arriba y no en la sección de checkout porque la usan las dos: los
// schemas se evalúan en orden al cargar el módulo, así que declararla más abajo
// haría que este archivo reventara por TDZ al importarse.
export const PHONE_RE = /^\+?\d{8,15}$/;

// ── Cuenta bancaria de pago ──
//
// FUENTE ÚNICA de bancos y monedas: el dropdown del panel se arma desde estas
// listas, así que agregar un banco es tocar UN lugar. Duplicar la lista en el
// componente es cómo se llega a un select que ofrece una opción que el backend
// rechaza.
export const PAYOUT_BANKS = ['lafise', 'ficohsa', 'bac', 'banpro'] as const;
export const PAYOUT_CURRENCIES = ['NIO', 'USD'] as const;

export type PayoutBank = (typeof PAYOUT_BANKS)[number];
export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];

export const PAYOUT_BANK_LABELS: Record<PayoutBank, string> = {
  lafise: 'Lafise',
  ficohsa: 'Ficohsa',
  bac: 'BAC',
  banpro: 'Banpro',
};

export const PAYOUT_CURRENCY_LABELS: Record<PayoutCurrency, string> = {
  NIO: 'Córdobas (NIO)',
  USD: 'Dólares (USD)',
};

export const bankAccountSchema = z.object({
  bank: z.enum(PAYOUT_BANKS),
  currency: z.enum(PAYOUT_CURRENCIES),
  // Techo de 34: es el largo máximo de un IBAN. El mínimo de 4 descarta un
  // tecleo accidental sin rechazar formatos locales cortos.
  number: z
    .string()
    .trim()
    .min(4, 'El número de cuenta es demasiado corto.')
    .max(34, 'El número de cuenta es demasiado largo.'),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

// Edición del perfil de un empleado. Lo comparten DOS endpoints con alcances
// distintos: el del admin sobre cualquier fila (PATCH /api/admin/users/:id/
// profile, requireAdmin) y el self-service de cada persona sobre la suya
// (PATCH /api/me/profile, requireAnyRole). Mismo contrato porque son los mismos
// campos; lo que cambia es SOBRE QUIÉN se aplica, y eso lo decide la ruta.
//
// Lo que no está acá está afuera a propósito: el correo CORPORATIVO lo administra
// Entra ID, no nosotros — cambiarlo desde el panel dejaría el perfil desalineado
// con la identidad que realmente autentica —, y `roles`/`status`/`deleted_at` son
// administración, no perfil. Al ser un objeto no-estricto, zod DESCARTA esas
// claves si alguien las manda igual: el endpoint self-scoped no puede escalar
// privilegios ni por accidente.
//
// `phone` y `personal_email` admiten `''` además de `undefined`: el formulario
// manda el input vacío cuando el admin borra el dato, y eso significa "limpiar",
// no "no tocar". `.optional()` a secas rechazaría el string vacío. La cuenta
// bancaria usa `null` para lo mismo, porque es un objeto y no un string.
export const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'El nombre no puede estar vacío.').max(80),
    phone: z
      .string()
      .max(20, 'El teléfono es demasiado largo.')
      .regex(PHONE_RE, 'Ingresá un teléfono válido: 8 a 15 dígitos, con + opcional.')
      .optional()
      .or(z.literal('')),
    personal_email: z
      .string()
      .email('Correo personal inválido.')
      .max(120)
      .optional()
      .or(z.literal('')),
    bank_account: z.preprocess(
      (val) => {
        if (val == null || typeof val !== 'object') return val;
        const o = val as Record<string, unknown>;
        if (!o.bank && !o.number) return null;
        return val;
      },
      bankAccountSchema.nullable().optional(),
    ),
    // Foto de perfil ya subida (a R2, vía `/api/upload` o `/api/me/avatar`): acá
    // solo viaja la URL resultante, nunca el archivo. `null` la quita; omitir la
    // clave deja la que estuviera — necesario porque el admin guarda el resto del
    // formulario sin tocar la foto, y un `undefined` interpretado como "borrar"
    // se la comería en cada guardado.
    avatar_url: z
      .string()
      .trim()
      .url('La foto de perfil debe ser una URL válida.')
      .max(500)
      .nullable()
      .optional(),
  })
  // Regla de negocio, no de formulario: Ficohsa solo opera cuentas en dólares.
  // Vive acá y no en el componente para que el backend la rechace igual aunque
  // el request no venga del panel.
  .superRefine((data, ctx) => {
    if (data.bank_account && data.bank_account.bank === 'ficohsa' && data.bank_account.currency !== 'USD') {
      ctx.addIssue({
        code: 'custom',
        path: ['bank_account', 'currency'],
        message: 'Ficohsa solo maneja cuentas en dólares (USD).',
      });
    }
  });
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CHECKOUT PÚBLICO ──
// ============================================================================

// ── Checkout público (doc 04 §6, doc 12: server SIEMPRE recalcula el
// precio, nunca confía en lo que manda el cliente) ──

// Una línea del pedido es UN producto suelto O UN combo, nunca ambos. Los dos
// ids son opcionales en el objeto y el `superRefine` de abajo exige exactamente
// uno: así el tipo refleja que son excluyentes sin partir el schema en dos.
export const publicOrderItemInputSchema = z
  .object({
    catalogItemId: z.uuid().optional(),
    // Paquete publicado (tabla `combos`). Igual que con `catalogItemId`, el
    // precio lo resuelve el servidor: el cliente solo dice CUÁL combo quiere.
    comboId: z.uuid().optional(),
    // Techo por línea: sin él, un `quantity` absurdo (1e9) infla el total y puede
    // desbordar los cálculos financieros. El mayoreo real se cotiza con un vendedor.
    quantity: z.number().int().positive().max(999, 'Máximo 999 unidades por producto.'),
    // Variante elegida (ej. "negro / 128GB"). Es SOLO para el mensaje de WhatsApp:
    // el precio nunca depende de esto, lo resuelve el servidor por catalogItemId.
    variantName: z.string().max(120).optional(),
  })
  // Sin esta regla, una línea sin ningún id pasaría la validación y el service
  // la descartaría en silencio — que es exactamente el bug que esto cierra: el
  // combo se veía en el carrito y desaparecía del pedido.
  .superRefine((item, ctx) => {
    if (Boolean(item.catalogItemId) === Boolean(item.comboId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['catalogItemId'],
        message: 'Cada línea debe referenciar un producto o un combo, no ambos ni ninguno.',
      });
    }
  });

// Los campos que llena la PERSONA, sin los ítems. Se exporta aparte para que el
// formulario del checkout derive de acá (DESIGN.md §6b: derivar, no reescribir)
// en vez de mantener una copia de las mismas reglas.
export const publicOrderFieldsSchema = z.object({
  phone: z
    .string()
    .min(1, 'El teléfono es obligatorio.')
    .max(20, 'El teléfono es demasiado largo.')
    .regex(PHONE_RE, 'Ingresá un teléfono válido: 8 a 15 dígitos, con + opcional.'),

  // ── Datos de contacto y entrega ──
  // Alimentan el mensaje de WhatsApp, que es el canal donde se cierra el pedido
  // en el MVP (doc 06). Hoy la tabla `public_orders` solo guarda teléfono y
  // total; persistirlos requiere una migración pendiente (ver 0005 propuesta).
  customerName: z.string().min(2, 'Ingresá tu nombre.').max(80),
  deliveryMethod: z.enum(['retiro', 'envio']),
  address: z.string().max(200).optional(),
  // Link de Google Maps con el pin del cliente (opcional, lo llena el botón GPS).
  locationUrl: z.string().max(300).optional(),
  note: z.string().max(500).optional(),
  // Código de descuento opcional (incentivo por reseña). El servidor lo canjea
  // atómicamente y recalcula el total: nunca se confía en el monto del cliente.
  discountCode: z.string().max(30).optional(),
});

// Para envío hace falta dirección escrita O ubicación GPS: sin ninguna de las
// dos, el pedido no es despachable y solo generaría una ida y vuelta por chat.
// Exportada porque la aplican los dos: el contrato del endpoint y el formulario
// del checkout. Una sola definición, un solo mensaje.
export const hasDeliveryDestination = (d: {
  deliveryMethod: 'retiro' | 'envio';
  address?: string;
  locationUrl?: string;
}) =>
  d.deliveryMethod !== 'envio' || (d.address ?? '').trim().length > 4 || Boolean(d.locationUrl);

export const DELIVERY_DESTINATION_MESSAGE =
  'Agregá tu dirección o compartí tu ubicación para el envío.';

export const publicOrderInputSchema = publicOrderFieldsSchema
  .extend({
    // Techo de líneas por pedido: acota el trabajo que un request anónimo puede
    // pedirle a la DB (el service consulta y luego inserta una fila por ítem).
    items: z
      .array(publicOrderItemInputSchema)
      .min(1, 'El pedido necesita al menos un ítem.')
      .max(50, 'El pedido no puede tener más de 50 productos distintos.'),
    // Sesión anónima de analítica (opcional, sin PII). El cliente la manda para
    // enlazar el pedido con el resto del embudo (evento `order_created`). No
    // influye en precios ni en nada del pedido; si no vino, el pedido igual se crea.
    sessionId: z.string().max(64).optional(),
  })
  .refine(hasDeliveryDestination, {
    message: DELIVERY_DESTINATION_MESSAGE,
    path: ['address'],
  });

export type PublicOrderItemInput = z.infer<typeof publicOrderItemInputSchema>;
export type PublicOrderFields = z.infer<typeof publicOrderFieldsSchema>;
export type PublicOrderInput = z.infer<typeof publicOrderInputSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CONFIGURACIÓN FINANCIERA (app_config) ──
// ============================================================================

export const costoFUScaleItemSchema = z.object({
  maxCost: z.number().nullable(), // null significa infinito (catch-all)
  amount: z.number().min(0),
});

export const pozosSchema = z.object({
  publicidad: z.number().min(0).max(1),
  mantenimiento: z.number().min(0).max(1),
  utiles: z.number().min(0).max(1),
  garantias: z.number().min(0).max(1),
  prestamos: z.number().min(0).max(1),
  suscripciones: z.number().min(0).max(1),
  servicios: z.number().min(0).max(1),
});

export const marginScaleItemSchema = z.object({
  maxCost: z.number().nullable(),
  margin: z.number().min(0).max(1),
});

export const commissionScaleItemSchema = z.object({
  maxProfit: z.number().nullable(),
  margin: z.number().min(0).max(1),
});

export const wholesaleDiscountItemSchema = z.object({
  minQty: z.number().int().min(2),
  discount: z.number().min(0).max(1),
});

export const financialConfigSchema = z.object({
  exchangeRate: z.number().positive('Debe ser mayor a 0'),
  salaryPercentage: z.number().min(0).max(1),
  minMarginMultiplier: z.number().min(1).default(1.15),
  costoFUScale: z.array(costoFUScaleItemSchema).min(1, 'Se requiere al menos un tramo'),
  pozos: pozosSchema,
  marginScale: z.array(marginScaleItemSchema).min(1, 'Se requiere al menos un tramo'),
  commissionScale: z.array(commissionScaleItemSchema).min(1, 'Se requiere al menos un tramo'),
  wholesaleDiscounts: z.array(wholesaleDiscountItemSchema),
}).refine((data) => {
  const sum = Object.values(data.pozos).reduce((acc, val) => acc + val, 0);
  return Math.abs(sum - 1.0) < 0.001; // Tolerancia flotante
}, {
  message: 'La suma de los pozos debe ser exactamente 100%.',
  path: ['pozos'],
});

export type FinancialConfig = z.infer<typeof financialConfigSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: INVENTARIO (ADMIN) ──
// ============================================================================
// Contrato de entrada de server/routes/inventory.ts. Los shapes de salida
// (Purchase, InventoryRow, InventoryKpis) viven como interfaces
// TS en server/services/inventory.ts, no acá: son datos derivados que arma el
// servicio, no algo que un cliente mande y haya que validar en el borde.

export const newPurchaseInputSchema = z.object({
  purchaseDate: z.iso.date(),
  lot: z.string().min(1, 'El lote es obligatorio.').max(40),
  productName: z.string().min(1, 'El nombre del producto es obligatorio.').max(160),
  category: z.string().min(1, 'La categoría es obligatoria.').max(80),
  // >0: una compra de 0 unidades no tiene sentido y dividiría por cero en
  // finance.ts al recibirla (doc 11 §1: costo unitario origen = total/cantidad).
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0.'),
  costUnit: z.number().min(0),
  taxUnit: z.number().min(0),
  suggestedPrice: z.number().min(0).optional(),
});
export type NewPurchaseInput = z.infer<typeof newPurchaseInputSchema>;

// Edición post-creación. Deliberadamente NO es un `Partial<Purchase>` real:
// solo expone los campos de negocio editables a mano (insumos de costeo,
// identificación del lote). `status`, `quantitySold`, `quantityReserved`,
// `priceUnit`/`total` (derivados) quedan fuera — esos los mueven
// reportArrival/revertPurchase/el FIFO, no una edición libre.
export const updatePurchaseInputSchema = z.object({
  purchaseDate: z.iso.date().optional(),
  lot: z.string().min(1).max(40).optional(),
  code: z.string().min(1).max(40).optional(),
  productName: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(80).optional(),
  quantity: z.number().int().positive().optional(),
  costUnit: z.number().min(0).optional(),
  taxUnit: z.number().min(0).optional(),
  shippingUnit: z.number().min(0).optional(),
  suggestedPrice: z.number().min(0).optional(),
});
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseInputSchema>;

export const arrivalInputSchema = z.object({
  arrivalDate: z.iso.date(),
  shippingUnit: z.number().min(0),
  suggestedPrice: z.number().min(0).optional(),
});
export type ArrivalInput = z.infer<typeof arrivalInputSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: VENTAS (ADMIN/SELLER) ──
// ============================================================================
// MVP de Hito 3 (doc 09 ítem 60): cotizar, registrar, aprobar, rechazar,
// listar. Sin fotos de recibo, sin venta vía ticket de factura, sin edición
// post-aprobación ni pago de comisiones por lotes — ver doc 11 §4-5 para la
// cadena financiera que server/services/sales.ts arma con estos datos.

export const saleLineInputSchema = z.object({
  // Mismo límite que inventario (doc 09 ítem 51): sin un catalog_item_id real
  // en purchases todavía, el producto se identifica por nombre, no por SKU.
  productName: z.string().min(1, 'El producto es obligatorio.').max(160),
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0.'),
  salePrice: z.number().min(0),
  // Mayoreo es herramienta del cotizador (doc 11 §5), no automático: default
  // true a nivel de servicio, pero el vendedor lo puede desactivar por línea.
  applyWholesale: z.boolean().optional(),
});
export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

export const quoteInputSchema = z.object({
  items: z.array(saleLineInputSchema).min(1, 'Selecciona al menos un producto.').max(50),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const registerSaleInputSchema = z.object({
  // Código de la factura tal como se imprime (`GS-PR-12`). Se acepta string
  // porque es lo que el vendedor copia del ticket; `parseInvoiceCode` en
  // services/invoice.ts lo resuelve al correlativo numérico (y tolera "12").
  invoiceNumber: z.union([z.string().trim().max(20), z.number().int().positive()]).optional(),
  customerName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  overrideSellerId: z.string().uuid().optional(),
  overrideSellerName: z.string().max(100).optional(),
  items: z
    .array(saleLineInputSchema)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.productName)).size === items.length, {
      message: 'No repitas el mismo producto en dos líneas: sumá la cantidad en una sola.',
    }),
}).refine((data) => data.invoiceNumber || (data.items && data.items.length > 0), {
  message: 'La venta necesita al menos un producto o un número de factura.',
  path: ['items'],
});
export type RegisterSaleInput = z.infer<typeof registerSaleInputSchema>;

export const updateSaleInputSchema = z.object({
  customerName: z.string().max(100).optional(),
  phone: z.string().optional(),
  overrideSellerId: z.string().uuid().optional(),
  overrideSellerName: z.string().max(100).optional(),
  items: z.array(saleLineInputSchema).min(1, 'Selecciona al menos un producto.').max(50),
  reason: z.string().optional(),
});
export type UpdateSaleInput = z.infer<typeof updateSaleInputSchema>;

export const rejectSaleInputSchema = z.object({
  reason: z.string().min(1, 'El motivo de rechazo es obligatorio.').max(500),
});
export type RejectSaleInput = z.infer<typeof rejectSaleInputSchema>;

// ── Pago de comisiones (doc 11 §4) ──
// El comprobante viaja como URL ya subida a `POST /api/upload`, no como
// multipart: v2 centraliza las subidas ahí y así esta ruta queda siendo JSON.
//
// El `refine` es la regla de auditoría: un pago sin comprobante Y sin
// justificación es un movimiento de dinero sin rastro. La base lo repite como
// CHECK constraint — el borde valida para dar un mensaje útil, la tabla para
// que no entre por ninguna otra puerta.
const payoutProofSchema = {
  paymentMethod: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  receiptUrl: z.string().max(2048).optional(),
  noReceiptComment: z.string().max(500).optional(),
};

const hasProof = (d: { receiptUrl?: string; noReceiptComment?: string }) =>
  Boolean(d.receiptUrl?.trim() || d.noReceiptComment?.trim());
const proofMessage = {
  message: 'Subí el comprobante o justificá por qué no lo hay.',
  path: ['receiptUrl'],
};

export const payCommissionInputSchema = z
  .object({
    sellerEmail: z.string().email('Vendedor inválido.'),
    orderIds: z
      .array(z.uuid())
      .min(1, 'Elegí al menos una venta para pagar.')
      .max(200, 'Máximo 200 ventas por lote.'),
    ...payoutProofSchema,
  })
  .refine(hasProof, proofMessage);
export type PayCommissionInput = z.infer<typeof payCommissionInputSchema>;

export const settleBalanceInputSchema = z
  .object({
    sellerEmail: z.string().email('Vendedor inválido.'),
    ...payoutProofSchema,
  })
  .refine(hasProof, proofMessage);
export type SettleBalanceInput = z.infer<typeof settleBalanceInputSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: FACTURACIÓN (ADMIN/CASHIER) ──
// ============================================================================
// Modelo delgado (doc 09 ítem 61): la factura numera una venta YA aprobada
// (server/services/sales.ts) — no tiene líneas propias, esas viven en
// order_items. `invoiceNumber` nunca lo manda el cliente: lo asigna el
// `nextval()` de la secuencia en server/services/invoice.ts.
export const invoiceItemInputSchema = z.object({
  productName: z.string().min(1, 'El producto es obligatorio.').max(160),
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0.'),
  unitPrice: z.number().min(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const createInvoiceInputSchema = z.object({
  customerName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  deliveryFee: z.number().min(0).optional(),
  deliveryName: z.string().max(100).optional(),
  discount: z.number().min(0).optional(),
  // Código de descuento opcional: el servidor lo canjea y suma su monto al
  // descuento manual (topado al subtotal). Ver server/services/discountCode.ts.
  discountCode: z.string().max(30).optional(),
  // Vendedor al que Caja le asigna esta factura (opcional: un ticket de
  // mostrador puede no tener uno). Es lo que después le permite a ESE
  // vendedor verla en "Mis Facturas" antes de que exista una venta vinculada.
  sellerUid: z.string().uuid().optional(),
  items: z.array(invoiceItemInputSchema).min(1, 'La factura necesita al menos un producto.'),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;

// Anular exige motivo: una factura anulada sin explicación es un hueco en la
// auditoría. El correlativo conserva el número — no se borra nunca.
export const voidInvoiceInputSchema = z.object({
  reason: z.string().min(1, 'El motivo de anulación es obligatorio.').max(500),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceInputSchema>;

// Corrección de datos de cobro. `orderId` no se puede cambiar: reasignar una
// factura a otra venta rompería la trazabilidad del correlativo.
// Corregir una factura huérfana con el MISMO formulario con que se emitió,
// líneas incluidas. Solo aplica a facturas `unlinked`: una vez ligada a una
// venta, el snapshot financiero ya se calculó sobre estos números.
//
// El CÓDIGO de descuento no se puede cambiar acá: ya se canjeó al emitir, y
// volver a aplicarlo consumiría otro uso. El monto `discount` se conserva.
export const updateInvoiceInputSchema = z.object({
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']).optional(),
  deliveryFee: z.number().min(0).max(9_999_999).optional(),
  customerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  deliveryName: z.string().trim().max(120).optional(),
  items: z
    .array(
      z.object({
        productName: z.string().trim().min(1).max(200),
        quantity: z.number().int().positive().max(100_000),
        unitPrice: z.number().min(0).max(9_999_999),
      }),
    )
    .min(1)
    .optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceInputSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CÓDIGOS DE DESCUENTO (ADMIN + PÚBLICO) ──
// ============================================================================
// Portado de v1 (server/utils/validators.js → discountCodeSchema). El admin
// emite el código; el canje real (que consume un uso) lo hace el servidor
// atómicamente en server/services/discountCode.ts. `maxUses = 0` = ilimitado.
export const DISCOUNT_TYPES = ['percent', 'fixed'] as const;

// `code` NO está en el input: lo genera la base con la secuencia `GS-DC-N`
// (migración 0011). El cliente no lo manda ni lo puede elegir.
export const discountCodeSchema = z
  .object({
    type: z.enum(DISCOUNT_TYPES),
    value: z.number().positive('Debe ser mayor a 0'),
    maxUses: z.number().int().nonnegative().optional().default(1), // 0 = ilimitado
    expiresAt: z.string().optional().or(z.literal('')), // yyyy-mm-dd o vacío = sin vencimiento
    // En el panel se muestra como «Descripción»; la columna sigue siendo `note`.
    note: z.string().max(200).optional().default(''),
  })
  .refine((d) => d.type !== 'percent' || d.value <= 100, {
    message: 'Un descuento por porcentaje no puede superar 100%',
    path: ['value'],
  });
export type DiscountCodeInput = z.infer<typeof discountCodeSchema>;

// Preview público (no consume uso): solo se valida que el código exista/sirva.
export const validateDiscountCodeSchema = z.object({
  code: z.string().min(1, 'Código requerido').max(30),
});
export type ValidateDiscountCodeInput = z.infer<typeof validateDiscountCodeSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CUOTAS (ADMIN) ──
// ============================================================================
// Mismo modelo delgado que facturación: el plan de cuotas envuelve una venta
// YA aprobada (server/services/sales.ts) — no repite FIFO ni comisión, solo
// agenda el cobro. `total` sale de `orders.total`, no lo manda el cliente.
export const createInstallmentPlanInputSchema = z.object({
  orderId: z.uuid(),
  numCuotas: z.number().int().min(2, 'Mínimo 2 cuotas.').max(36),
  firstDue: z.iso.date(),
});
export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanInputSchema>;

export const registerInstallmentPaymentInputSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0.'),
  method: z.enum(['efectivo', 'transferencia', 'tarjeta']).optional(),
  note: z.string().max(300).optional(),
});
export type RegisterInstallmentPaymentInput = z.infer<typeof registerInstallmentPaymentInputSchema>;

// ============================================================================
// ── SCHEMAS DEL DOMINIO: CONTACTO PÚBLICO / CRM (doc 09 ítems 33-34) ──
// ============================================================================
// El formulario público de "Contacto" captura el lead directo en el CRM
// (contacts/contact_activities) — v1 solo mandaba un correo (sin servicio de
// email en v2 todavía). Teléfono obligatorio: es la clave de `contacts.phone`
// (unique) — mismo criterio que doc 14 ("teléfono siempre obligatorio, es la
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

// ============================================================================
// ── SCHEMAS DEL DOMINIO: OPERACIÓN DIARIA (CAJA, CUADRE) ──
// ============================================================================

export const cuentaTipoSchema = z.enum(['banco', 'efectivo']);
export const movimientoTipoSchema = z.enum(['ingreso', 'egreso']);

export const accountSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  tipo: cuentaTipoSchema,
  moneda: z.string(),
  // El dinero con el que arranca la cuenta. Suma al saldo calculado; permite
  // reflejar la plata que ya había ANTES de registrar el primer movimiento.
  saldo_inicial: z.number(),
  activo: z.boolean(),
  created_at: z.string(),
});
export type Account = z.infer<typeof accountSchema>;

export const createAccountInputSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(80),
  tipo: cuentaTipoSchema,
  moneda: z.string().min(1).max(8).default('NIO'),
  saldo_inicial: z.coerce.number().min(0, 'El saldo inicial no puede ser negativo').default(0),
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const accountMovementSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  tipo: movimientoTipoSchema,
  monto: z.number(),
  categoria: z.string(),
  descripcion: z.string().nullable(),
  comprobante_url: z.string().nullable(),
  // Presente en las dos patas de un traspaso entre cuentas; null en el resto.
  transfer_id: z.string().uuid().nullable(),
  ocurrio_at: z.string(),
  registrado_por: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type AccountMovement = z.infer<typeof accountMovementSchema>;

export const registerMovementInputSchema = z.object({
  account_id: z.string().uuid('Cuenta inválida'),
  tipo: movimientoTipoSchema,
  monto: z.coerce.number().positive('El monto debe ser positivo'),
  categoria: z.string().min(1, 'Categoría requerida'),
  descripcion: z.string().optional().nullable(),
  comprobante_url: z.string().optional().nullable(),
  ocurrio_at: z.string().optional(),
});
export type RegisterMovementInput = z.infer<typeof registerMovementInputSchema>;

// Traspaso entre dos cuentas propias (ej. depositar el efectivo de la caja al
// banco). Genera dos movimientos ligados por un transfer_id: egreso en `from`,
// ingreso en `to`. No cambia el patrimonio total, solo lo mueve de lugar.
export const registerTransferInputSchema = z
  .object({
    from_account_id: z.string().uuid('Cuenta de origen inválida'),
    to_account_id: z.string().uuid('Cuenta de destino inválida'),
    monto: z.coerce.number().positive('El monto debe ser positivo'),
    descripcion: z.string().max(300).optional().nullable(),
    ocurrio_at: z.string().optional(),
  })
  .refine((d) => d.from_account_id !== d.to_account_id, {
    message: 'El origen y el destino no pueden ser la misma cuenta',
    path: ['to_account_id'],
  });
export type RegisterTransferInput = z.infer<typeof registerTransferInputSchema>;

// Catálogo de categorías de gasto, editable desde el panel. Se guarda como JSON
// en app_config (mismo criterio que las categorías del storefront). Texto simple
// deduplicado: el objetivo es que "Luz" no conviva con "luz" y "Pago Luz".
export const expenseCategoriesSchema = z.array(z.string().trim().min(1).max(60)).max(60);
export type ExpenseCategories = z.infer<typeof expenseCategoriesSchema>;

// ── Cierre de caja (arqueo) ──
export const cashClosureSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  fecha: z.string(),
  saldo_esperado: z.number(),
  saldo_contado: z.number(),
  diferencia: z.number(),
  notas: z.string().nullable(),
  cerrado_por: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type CashClosure = z.infer<typeof cashClosureSchema>;

export const createCashClosureInputSchema = z.object({
  account_id: z.string().uuid('Cuenta inválida'),
  // Lo que se contó FÍSICAMENTE. El esperado y la diferencia los calcula el
  // servidor: el cliente no debe poder afirmar cuánto "debería" haber.
  saldo_contado: z.coerce.number().min(0, 'El monto contado no puede ser negativo'),
  notas: z.string().max(500).optional().nullable(),
});
export type CreateCashClosureInput = z.infer<typeof createCashClosureInputSchema>;