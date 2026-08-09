# PORT-CATALOGO-V1 — Fase 0: análisis y tabla de brechas

> ⚠️ **MAYORMENTE EJECUTADO — la tabla de brechas quedó desactualizada.** El texto de abajo se
> escribió antes de tocar el storefront (por eso dice "no se ha tocado una línea"), y desde entonces
> se portó casi todo. Verificado contra el código:
>
> | Brecha que el doc marca como pendiente | Estado real |
> |---|---|
> | Estado de filtros en `uiSlice` `[NUEVO]` | ✅ hecho (`search`, `activeCategory`, `priceMin/Max`, `sort`, `onlyOnSale`, `onlyInStock`, `filterSheetOpen`) |
> | Búsqueda y filtros `[NUEVO]` | ✅ hecho (`search-bar`, `filter-bar`, `filter-sheet`, `active-filters`) |
> | `CategoriesDrawer` `[NUEVO]` | ✅ hecho (`store/categories-drawer.tsx`) |
> | **Bug: los combos desaparecían del pedido** (§1.5) | ✅ **corregido** — `toOrderItems` manda `comboId` y el schema lo acepta |
>
> **No lo leas como backlog sin verificar fila por fila.** Lo que conserva valor son las
> **decisiones** —§1.1 (Rhea, no Maia), §1.2 (el skin `.cn-*` está inerte), §1.6 (mega-menú de
> productos buscados en vez de fingir subcategorías)— y los ítems `[BLOQUEADO]`, que dependen de
> campos de configuración que todavía no existen (`socialLinks`, `reviewLinks`, `ogImageUrl`).

---

## 0. Los dos repos

| Repo | Ruta | Nota |
|---|---|---|
| **V1 (referencia)** | `C:\Users\Gerald\Desktop\Gyro_Store_Web_Page_Version2-main` | **Esta es la buena.** Corresponde a `origin/main` — la que corre en gyrostorenic.com. Remix + Firebase Firestore + Express en JS. |
| Actual (destino) | `D:\Gyro-Store` | `App/frontend` (Remix) + `App/server` (Express/TS) + `App/shared/schemas.ts` + Supabase. |

> **Copia a ignorar:** `D:\Gyro_Store_Web_Page_Version2` es un working tree viejo
> (`HEAD d662291` ≠ `origin/main 79d6fef`). Le faltan `HeroSlideEditorModal`, `heroSlides`,
> toda la carpeta `components/public/`, la telemetría de búsqueda y el mega-menú del header.
> **No usarla como referencia.** Este documento está reescrito contra la copia buena.

---

## 1. Correcciones a las premisas del encargo

### 1.1 El style es **Rhea** en el código y **Maia** en el `DESIGN.md`

- `App/frontend/app/root.tsx:63` pone `className="style-rhea"` en `<html>`.
- `App/frontend/app/tailwind.css:21` hace `@import "./style-rhea.css"`.
- Existe `App/frontend/app/style-rhea.css` (1680 líneas). **No existe `style-maia.css`.**
- Pero `DESIGN.md` dice *"style **Maia**"* y referencia `app/style-maia.css` en §1 y §5.

El prompt dice "Rhea", que coincide con el código. **Decisión tomada: se actualiza el doc a Rhea.**

### 1.2 El skin `.cn-*` está **inerte**

`style-rhea.css` define ~404 selectores `.cn-*`, pero **ninguna primitiva de
`components/ui/*.tsx` los usa**: `button.tsx`, `badge.tsx`, `input.tsx`, `sheet.tsx` se
estilizan con `cva` + Tailwind inline. Verificado: `grep "cn-btn|cn-badge|cn-input|cn-card"` en
`components/ui/` → **0 resultados**.

La regla del encargo *"la apariencia vive en `style-rhea.css`"* no describe el proyecto actual.
En la práctica, "vestir con Rhea" = **usar las primitivas tal como están y no repintarlas**.

### 1.3 El Hero del V1 **ya está portado**

`catalog/hero.tsx` del proyecto actual **es** el hero del V1 (`origin/main`): slider de slides
editables, SSR con `initialLanding`, autoplay pausable, flechas, dots con barra de progreso.
Su propio comentario lo dice: *"portado de la versión que corre hoy en la tienda"*.

**No hay hero que portar.** Lo que sí falta del lado V1: `HeroSlideEditorModal` (edición inline
de slides desde el admin) y `uploadHeroSlide` (subida de media del slide a R2). Eso es admin, no
catálogo público. Y queda la deuda de diseño del hero actual (§5).

### 1.4 "Comprados juntos frecuentemente" **sí usa combos reales** — el encargo tenía razón

`routes/producto.$id.tsx:164` del V1:
```ts
const { data: productCombos } = useGetCombosByProductQuery(product?.id ?? "", { skip: !product });
const combo = productCombos?.[0] ?? null;
```
→ `GET /api/combos?productId=<id>` (`catalogApi.ts:152`), y el combo real se pasa a
`ProductPurchasePanel` → `FrequentlyBoughtTogetherCard`, que muestra el **precio del paquete** y
agrega el combo entero con `comboToCartItem`. El §4.8 del encargo lo describe bien.

### 1.5 Los combos del proyecto actual son una cáscara vacía

El V1 tiene combos completos de punta a punta. El proyecto actual, no:

| | V1 (`origin/main`) | Actual |
|---|---|---|
| Tipo | `Combo { id, name, image, productIds[], price, products[{id,name,image,price}], normalTotal, savings, broken, active }` | `comboSchema { id, name, price, items: unknown[], images: unknown[], published, sort_order }` |
| Endpoints | `GET /`, `GET /:id`, `GET ?productId=`, `POST`, `PUT`, `PATCH /:id/active`, `DELETE`, `POST /upload` | Solo `GET /` y `GET /:id` |
| En la home | `ComboSection` + `ComboCard` (2 fotos, precio tachado, "Ahorrás C$X") | No se piden combos en el loader |
| En la PDP | Venta cruzada con combo real | No existe |
| En el carrito | `comboToCartItem`, línea atómica, contenido listado | El tipo `CartItem` lo soporta, el drawer no lo pinta |
| En el checkout | `items.map(i => ({ catalogId: i.comboId ? "" : i.catalogId, comboId: i.comboId, … }))` | **`toOrderItems` los descarta** |
| Admin | `ComboEditorModal` + `ComboGrid` | No existe |

