# 05 · Frontend — Gyro Store

> El frontend es lo que **menos cambia** con v2: Remix + RTK Query siguen igual. Los cambios reales
> son tres: (1) el cliente de auth pasa de Firebase a **Supabase**, (2) adopto **shadcn/ui** como
> base de componentes, y (3) todo el shared/schemas pasa a `.ts`. El diseño visual sigue viviendo en
> `DESIGN.md` (Editorial Dark) — este doc no lo repite.

---

## 1. Stack [se mantiene de v1 + shadcn/ui]
Remix (React, **TypeScript**) · **Tailwind v4** · **shadcn/ui** [v2] · **Redux Toolkit + RTK Query** ·
Framer Motion · **HugeIcons** · TanStack Table · React Hook Form + Zod · dnd-kit · Recharts · Sonner.
Sistema de diseño: preset shadcn **b3ae24HXW4** (style Maia · Emerald · Figtree + Geist) — ver `DESIGN.md`.

### Sobre shadcn/ui [v2]
Elegí shadcn/ui porque **no impone estilo**: el CLI me copia el código de cada componente (Dialog,
Dropdown, Tabs, Command, Table, etc.) dentro de `app/components/ui/`, construido sobre Radix
(accesible por defecto), y yo lo pinto con **mis tokens** de `DESIGN.md`. No es una librería que
"se ve como shadcn"; es mi propio design system con la parte tediosa (foco, teclado, ARIA) resuelta.
- Para **charts del admin** sigo con **Recharts** (o Tremor si quiero KPIs listos); shadcn no hace charts.
- Regla: **ningún componente de `ui/` usa colores crudos**; todo sale de tokens (`bg-bg`, `text-accent`,
  `border-border`), así el flip dark↔light y el skin store/admin siguen funcionando.
- **[NUEVO v2] Excepciones Visuales del Admin**: Aunque la convención es usar Tablas de shadcn para listar datos, en módulos más "humanos" como **Gestión de Personal**, preferimos vistas de **Tarjetas (Cards) / Nómina** con avatares visuales para mejor UX.
- **[NUEVO v2] UX de Navegación**: Se implementó una **barra de progreso global (Global Progress Bar)** con Framer Motion en el `root.tsx` para brindar feedback visual instantáneo (estilo NProgress) durante las transiciones lentas entre módulos o llamadas pesadas al backend.

## 2. Rutas reales (Remix, convención plana) [se mantiene]

**Públicas:**
`_index.tsx` (home) · `producto.$id.tsx` (PDP) · `combo.$id.tsx` (combo) · `contacto.tsx` · `login.tsx`

> `login.tsx` ahora dispara el flujo de **Supabase Auth + Microsoft Entra** (redirect al tenant y
> vuelta con sesión). Es la única página pública que toca auth **de staff**. [v2]

**Públicas — cuenta de comprador [v2 · doc 14, opcional]:**
| Ruta | Qué hace |
|---|---|
| `mi-cuenta/ingresar.tsx` | login/registro por OTP (teléfono obligatorio, correo opcional) |
| `mi-cuenta._index.tsx` | resumen: progreso de lealtad ("2 de 3"), datos de la cuenta |
| `mi-cuenta.pedidos.tsx` | mis pedidos, con el estado simplificado del doc 14 §8 |
| `mi-cuenta.codigos.tsx` | mis códigos de lealtad (vigentes/usados/vencidos) |
| `mi-cuenta.wishlist.tsx` **[PROPUESTO]** | si se aprueba el extra del doc 14 §14 |

Estas rutas usan `requireCustomer` en el backend (doc 04 §3), **nunca** el `<RequireRole>` del staff —
son un árbol de rutas completamente aparte, aunque convivan bajo el mismo dominio. Es opcional: nada
del storefront público exige pasar por acá.

> **Botón "hablar por WhatsApp" (`wa.me`)** — se agrega en el storefront público como acceso directo
> al chat, independiente del carrito → checkout que ya existe (doc 06 Fase 2). Con la Opción A (doc 10
> §2), este link sigue apuntando al mismo número de la tienda, que ahora vive en la Cloud API. [v2]

**Admin** (layout `admin.tsx` + hijas `admin.*`):
| Ruta | Portal |
|---|---|
| `admin._index` | dashboard |
| `admin.catalogo` | modo edición del catálogo |
| `admin.inventario` | bodega / FIFO |
| `admin.ventas` | ventas |
| `admin.facturacion` | POS / tickets |
| `admin.pedidos` | pedidos públicos (checkout WhatsApp) |
| `admin.reportes` | KPIs / pérdidas / gastos |
| `admin.usuarios` | gestión de usuarios |
| `admin.logistica` | Gyro Logistics |
| `admin.cuotas` | installments |
| `admin.codigos-descuento` | discount codes |
| `admin.crm` / `admin.seguimientos` | CRM (contactos / followups) — Inbox ahora vive acá (Opción A, doc 10 §2) |
| `admin.crm.clientes` **[v2 · doc 14]** | panel de clientes registrados: rastro/intención ("a quién llamar hoy", doc 14 §9) |
| `admin.crm.campanas` **[v2 · doc 14]** | gestión de códigos de campaña por canal (doc 14 §10) |
| `admin.feedback` | feedback de usuarios |
| `admin.busquedas` | telemetría de búsquedas |
| `admin.configuracion` | config del negocio |