**Bug activo en producción:** `cartSlice.ts:120-124` filtra las líneas de combo, y
`publicOrderItemInputSchema` (`schemas.ts:454`) exige `catalogItemId: z.uuid()` sin `comboId`.
Hoy podés agregar un combo desde `/combo/:id`, verlo en el carrito, sumarlo al subtotal — y
**desaparece del pedido de WhatsApp**.

### 1.6 El contrato de categorías no tiene subcategorías

`storeCategorySchema` = `{ id, name, icon }`. El V1 tampoco las tiene de verdad: las **fabrica**
en `lib/categories.ts` → `buildCategoryTree()`, inyectando los **productos** de cada categoría
como `subcategories`. Por eso en el mega-menú los "tipos" enlazan a `getProductUrl(sub.id, …)`.

**Decisión tomada:** mega-menú de **productos más buscados**, sin fingir subcategorías.

### 1.7 El V1 tiene tres subsistemas que el proyecto actual no contempla

Aparecieron al leer `origin/main` y no están en el inventario del encargo:

- **Telemetría de búsqueda.** `useSearchTelemetry` (debounce, registra término + nº de
  resultados), `logResultClick` (CTR), `GET /api/search-events/popular` → alimenta el carrusel
  "Artículos Populares" de la home **y** el panel de la búsqueda del header (keywords populares
  + 4 productos destacados). Panel admin: `admin.busquedas`.
- **Reseñas y feedback.** `LeadCapture` ("dejá tu reseña y te damos un código"),
  `ReviewChoiceModal` (Google / Facebook), `FeedbackModal`, `ReviewsWidget`, `SocialProof`,
  `feedbackApi`, panel `admin.feedback`. Se conecta con los códigos de descuento (que el
  proyecto actual **ya tiene**: `discountCodesApi` + `admin.codigos-descuento`).
- **Branding por configuración.** `BusinessConfig.branding` con `logoStaticUrl`,
  `logoAnimatedUrl`, `faviconUrl`, `ticketLogoUrl`, `ogImageUrl`, `founderUrl`,
  `loginBrandUrl`, `loginBrandMobileUrl`. El actual tiene un subconjunto
  (`imageResourcesSchema`: logoStatic, logoAnimated, favicon, posLogo) — **le falta `ogImageUrl`
  y `founderUrl`**.

---

## 2. Inventario real del storefront V1 (`origin/main`)

| Zona | Archivos |
|---|---|
| Rutas públicas | `_index`, `producto.$id`, `combo.$id`, `contacto`, `login` |
| Shell | `StorefrontShell`, `AppShell` (solo admin), `Container`, `PageShell` |
| Header | `PublicHeader` + `public-header/DesktopNav` + `public-header/MegaMenuPanel`, `CategoriesDrawer`, `UserMenu`, `CartButton` |
| Home | `Hero` + `HeroSlideEditorModal`, `SocialLinksStrip`, `QuickLinksStrip`, `ProductCarousel`, `ComboSection`/`ComboCard`, `ProductGrid`, `OurStoryStrip`, `LeadCapture`, `PublicFooter` |
| Otros de home | `TrustStrip`, `SocialProof`, `ReviewsWidget`, `ReviewChoiceModal`, `FeedbackModal`, `CategoryGrid`, `GlassSection`, `BrandStrip` |
| Filtros | `FilterBar`, `ActiveFilters`, `FilterSheet`, `FilterSidebar`, `SearchBar`, `CategoryChips` |
| PDP | `ProductGalleryGrid`, `public/product/{DetailHeader, DetailPrice, StockIndicator, PurchaseCard, ProductPurchasePanel, ProductSpecsPanel, MobileBuyBar, AddToCartButton, WhatsAppButton, TrustBox}`, `VariantPicker`, `VolumePriceCard`, `FrequentlyBoughtTogetherCard`, `TikTokButton`, `MobileStoreActions` |
| Carrito | `CartDrawer`, `CartButton`, `CheckoutModal`, `EditCartItemSheet` |
| Estado | `uiSlice` (search/categoría/precio/orden/toggles/sheets/`heroReplayKey`), `cartSlice`, `hooks/useCatalogFilter`, `hooks/useElementInView`, `hooks/useSearchTelemetry` |
| Helpers | `lib/{categories, storeLinks, trustSignals, chipStyles, detailMotion, searchTelemetry, combo}` |

---

## 3. TABLA DE BRECHAS

Leyenda: **[OK]** cubierto · **[COMPLETAR]** existe pero le falta · **[NUEVO]** no existe ·
**[BLOQUEADO]** falta dato/endpoint · **[DECIDIR]** el actual diverge a propósito ·
**[DEUDA]** existe pero viola el diseño.

### 3.1 Chasis y navegación

| Pieza | ¿Existe hoy? | Qué falta / qué mejorar respecto al V1 | Marca |
|---|---|---|---|
| **Header** `store/store-header.tsx` (82 líneas) | Logo, carrito animado con pop y badge, `HeaderSettingsMenu`, sticky. | El V1 (`PublicHeader`, 351 líneas + 2 subcomponentes) es **mucho más**: (1) **`DesktopNav`** con tabs de categoría y **`MegaMenuPanel`** con scrim; (2) **búsqueda que se expande sobre la nav** (`SearchBar variant="pill" withPanel`) con panel de **keywords populares + 4 productos destacados** desde telemetría; (3) panel de búsqueda móvil full-width; (4) **`CategoriesDrawer`** en móvil; (5) logo que resetea filtros y **rehace la animación del hero** (`triggerHeroReplay`); (6) **edición inline del orden de categorías del header** por el admin, persistida en `landingConfig.headerCategories`. Hoy la búsqueda **no existe** (ni input). | **[COMPLETAR]** |
| **Shell del storefront** | No hay: cada ruta compone su header/main a mano. | `StorefrontShell` monta header + `<main>` con transición de página por `location.pathname`. Resolvería de paso el problema de las 3 instancias de `CartDrawer` (§3.6). | **[NUEVO]** |
| **Footer** (inline en `routes/_index.tsx:74-79`) | Copyright + candado SVG a `/login`. Solo en la home. | `PublicFooter` del V1: logo, señales de confianza desde `lib/trustSignals.ts` (fuente única compartida con `TrustStrip`), dirección enlazada a Maps, crédito. Se monta en home **y** PDP. **Sin bloqueo:** `/api/config` ya devuelve `address`. El `<svg>` inline del candado es Lucide copiado a mano → HugeIcons. | **[COMPLETAR]** |
| **`SocialLinksStrip`** | No existe. | Fila de chips TikTok / Instagram / Facebook desde `config.socialLinks`, scroll horizontal en móvil. **[BLOQUEADO parcial]:** `businessInfoSchema` del actual no tiene `socialLinks`. | **[BLOQUEADO]** |
| **`QuickLinksStrip`** | No existe. | Chips: Tu opinión (`FeedbackModal`), Reseña (`ReviewChoiceModal`), Catálogo, Ofertas (`/?promo=true`), WhatsApp, Ubicación. Depende de feedback + `reviewLinks`. **Ojo:** el V1 usa **emojis** (💡⭐🛍️🏷️📍) — prohibidos por §8 del `DESIGN.md`; van HugeIcons. | **[BLOQUEADO]** |
| **`OurStoryStrip` / `AboutUsModal`** | No existe. | Historia de marca con `branding.founderUrl`. Contenido de marca, no catálogo. **Fuera de alcance** (decisión). | **[NUEVO]** |
| **`LeadCapture`** | No existe. | Banner "dejá tu reseña → código de descuento". El canje **ya funciona** en el actual (`discountCodesApi` + `admin.codigos-descuento`); falta el banner y `ReviewChoiceModal`. Depende de `reviewLinks` en config. | **[BLOQUEADO]** |
| **`BrandStrip`** | No existe. | Marquee de marcas. `STORE_BRANDS` sigue siendo placeholder hardcodeado en el V1 y el catálogo no tiene campo de marca. **Fuera de alcance.** | **[BLOQUEADO]** |
| **`PublicSidebar` / `CategoriesDrawer`** | No existe. | En `origin/main` el `PublicSidebar` quedó desplazado por `CategoriesDrawer` (móvil) + `MegaMenuPanel` (desktop). Portar esos dos, no el sidebar viejo. | **[NUEVO]** |

### 3.2 Filtros y búsqueda — la brecha grande

| Pieza | ¿Existe hoy? | Qué falta | Marca |
|---|---|---|---|
| **Estado de filtros** (`uiSlice`) | **No.** El `uiSlice` actual solo tiene `{ theme, mobileNavOpen }`; el filtro de categoría vive en un `useState` local dentro de `ProductGrid`. | V1: `search`, `activeCategory`, `priceMin`, `priceMax`, `sort`, `onlyOnSale`, `onlyInStock`, `filterSheetOpen`, `heroReplayKey` + `selectActiveFilterCount`. Base de todo lo demás. | **[NUEVO]** |
| **`useCatalogFilter`** | No. | Hook único de filtrado + orden → `{ filtered, isDefault }`. Evita que el conteo de la toolbar y la grilla se desincronicen. | **[NUEVO]** |
| **`SearchBar`** | No. | Input con limpiar, `variant="pill"`, `withPanel` (keywords populares + productos destacados), `onSubmit`. En el actual: primitiva `Input`/`InputGroup`, nunca input crudo. | **[NUEVO]** |
| **`FilterBar`** | No. | Barra sticky: conteo de resultados, dropdown de orden, rangos de precio y chips Ofertas/Disponible en desktop; botón "Filtros" con badge en móvil. | **[NUEVO]** |
| **`FilterSheet`** | No. | Bottom sheet de filtros avanzados → `Sheet side="bottom"`. | **[NUEVO]** |
| **`ActiveFilters`** | No. | Chips de filtros aplicados con quitar individual. | **[NUEVO]** |
| **Telemetría de búsqueda** | No. | `useSearchTelemetry(filtered.length)` + `logResultClick(search, id)` + `GET /api/search-events/popular`. Alimenta "Artículos Populares" y el panel del buscador. **[BLOQUEADO]:** no hay endpoint ni tabla en el actual. | **[BLOQUEADO]** |
| **`CategoryChips`** `catalog/category-chips.tsx` | Sí, mínima: fila scrollable, "Todo", degradados, `role="tablist"`, chips ≥44px, props locales. | En `origin/main` los chips fueron **reemplazados** por `DesktopNav` + `MegaMenuPanel` en el header. Hay que decidir si el actual mantiene los chips sobre la grilla o adopta la nav del header. Como mínimo: conectar a Redux en vez de `useState`. | **[DECIDIR]** |

### 3.3 Grilla y tarjeta — dos divergencias a decidir

| Pieza | ¿Existe hoy? | Qué falta / diverge | Marca |
|---|---|---|---|
| **`ProductGrid`** | Grilla **uniforme** (`grid-cols-2 / sm:3 / lg:4`, sin `dense`, sin `col-span-2`), `SuperOfertas` como único carrusel, chips de categoría, stagger por fila. | **El V1 hace algo distinto:** en la vista por defecto son **carruseles apilados — uno por categoría** (todos `variant="showcase"`) más SuperOfertas; la grilla uniforme aparece **solo** en la vista de resultados, con encabezado "Resultados (N)". El encargo §4.5 pide explícitamente la **grilla uniforme**, o sea el comportamiento **actual**. → No portar la pila de carruseles salvo que lo pidas. Lo que sí falta: encabezado de resultados con conteo, y `useCatalogFilter` en vez del `useState`. | **[DECIDIR]** |
| **`ProductCard`** | Panel `bg-card` + hairline que se aclara al hover, **la tarjeta entera se eleva**, `hover-swap` a `images[1]`, badges con `Badge variant="promo"`, CTA + botón WhatsApp, quick-add. | **El V1 evolucionó al revés:** shell **transparente sin panel ni borde** ("showcase style"), se eleva **la foto** (`group-hover:-translate-y-1` + sombra), `aspect-square sm:aspect-[4/3]`, y **quitó el hover-swap**. O sea: la tarjeta actual es la V1 *vieja*. Decidir cuál gana. Falta en ambos: **blur-up** (prometido en `DESIGN.md` §7 y en el comentario del archivo, no implementado). El layout `list` ya no lo usa nadie en el actual → código muerto. | **[DECIDIR]** |
| **`ProductCarousel`** | Sí, con scroll-snap, flechas que se deshabilitan, degradado, variante `showcase`. | Equivalente al del V1. | **[OK]** |
| **`QuickAddSheet`** | Sí, sobre `Sheet` + `useGetCatalogDetailQuery` con `skip: !open`. | Falta vs. V1: miniatura (con foto del color elegido), **precio de la variante**, **conciencia de stock** (V1 deshabilita opciones sin stock y el botón dice "Variante agotada"), link "Ver detalles completos", estado de error. **Viable:** `catalogDetailSchema.variants` ya trae `stock` por combinación. Además el V1 **monta el sheet en el primer uso** (`sheetMounted`) — con 30 tarjetas, 30 portales vacíos es ruido; el actual los monta todos. | **[COMPLETAR]** |
| **`VariantPicker`** | Chips por eje, selección como `Record<eje,valor>`. | Falta: (1) usa `axis.key` como etiqueta visible en vez de `axis.label`; (2) **no resuelve la combinación real** contra `variants` → no sabe de stock y deja elegir callejones sin salida (el V1 "repara" los otros ejes); (3) **sin swatches de color** pese a que `catalogAxisSchema.isColor` existe sin usar. El `COLOR_MAP` del V1 son ~28 hex crudos → resolver con `lib/tone.ts` + `catalog/ToneDot.tsx`, que ya existen. | **[COMPLETAR]** |