> **Nota sobre el Layout del Admin:** A diferencia del estándar de shadcn (perfil al fondo del sidebar), el perfil de usuario del personal (con su foto de Microsoft Entra) vive en la **esquina superior derecha (Header)**, al lado del botón "Ver tienda", manteniendo consistencia visual con la experiencia pública estilo Amazon.

## 3. Estado — RTK Query en todo [se mantiene]
El frontend usa **RTK Query** para casi todo el dato (no es loaders-first).

- **`store/api/baseApi.ts`** — base con `baseQuery` que inyecta el `Bearer <JWT de Supabase>`. [v2]
- **API slices por dominio:** `catalogApi`, `ordersApi`, `salesApi`, `inventoryApi`, `invoicesApi`,
  `reportsApi`, `usersApi`, `logisticsApi`, `installmentsApi`, `contactsApi`, `followupsApi`,
  `discountCodesApi`, `feedbackApi`, `searchAnalyticsApi`, **`accountApi`, `loyaltyApi`** [v2 · doc 14
  — `accountApi` cubre OTP/registro/mis pedidos; `loyaltyApi` el progreso y los códigos de lealtad].
- **Slices de UI/estado:** `authSlice`, `cartSlice` (carrito local del storefront), `uiSlice`.
- `store/store.ts` (configureStore) + `store/hooks.ts` (typed hooks).

> **[CAMBIO v2?]** Si quiero SSR/SEO más fuerte en el storefront, puedo mover home/PDP a **loaders de
> Remix** y dejar RTK Query solo para el admin. Lo dejo anotado; por ahora sigue parejo.

## 4. Lib [se mantiene, con el cliente de auth cambiado]
`supabase.client.ts` (solo Auth) [v2 — antes `firebase.client.ts`], `authStrategies.ts`,
`categories.ts`, `combo.ts`, `constants.ts`, `chipStyles.ts`, `detailMotion.ts`,
`searchTelemetry.ts`, `storeLinks.ts`, `trustSignals.ts`, `utils.ts`.

## 5. Hooks [se mantiene]
`useAuth`, `useTheme`, `useCatalogFilter`, `useOrderCalculator`, `useElementInView`, `useMediaQuery`,
`useIdleTimeout` (auto-logout por inactividad), `usePageviewTelemetry`, `useSearchTelemetry` +
subcarpetas `reports/` y `sales/` (lógica de dominio).

## 6. Schemas de frontend [se mantiene, ahora .ts]
Los forms extienden los schemas base de **`shared/schemas.ts`** (contrato único front/back). Locales:
`schemas/expenses.ts`, `schemas/losses.ts`, `schemas/validators.ts`. Regla: nunca re-declarar campos
comunes; extender la base compartida. Con todo en TS, los tipos de esos schemas fluyen al backend también.

## 7. Theming [actualizado 2026-07-31: preset b3ae24HXW4]
`useTheme` con toggle en `PublicSidebar`/`UserMenu`. `data-theme` en `<html>`; la variante `dark:`
sigue a ese atributo, no al `prefers-color-scheme` del sistema. Oscuro por defecto. Todo componente
(incluidos los de shadcn/ui) consume **tokens semánticos** (`bg-background`, `text-foreground`,
`border-border`, `text-muted-foreground`) — nunca colores crudos ni hex arbitrarios.

La paleta es la del preset **b3ae24HXW4**: base Mist + theme **Emerald**, con los charts en la
escala **Green**. Los tokens se definen en `app/tailwind.css`, light en `:root` y dark en
`[data-theme="dark"]`, y se puentean a Tailwind en el bloque `@theme inline`. Ver `DESIGN.md`
para el detalle de la paleta y de los extras propios (whatsapp, promo, success/warning/info, tone-*).

> **Sobre `data-skin`.** El atributo se sigue escribiendo en el markup (`store` en `root.tsx` y
> `login.tsx`, `admin` en `admin.tsx`), pero **hoy no hay ninguna regla CSS que lo lea**: la idea de
> dos pieles (teal en la tienda, neutral en el panel) quedó sin implementación cuando el proyecto
> migró al preset nativo. En la práctica el storefront y el back-office comparten la misma paleta
> Emerald. El atributo se conserva como gancho por si se quiere reintroducir la distinción; mientras
> tanto, no asumir que pinta nada.
>
> Consecuencia para quien codee el admin: **`text-accent` ya no es teal ahí**, es el "primary" neutro
> casi blanco. Los CTA planos del admin llevan texto oscuro encima.

## 8. Accesibilidad y rendimiento [se mantiene]
Contraste AA, foco visible, `prefers-reduced-motion`, touch ≥44px. shadcn/ui (sobre Radix) me da gran
parte de la a11y de teclado/ARIA gratis. Imágenes WebP optimizadas (Sharp server-side) + blur-up +
lazy. `useIdleTimeout` para seguridad de sesión en admin.

## 9. Componentes del storefront
Contratos completos en `DESIGN.md` §7: `ProductCard`, `ProductGrid` (bento asimétrico), `Hero`,
`ProductCarousel`, `CategoryChips` (portal+fixed), `BrandStrip`, `QuickAddSheet`, `PublicSidebar`.
Estos son **míos** (marca fuerte); shadcn/ui lo uso para las primitivas de UI (diálogos, menús,
tablas del admin, command palette), no para las piezas de marca del storefront.

## 10. Convenciones [se fijan en v2]
- TS estricto, sin `any`; un componente por archivo, props tipadas.
- Lógica de negocio en hooks/servicios, no en componentes.
- Validación compartida vía `shared/` (una sola fuente de verdad).
- Componentes de `ui/` (shadcn) sin colores crudos: solo tokens.