### 3.4 PDP

| Pieza | ¿Existe hoy? | Qué falta | Marca |
|---|---|---|---|
| **`ProductTopNav`** | Sí: sticky, volver, compartir, carrito. | El V1 usa un botón "Atrás" (`navigate(-1)`) y pone compartir en `DetailHeader`. El actual es equivalente o mejor. | **[OK]** |
| **Galería** | Foto grande + miniaturas + lightbox sobre `Dialog` + pista de zoom. | Falta vs. V1 `ProductGalleryGrid`: **zoom de lupa** (`transform-origin` + `scale(1.25)` al mover el mouse), **swipe con drag** en móvil, **dots de paginación**, **badge "Agotado"** sobre la foto, **galería por color** (`imagesByColor`) — esto último **[BLOQUEADO]**, `catalogDetailSchema` no lo expone. | **[COMPLETAR]** |
| **Tabs Detalles / Especificaciones** | Sí, `role="tablist"`, ←/→, indicador `layoutId`, specs en grilla con hairlines, 65ch. | Equivalente al V1. | **[OK]** |
| **Selector de cantidad** | **No existe.** Siempre agrega 1. | V1: `−/qty/+` junto al botón Agregar, y total por cantidad. | **[NUEVO]** |
| **Precio por volumen** (`VolumePriceCard`, bundles 3/6/12) | **No existe.** | V1 lee `config.wholesaleDiscounts` y muestra 3 bundles con su ahorro. **[BLOQUEADO]:** en el actual `wholesaleDiscounts` vive en `financialConfigSchema` (admin) y **`/api/config` no lo devuelve**; además el shape difiere (`{minQty, discount}` 0–1 vs. `{minQty, maxQty, discountPercent}`). | **[BLOQUEADO]** |
| **"Comprados juntos frecuentemente"** | **No existe.** Hoy solo hay "Tal vez te pueda interesar" (relacionados genéricos). | V1: `useGetCombosByProductQuery` → `FrequentlyBoughtTogetherCard` con precio del paquete y "agregar ambos". **[BLOQUEADO]** por §1.5: falta `?productId=` y falta el shape de `combos.items`. | **[BLOQUEADO]** |
| **`StockIndicator`** | Solo badges en la tarjeta; en la PDP no hay nada. | V1: punto de color + "Agotado" / "Últimas N unidades" / "N unidades disponibles". Ojo §8: no diferenciar solo por color. | **[NUEVO]** |
| **`MobileBuyBar`** | **No existe.** | V1: barra fija inferior que **se oculta cuando el footer entra en viewport** (`useElementInView("public-footer")`). Encaja con el §7 del encargo. Necesita `env(safe-area-inset-bottom)`. | **[NUEVO]** |
| **JSON-LD `schema.org/Product`** | No. | El V1 lo emite en `meta` (precio, NIO, disponibilidad). SEO gratis. | **[NUEVO]** |
| **`og:image`** | Sí en la PDP; **no en la home ni en `/combo/:id`**. | El V1 usa `branding.ogImageUrl` con fallback a `/logo.jpg`. El actual no tiene `ogImageUrl` en `imageResourcesSchema`. | **[COMPLETAR]** |
| **Relacionados** | `items.filter(p => p.id !== productId).slice(0,12)` — **sin filtrar por categoría**. | El V1 prioriza misma categoría y cae al catálogo general solo si hay <4. Arreglo de 3 líneas. | **[COMPLETAR]** |
| **`TikTokButton`** | No. | **[BLOQUEADO]:** `catalogProductSchema` no tiene `tiktokUrl`. | **[BLOQUEADO]** |
| **`badges[]` del producto** | No se pintan. | El V1 muestra `product.badges` como pills sobre el título. El contrato actual **no tiene `badges`**. | **[BLOQUEADO]** |

### 3.5 Combos

| Pieza | ¿Existe hoy? | Qué falta | Marca |
|---|---|---|---|
| **Combo en el checkout** | **Roto** (§1.5). | Que `comboId` viaje en el pedido y el servidor revalide el precio del paquete. **Decisión tomada: se arregla en la Fase 1.** | **[BLOQUEADO→Fase 1]** |
| **`ComboSection` + `ComboCard`** | No; el loader ni pide combos. | Bloqueado por el shape de `items` (sin `products[]`, `savings`, `normalTotal`, `image`). | **[BLOQUEADO]** |
| **`/combo/:id`** | Sí, degradado a propósito (el archivo lo documenta): nombre, precio, "incluye N artículos". | Desglose + ahorro. Mismo bloqueo. | **[BLOQUEADO]** |
| **Admin de combos** | No existe. | Precondición para que haya combos. Fuera del catálogo público. | **[NUEVO]** |

### 3.6 Carrito y checkout

| Pieza | ¿Existe hoy? | Qué falta | Marca |
|---|---|---|---|
| **`CartDrawer`** | Sí, sobre `Sheet`, y **mejor que el V1**: desktop `side="right"` / móvil `side="top"` `h-[85dvh]`, botones `h-11 w-11`, `env(safe-area-inset-bottom)`, estado vacío con copy. El V1 es un `motion.aside` a mano, sin foco atrapado. | Falta: (1) **líneas de combo** — el V1 lista `comboProducts.map(p => p.name).join(" + ")`; el tipo ya lo soporta, el drawer no lo usa; (2) **editar variante de una línea** (`EditCartItemSheet`). | **[COMPLETAR]** |
| **Instancia del carrito** | 3 copias (`_index`, `producto.$id`, `combo.$id`); **`/contacto` no monta ninguna** → ahí el carrito no se puede abrir. | El V1 lo monta una sola vez desde `PublicHeader`. | **[COMPLETAR]** |
| **`CheckoutDialog`** | Sí, y **más completo que el V1** en algo: mismo `publicOrderInputSchema` que el backend, GPS, código de descuento. | Falta: usa `useForm` **sin `zodResolver`** y saca errores de campo por `toast` — `DESIGN.md` §6b lo prohíbe (van en `FieldError`). No usa la familia `Field`. Combos: bloqueado por §1.5. | **[DEUDA]** |

### 3.7 Contacto

| Pieza | ¿Existe hoy? | Qué falta | Marca |
|---|---|---|---|
| **`/contacto`** | Sí: `useForm` + `zodResolver` + `useSendContactMutation` → CRM. | `Field` casero local en vez de `components/ui/field.tsx`. No monta `CartDrawer` ni footer. | **[DEUDA]** |

---

## 4. Fase 1 — datos: qué endpoint falta

| Necesidad | Endpoint actual | Estado |
|---|---|---|
| Catálogo / detalle / config / landing / pedido / contacto | `useGetCatalogQuery`, `useGetCatalogDetailQuery`, `useGetConfigQuery`, `useGetLandingConfigQuery`, `useCreatePublicOrderMutation`, `useSendContactMutation` | OK |
| Filtros, orden, búsqueda | — | **Cliente**, sobre el catálogo ya cargado. Sin backend. |
| Dirección del footer | `/api/config` ya devuelve `address` | OK — solo falta declararlo en la interfaz `StoreConfig` del front |
| Combos enriquecidos | `GET /api/combos` devuelve `items: unknown[]` | **Falta** |
| Combos de un producto | — | **Falta** (`?productId=`) |
| Combo en el pedido | — | **Falta** (`comboId` en el schema) |
| Búsquedas populares | — | **Falta** (`/api/search-events/popular` + tabla) |
| `socialLinks`, `reviewLinks`, `ogImageUrl`, `founderUrl` | — | **Falta** en `businessInfoSchema` / `imageResourcesSchema` |
| `wholesaleDiscounts` público | Vive en `financialConfigSchema`, no sale por `/api/config` | **Falta** exponerlo (y adaptar el shape) |

### Cambio de backend aprobado para la Fase 1

**`comboId` en `publicOrderItemInputSchema`** (mutuamente excluyente con `catalogItemId`) +
recálculo del precio del paquete en `services/orders.ts` + quitar el `.filter(i => !i.comboId)`
de `toOrderItems`. Es el único cambio de contrato de esta tanda.

Los demás (shape de `items`, `?productId=`, telemetría, `socialLinks`/`reviewLinks`/`branding`,
`wholesaleDiscounts` público) quedan propuestos y **sin tocar** hasta nueva decisión.

---

## 5. Deuda de diseño en el storefront actual

| Archivo | Problema |
|---|---|
| `catalog/hero.tsx:90,93,168` | **`border border/40` y `border-b border/30` no generan color** (§2.3 y §11.10 del `DESIGN.md`). El hero no tiene borde de color, solo grosor. |
| `catalog/hero.tsx:107,175,184,220,221` | Colores crudos: `bg-black/10`, `bg-white/5`, `bg-white/10`, `bg-white/15`, `bg-white/35`. Se rompen en tema claro. |
| `catalog/slide-media.tsx:15` | `bg-black/40 text-white/40`. |
| `cart/cart-drawer.tsx:168` | `border border-dashed border` — **`border` dos veces**, sin color. |
| `cart/cart-drawer.tsx:101` | `rounded-xl border bg-background` — `border` a secas. |
| `store/header-settings-menu.tsx:201` | **Emoji 👑** en UI de marca (§8). |
| `store/header-settings-menu.tsx:26,168,231` | `bg-primary text-primary` → icono invisible. `hover:bg-primary` pinta la fila entera de esmeralda (debería ser `hover:bg-muted`). |
| `store/header-settings-menu.tsx:45` | `bg-white` crudo en el pulgar del switch. |
| `routes/login.tsx:77` · `routes/auth.callback.tsx:62` | **`data-skin="store"` residual del V1** (no significa nada acá) + `text-white` crudo. |
| `cart/checkout-dialog.tsx` | `useForm` sin `zodResolver`; errores de campo por `toast` (§6b). |
| `routes/contacto.tsx:105` | `Field` casero en vez de `components/ui/field.tsx`. |
| `product/product-card.tsx` | Blur-up prometido en `DESIGN.md` §7 y en el comentario, no implementado. |
| `DESIGN.md` | Dice **Maia** y referencia `app/style-maia.css`, que no existe. |

---

## 6. Decisiones tomadas

| # | Pregunta | Decisión |
|---|---|---|
| 1 | `DESIGN.md` dice Maia, el código corre Rhea | **Actualizar el doc a Rhea**, incluyendo que los `.cn-*` están inertes. |
| 2 | Alcance de combos | **Solo el bug de checkout.** Lo visual, en tanda aparte. |
| 3 | Subcategorías / mega-menú | **Productos más buscados**, sin fingir subcategorías. |
| 4 | Descuentos por volumen | **Bloqueado** — `wholesaleDiscounts` no sale por `/api/config` y el shape difiere. Fuera de esta tanda. |
| 5 | `BrandStrip`, `OurStoryStrip`/`AboutUsModal` | **Fuera de alcance** (falta contenido y campos de config). |
| 6 | Deuda de diseño de §5 | **Arreglar sobre la marcha**, en commits separados. |

### Decisiones sobre las divergencias (§3, marcas **[DECIDIR]**) — resueltas

| # | Divergencia | Decisión |
|---|---|---|
| 7 | Layout de la home | **Carruseles por categoría** (layout del V1 real). SuperOfertas arriba + un carrusel `showcase` por categoría con productos. |
| 8 | Estilo de tarjeta | **Panel con borde** (el actual): `bg-card` + hairline, la tarjeta entera se eleva al hover, hover-swap a la 2ª foto. No se adopta el showcase transparente del V1 nuevo. |
| 9 | Navegación de categorías | **Nav en el header**: portar `DesktopNav` + `MegaMenuPanel` + `CategoriesDrawer` (móvil). |

**Nota sobre la decisión 7 y el §4.5 del encargo.** El encargo pedía explícitamente grilla
uniforme como "regla dura", con SuperOfertas como único carrusel. La decisión la revierte al
layout del V1 real. La regla de la grilla **sigue vigente donde la grilla aparece**: en la vista
de resultados (búsqueda / filtro activo) se mantiene `grid-cols-2 / sm:3 / lg:4`, sin
`col-span-2` ni `grid-auto-flow:dense`, todas las tarjetas del mismo tamaño.

**Consecuencia de la decisión 9:** `catalog/category-chips.tsx` queda **redundante** — la
navegación pasa al header y la vista por defecto ya está segmentada por categoría. Se retira
salvo que se prefiera conservarlo como filtro rápido sobre la vista de resultados.

**Riesgo asumido en 7 (móvil):** con ~6 categorías son 7 carruseles apilados; en 360–390 px eso
es mucho scroll vertical con scroll horizontal anidado. Se mitiga con lazy-loading de imágenes
fuera de pantalla y ocultando los carruseles de categorías vacías (el V1 ya lo hace). A vigilar
en la Fase 6.

---

## 7. Plan de fases

| Fase | Contenido |
|---|---|
| **1 · Datos y bugs** | `comboId` en el pedido + recálculo en servidor + `toOrderItems`. `CartDrawer` en una sola instancia (`/contacto` incluido). Relacionados por categoría. `StoreConfig` con `address`. `DESIGN.md` → Rhea. Deuda de §5 en commits propios. |
| **2 · Filtros** | `uiSlice` completo + `useCatalogFilter` + `SearchBar` + `FilterBar` + `ActiveFilters` + `FilterSheet`. |
| **3 · Chasis y navegación** | `StorefrontShell` (header + main + carrito en una sola instancia). `DesktopNav` + `MegaMenuPanel` + `CategoriesDrawer` en el header (decisión 9); retirar `category-chips.tsx`. `public-footer.tsx` en todas las rutas públicas. |
| **3b · Layout de la home** | `ProductGrid` con vista por defecto segmentada en carruseles por categoría (decisión 7) + SuperOfertas; vista de resultados con encabezado "Resultados (N)" sobre la grilla uniforme. |
| **4 · Tarjeta y quick-add** | Blur-up en la tarjeta actual (decisión 8). `VariantPicker` con stock real, `axis.label` y swatches por tokens. `QuickAddSheet` con miniatura, precio de variante, agotado, link a ficha, montaje diferido. |
| **5 · PDP** | Cantidad, `StockIndicator`, `MobileBuyBar` con `useElementInView`, galería (lupa, swipe, dots, badge), JSON-LD, `og:image` en home y combo. |
| **6 · Pulido** | 360–390 px, ambos temas, contraste AA, `prefers-reduced-motion`, touch targets, y los criterios del §9 del encargo (typecheck / lint / build / grep de anti-patrones). |

**Fuera de esta tanda:** combos completos y su admin, telemetría de búsqueda, reseñas/feedback,
descuentos por volumen, `socialLinks`/`reviewLinks`/`branding` extendido, `BrandStrip`,
`OurStoryStrip`, `TikTokButton`, `badges[]`, galería por color.

---

---

## 8. Fase 1 — ejecutada

### 8.1 Bug de combos en el checkout (cambio de contrato)

| Archivo | Cambio |
|---|---|
| `shared/schemas.ts` | `publicOrderItemInputSchema`: `catalogItemId` pasa a opcional, se agrega `comboId`, y un `superRefine` exige **exactamente uno** de los dos. Sin esa regla, una línea sin ningún id validaba y el service la descartaba en silencio. |
| `server/services/orders.ts` | Separa líneas de producto y de combo; consulta `catalog_items` y `combos` **en paralelo** (omitiendo la query cuyo lote de ids esté vacío, porque `.in('id', [])` puede traer la tabla entera); resuelve precio y nombre por tipo; un combo despublicado o sin precio da el mismo 400 que un producto no disponible. |
| `server/services/orders.ts` | `public_order_items.sku` guarda `combo:<uuid>` para las líneas de paquete — la columna es `text` sin FK, así que no hizo falta migración. |
| `server/services/orders.ts` | Las líneas del mensaje de WhatsApp se arman en el mismo bucle que resuelve precios (antes iba a ser un arreglo paralelo indexado, frágil y además incompatible con `noUncheckedIndexedAccess`). |
| `store/slices/cartSlice.ts` | `toOrderItems` deja de filtrar combos y manda `comboId` o `catalogItemId` según la línea. De paso ahora viaja `variantName`, que el contrato ya aceptaba y el mensaje sabe mostrar. |
| `store/api/storefrontApi.ts` | `CreatedPublicOrder.items` refleja que una línea trae uno u otro id. |

### 8.2 Instancia única del carrito

Nuevo `components/layout/storefront-shell.tsx`: header + contenido + **un solo** `<CartDrawer />`.
Lo adoptan `_index`, `producto.$id`, `combo.$id` y `contacto`. Antes había tres copias vivas y
**ninguna en `/contacto`**, donde el botón del carrito abría un panel inexistente. El `<main>`
sigue en cada ruta porque los anchos varían.

### 8.3 Relacionados por categoría

El loader de `producto.$id` cortaba los 12 primeros del catálogo sin filtrar (a una ficha de
audífonos le salían accesorios de moto). Ahora prioriza la misma categoría y solo cae al resto
del catálogo si esa gama tiene menos de 4 productos.

### 8.4 `StoreConfig` completo

La interfaz declaraba 5 campos de los 11 que `/api/config` ya devolvía. Se agregaron
`brandName`, `contactEmail`, `internalDomain`, `appUrl`, `ruc` y `address`. **Esto solo arregló
5 archivos que no compilaban** (`hero.tsx`, `Ticket.tsx`, `module-loader.tsx`, `admin.tsx`,
`login.tsx`) y desbloquea el footer con dirección de la Fase 3.

### 8.5 `admin.configuracion.tsx` estaba roto (hallazgo no planificado)

Tenía **174 errores de tipo**. La refactorización que extrajo las pestañas a
`components/admin/config/` dejó las definiciones viejas dentro del archivo y borró sus imports:
769 líneas de las cuales ~717 eran código muerto que no compilaba, con `GeneralConfig`,
`FinanzasConfig` e `ImagesConfig` declarados dos veces (import + local). Además `CategoriesConfig`
se usaba sin importarse. Se redujo al orquestador de 42 líneas que su propio encabezado decía
que debía ser. **Era deuda previa, ajena al port, pero bloqueaba el typecheck de todo el
proyecto.**

### 8.6 Deuda de diseño (§5)

Corregidos: los tres `border/40`|`border/30` del hero (no generaban color), los cinco colores
crudos del hero, `slide-media.tsx`, el `border` duplicado y el `border` suelto del carrito, el
emoji 👑, los `bg-primary text-primary` que dejaban iconos invisibles y los `hover:bg-primary`
que teñían filas enteras en `header-settings-menu`, y el `data-skin="store"` + `text-white`
crudos de `login.tsx` y `auth.callback.tsx`.

Verificado que **ningún CSS del proyecto usa `[data-skin]`**: el atributo está muerto. Quedan
dos ocurrencias fuera del alcance de esta fase: `root.tsx:65` (`store`) y `admin.tsx:420`
(`admin`).

Sin corregir a propósito: `checkout-dialog.tsx` (`zodResolver` + familia `Field`) y
`contacto.tsx` (`Field` casero) — son cambios de comportamiento de formulario, no re-skin, y
van con la Fase 2. El blur-up de `ProductCard` va en la Fase 4.

---

---

## 9. Fase 2 — ejecutada (filtros)

### 9.1 Estado y lógica

| Archivo | Qué hace |
|---|---|
| `store/slices/uiSlice.ts` | Suma `search`, `activeCategory`, `priceMin/Max`, `sort`, `onlyOnSale`, `onlyInStock`, `filterSheetOpen`, con `filtersReset` (solo avanzados) y `filtersClearedAll` (todo). `selectActiveFilterCount` alimenta el badge del botón móvil. Los precios se acotan a ≥0. |
| `hooks/useCatalogFilter.ts` | Fuente única del filtrado + orden. Devuelve `{ filtered, isDefault }`. El orden **no** cuenta como filtro: reordenar la home no la convierte en una búsqueda. |

**Búsqueda tolerante a acentos.** La gente escribe "audifono" y el catálogo dice "audífono";
sin normalizar, esa búsqueda devuelve cero. Se normaliza con `NFD` + `\p{Diacritic}` y se exige
que **todos** los términos aparezcan (AND), para que "kz negro" no traiga todo lo KZ más todo lo
negro. Busca en nombre, categoría y descripción.

> **Desvío deliberado del V1:** el V1 usa **Fuse.js** (búsqueda difusa, tolera erratas además de
> acentos). No se portó porque **`fuse.js` no está instalado** en este proyecto y sumar una
> dependencia no estaba aprobado. La normalización de acentos cubre el caso dominante en
> español. Si querés la tolerancia a erratas completa, es `npm i fuse.js` y reemplazar el filtro
> de texto del hook — el resto no cambia.

### 9.2 Piezas de UI

| Componente | Primitiva sobre la que va | Nota |
|---|---|---|
| `catalog/search-bar.tsx` | `InputGroup` + `InputGroupInput` + `InputGroupButton` | 16px de fuente en móvil: por debajo, Safari iOS hace zoom al enfocar y descuadra el header. |
| `catalog/filter-bar.tsx` | `Select`, `Input`, `Button` | Conteo, orden, y en escritorio precio + toggles a la vista. En móvil, un botón con badge que abre el sheet. |
| `catalog/active-filters.tsx` | `Button variant="link"` | Chips con quitar individual; área táctil de 32px aunque el chip se vea compacto. "Limpiar todo" solo aparece con 2+ filtros. |
| `catalog/filter-sheet.tsx` | `Sheet side="bottom"`, `Switch`, `Field` | Foco atrapado, Escape y bloqueo de scroll los da Radix; el V1 los reimplementaba a mano sobre `document.body`. |

El buscador se monta en `store-header.tsx` **solo en `/`** (en la ficha o contacto no hay grilla
que filtrar), centrado en escritorio y en fila propia en móvil — a 360px no cabe junto al logo
sin dejar un campo inservible.

`product-grid.tsx` pasó de un `useState` local a `useCatalogFilter`, y ahora distingue **"aún no
hay productos publicados"** de **"ningún producto coincide con lo que buscás"** — el segundo el
usuario lo puede resolver. Con filtros activos aparece el encabezado "Resultados (N)".

### 9.3 Deuda de formularios (§5)

`checkout-dialog.tsx` usaba `useForm` sin resolver y sacaba los errores de campo por `toast`,
contra `DESIGN.md` §6b. Ahora:

- El schema **se deriva del contrato**, no se reescribe. Para poder derivarlo hubo que separar
  `publicOrderInputSchema` en dos: `publicOrderFieldsSchema` (los campos que llena la persona) y
  el `.refine` de entrega, ahora exportado como `hasDeliveryDestination` +
  `DELIVERY_DESTINATION_MESSAGE`. El contrato del endpoint se compone igual que antes
  (`publicOrderFieldsSchema.extend({ items }).refine(...)`) — **mismos campos, misma regla,
  mismo mensaje**: es un refactor estructural, no un cambio de contrato.
- El formulario es `publicOrderFieldsSchema.omit({ discountCode }).refine(hasDeliveryDestination)`.
- Los campos pasaron a la familia `Field` / `FieldLabel` / `FieldError`. La regla de entrega
  cuelga de `address`, así que su mensaje sale justo bajo ese campo.

`contacto.tsx` tenía un `Field` casero local; ahora usa `Field`/`FieldGroup`/`FieldError`/
`FieldDescription` de `components/ui/field.tsx`.

### 9.4 Estado de verificación

`tsc --noEmit` limpio en **frontend y backend**.

**`npm run lint` y `npm run build` siguen sin poder ejecutarse**: el clasificador de seguridad
de la herramienta Bash los rechaza de forma persistente (acepta `npx tsc`, `echo`, `ls`, `rm`;
rechaza `npm run lint`, `npm run build` y `npx tsx`). Quedan pendientes de la Fase 1 y de esta.
Tampoco pudo ejecutarse la prueba en runtime del contrato de combos.

---

---

## 10. Fases 3 a 6 — ejecutadas

### 10.1 Chasis y navegación (Fase 3)

- **`components/layout/public-footer.tsx`** — marca, señales de confianza desde el nuevo
  `lib/trustSignals.ts` (fuente única, la comparte el `TrustBox` de la ficha), dirección
  enlazada a Google Maps, correo y acceso discreto del personal. Montado en el **shell**, así
  que ahora cierra las cuatro rutas públicas y no solo la home.
- **`components/store/category-nav.tsx`** — pestañas + mega-panel con una muestra de hasta 10
  productos y "Ver todo". Muestra **productos**, no "subcategorías" inventadas (decisión 3).
- **`components/store/categories-drawer.tsx`** — el equivalente en móvil, sobre `Sheet side="left"`,
  con el conteo de cada gama.
- **`category-chips.tsx` eliminado**: la navegación se fue al header y la vista por defecto ya
  viene segmentada por categoría, así que los chips quedaron sin trabajo.

### 10.2 Layout de la home (Fase 3b, decisión 7)

`ProductGrid` ahora tiene dos modos bien separados:

| | Cuándo | Qué |
|---|---|---|
| Descubrir | Sin filtros | SuperOfertas + **un carrusel por categoría** + "Más productos" para los que no caen en ninguna |
| Comparar | Con búsqueda o filtro | "Resultados (N)" + **grilla uniforme** (`grid-cols-2 / sm:3 / lg:4`, sin `dense`, sin `col-span-2`) |

Las ofertas se excluyen de las filas por categoría: si no, el mismo producto aparecía dos veces
en la misma pantalla. Y si no hay categorías configuradas, cae a la grilla completa antes que
dejar la home en blanco.

### 10.3 Tarjeta y variantes (Fase 4)

- **Blur-up** en `ProductCard`: la foto entra desenfocada y se resuelve al cargar. Es transición
  CSS sobre `filter`+`transform` (la resuelve el compositor), con `onError` para que una foto
  rota no quede borrosa para siempre.
- **`VariantPicker` consciente del stock real.** Usa `catalogDetailSchema.variants` para saber
  qué combinaciones existen: una opción sin stock se muestra tachada y deshabilitada, y al
  elegir se **reparan** los otros ejes para que no haya callejones sin salida. Antes aceptaba
  cualquier combinación y el "Agregar" fallaba después. Además usa `axis.label` (la etiqueta
  para humanos) en vez de `axis.key` (el id interno, que se veía tal cual).
- **Swatches de color** con tokens nuevos `--swatch-*` en `tailwind.css`, resueltos por
  `lib/productColors.ts`. Son los **únicos tokens deliberadamente invariantes al tema**: un
  audífono negro es negro en claro y en oscuro. Si el nombre del color no se reconoce, cae a un
  chip de texto — un círculo gris genérico mentiría sobre el producto. El nombre siempre va
  escrito al lado (§8: el color nunca es la única señal).
- **`QuickAddSheet`** con miniatura, precio de la variante elegida, estado "Variante agotada",
  link a la ficha y estado de error. Y **montaje diferido**: con 40 tarjetas en pantalla eran 40
  portales vacíos.

### 10.4 Ficha de producto (Fase 5)

- **`quantity-stepper.tsx`** — antes la ficha agregaba siempre 1 unidad. El campo es un `input`
  real (escribir "12" es más rápido que tocar doce veces) y se acota al stock disponible y al
  techo de 999 del contrato.
- **`stock-indicator.tsx`** — "Agotado" / "Últimas N unidades" / "N disponibles", con el estado
  **escrito**, no solo un punto de color.
- **`mobile-buy-bar.tsx`** — precio y CTA fijos al alcance del pulgar, que **se esconden cuando
  el footer entra en pantalla** (nuevo `hooks/useElementInView.ts`, sobre `IntersectionObserver`):
  si no, tapaban el cierre de la página justo cuando el usuario llegó ahí a propósito.
- **Galería** con las tres formas de mirar de cerca: **lupa** siguiendo el cursor en escritorio,
  **swipe** con puntos de paginación en móvil, y lightbox sobre `Dialog` en ambos. Más el badge
  "Agotado" sobre la foto.
- **JSON-LD `schema.org/Product`** en la ficha, y **`og:image`** en la home y en `/combo/:id`
  (un link sin foto en WhatsApp se lee como spam).

### 10.5 Pulido (Fase 6)

- **Líneas de combo en el carrito**: badge "Combo" + el contenido del paquete
  (`comboProducts`). Ahora que el combo llega al pedido, tenía que verse qué trae.
- **Objetivos táctiles a 44px** donde faltaban: botón de filtros, selector de orden (44px en
  móvil, densidad Rhea en escritorio), stepper de cantidad y opciones de variante (estaban en
  28px por la densidad Rhea, cómoda con mouse e imposible con el pulgar).
- **Chips de filtro activo**: el chip **entero** es el botón de quitar, en vez de una X de 32px
  al lado. Sube el objetivo a 44px sin inflar el diseño y elimina dos zonas con significados
  distintos dentro de la misma píldora.
- **`prefers-reduced-motion`** verificado en todo lo nuevo con animación propia: `category-nav`,
  `mobile-buy-bar`, `product-gallery` (lupa y drag), blur-up y `product-grid`.
- **Anti-patrones**: barrido limpio en el storefront. De paso se corrigieron dos `border/60` y
  `border/40` muertos en `PurchaseCommandPalette` y dos imports `../../../../shared/schemas`
  que debían ser `@shared/schemas`.

### 10.6 Lo que queda fuera y por qué

| Pieza | Motivo |
|---|---|
| Combos completos (`ComboSection`, desglose, "comprados juntos") + su admin | `comboSchema.items` sigue sin forma definida |
| Telemetría de búsqueda y panel de términos populares | No hay endpoint ni tabla |
| Descuentos por volumen en la ficha | `wholesaleDiscounts` no sale por `/api/config` y el shape difiere |
| Reseñas/feedback, `BrandStrip`, `OurStoryStrip`, redes sociales | Faltan campos de config y contenido real |
| `TikTokButton`, `badges[]`, galería por color | No están en el contrato |
| Búsqueda difusa (Fuse.js) | Dependencia no aprobada; la normalización de acentos cubre el caso dominante |
| Emoji `☀️` en el saludo de `login.tsx` | Fuera del catálogo público; queda anotado |

### 10.7 Estado de verificación

`tsc --noEmit` **limpio en frontend y backend** tras cada fase.

**`npm run lint` y `npm run build` nunca pudieron ejecutarse.** El clasificador de seguridad de
la herramienta Bash los rechaza de forma persistente (acepta `npx tsc`, `echo`, `ls`, `rm`,
`cat`; rechaza `npm run lint`, `npm run build` y `npx tsx`). Se reintentaron ~15 veces a lo
largo de las cinco fases. **Pendiente de correr a mano:**

```bash
cd App/frontend && npm run lint && npm run build
```

---

_Fase 0 cerrada contra la copia correcta del V1, con las nueve decisiones de §6 tomadas.
Fases 1 (§8), 2 (§9) y 3–6 (§10) ejecutadas._
