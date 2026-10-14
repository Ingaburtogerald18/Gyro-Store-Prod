# 02 · Arquitectura

## 1. Vista general

Un **monolito**: un solo servicio Node/Express en TypeScript que expone la API (`/api/*`) y sirve la
tienda Remix ya compilada. Se despliega como un Web Service en Render.

```
  Navegador ──HTTPS──▶  Render: Express (TS, ESM, corre con tsx)
     │                    ├── /api/*  → rutas → servicios → Supabase (service_role)
     │                    └── el resto → build de Remix (SSR)
     │
     └── solo para el login del personal ──▶ Supabase Auth (proveedor Microsoft Entra ID)

  Express ──▶ Supabase Postgres   datos (RLS cerrada)
          ──▶ Cloudflare R2       imágenes (S3)
          ──▶ Microsoft Graph     comprobantes PDF en SharePoint (opcional)
```

### La decisión central

**El navegador nunca lee ni escribe la base.** Solo usa Supabase Auth para obtener un JWT. Ese token
viaja a Express, que lo valida y hace toda la operación de datos con la `service_role`. Todas las
tablas tienen RLS activo y sin políticas, y las funciones solo las puede llamar `service_role`.

Por qué: cualquier persona del personal tiene un JWT válido y la llave pública (`anon`) viaja en el
navegador para el login. Con la base abierta, cualquiera podría leer costos y utilidades o escribir
stock por fuera de la app. Así, **toda la lógica y la autorización viven en el servidor**.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Servidor | Node ≥ 20, TypeScript + ESM ejecutado con `tsx` (sin paso de compilación), Express 5 |
| Datos | Supabase Postgres vía `@supabase/supabase-js` con `service_role`; funciones SQL para lo atómico |
| Validación | Zod 4, con los esquemas compartidos en `App/shared/schemas/` (un archivo por tema) |
| Seguridad HTTP | helmet (CSP con nonce), cors, express-rate-limit, `sanitizeBody` |
| Archivos | multer (hasta 25 MB) → sharp (WebP, lado mayor 1200 px, y miniatura de 480) → R2 con `@aws-sdk/client-s3` |
| PDF | pdf-lib (comprobantes) |
| Tienda y panel | Remix 2 sobre Vite 6, React 18, Tailwind 4, shadcn/ui (Radix), Redux Toolkit + RTK Query |
| UI | React Hook Form, TanStack Table, dnd-kit, Recharts, Framer Motion, Hugeicons, Sonner, cmdk, letra Chivo |

## 3. Carpetas

```
App/
├── server/
│   ├── index.ts          arranque, middleware, montaje de rutas y /api/health
│   ├── core/             config.ts (variables y constantes), load-env.ts (GYRO_ENV_FILE o App/.env),
│   │                     supabase.ts (cliente con service_role), serve-frontend.ts (build de Remix en producción)
│   ├── modules/<tema>/   rutas y servicios de cada tema juntos: los archivos *-routes.ts son
│   │                     los routers de Express y el resto la lógica
│   ├── middleware/       auth y roles, errores, rate limit
│   └── utils/
├── shared/               esquemas Zod y tipos compartidos con el frontend
├── frontend/app/
│   ├── routes/           páginas de la tienda y del panel (admin.*); el nombre del archivo es la URL
│   ├── components/
│   │   ├── ui/           piezas base (shadcn) y componentes compartidos como data-table y form-layout
│   │   ├── admin/        el panel, una carpeta por módulo (inventory/, sales/, reports/…)
│   │   ├── editor/       el modo edición de la tienda
│   │   ├── storefront/   la cáscara de la tienda pública: header, navegación, footer
│   │   └── catalog/  product/  cart/   catálogo, ficha de producto y carrito
│   ├── state/            Redux: store, api/ (RTK Query por dominio), slices/ y la sincronización
│   │                     con la sesión y el almacenamiento del navegador
│   ├── lib/  hooks/      lógica y hooks del cliente
│   └── tailwind.css      paleta y tokens (ver DESIGN.md)
├── database/             01_schema.sql, 02_seed.sql, migrations/, historial/
├── scripts/              seed de desarrollo y SharePoint
└── tests/                tests del servidor (frontend/tests tiene los del cliente)
```

Los módulos del servidor:

| Módulo | Monta | Qué tiene |
|---|---|---|
| `analytics` | `/api/analytics` | Ingesta de eventos de la tienda y el tablero de Analítica |
| `catalog` | `/api/catalog`, `/api/admin/catalog` | Catálogo público, presentador, plantillas, categorías y ofertas por color |
| `combos` | `/api/combos`, `/api/admin/combos` | Combos públicos y su administración |
| `crm` | `/api/crm`, `/api/contact`, `/api/stock-notices` | Contactos, ficha 360, seguimientos, formulario de contacto y avisos de stock |
| `discount-codes` | `/api/discount-codes` | Códigos `GS-DC-n` |
| `files` | `/api/upload` | Subida a R2 (`storage.ts` la usan otros módulos) |
| `finance` | `/api/reports` | Reportería, gastos, pozos (`pozo-ledger.ts`) y costeo (`costing.ts`) |
| `installments` | `/api/installments` | Cuotas |
| `inventory` | `/api/inventory` | Lotes, FIFO, órdenes de compra y proveedores |
| `invoices` | `/api/invoices` | Facturas `GS-PR-n` y tickets |
| `orders` | `/api/orders` | Pedidos web: checkout público, seguimiento y gestión en el panel |
| `sales` | `/api/sales` | Ventas, devoluciones, comisiones y pagos a vendedores |
| `settings` | `/api/config`, `/api/admin/config` | Configuración pública y del panel (`app_config`) |
| `sharepoint` | — | Comprobantes PDF y su envío a SharePoint |
| `store-editor` | `/api/landing-config`, `/api/admin/store-editor` | Portada publicada, borrador del modo edición y versiones |
| `users` | `/api/auth`, `/api/admin/users`, `/api/me`, `/api/staff` | Sesión, personal, perfil propio, directorio, roles reservados y papelera |

La regla de trabajo es: la tabla antes que la ruta, el servicio antes que la ruta (la ruta es fina)
y el esquema Zod antes que el handler. Un módulo puede importar servicios de otro (ventas usa el
FIFO de inventario), pero las rutas solo las monta `index.ts`.

## 4. Flujo de una petición

**Tienda (pública).** `GET /api/catalog` → valida la query con Zod → lee con `service_role` → responde
sin columnas de costo. Catálogo, ficha, combos, configuración y portada se guardan 60 s en memoria
(`modules/storefront/store-reader.ts`) y cualquier escritura de `/api` que sale bien borra todas las
copias (`clearMemos` en `index.ts`), así un cambio del panel se ve al instante. Los loaders de Remix
leen esos datos en el mismo proceso: Express los pasa en el contexto (`store`) y no hay pedidos del
servidor a sí mismo; en desarrollo no hay contexto y se piden a `/api` (`lib/store-reader.server.ts`).
Al navegador viajan ya listos: el visitante no vuelve a pedir config ni portada, y header y pie
reciben solo cuántos productos hay por categoría (el catálogo entero viaja solo en la portada).
supabase-js se descarga solo si el navegador guarda una sesión del personal o al abrir el login
(`lib/session.client.ts`).

**Panel.** El personal entra con Microsoft (Supabase Auth, proveedor Azure). Cada petición lleva
`Authorization: Bearer <JWT>` y el servidor:

1. Verifica el token en el servidor: con `SUPABASE_JWT_SECRET` (HS256) o con la llave pública del
   proyecto (JWKS) si usa las llaves de firma nuevas. Si no se puede, le pregunta a Supabase y lo deja
   en el log, porque así cada petición suma una consulta.
2. Exige un correo `@INTERNAL_DOMAIN` (o el de `PROTECTED_ADMIN_EMAIL`) **y** que la identidad venga
   del proveedor Azure. Si no se exigiera, cualquiera podría registrarse con correo y contraseña
   usando un correo del dominio.
3. Lee los roles de `profiles` (con 30 s de caché). En el primer login crea el perfil y aplica un rol
   reservado si un administrador lo había dejado en `pending_role_grants`.
4. `requireRole(...)` decide. `global_admin` pasa siempre. Atajos: `requireAdmin`, `requireSeller`
   (admin + seller), `requireCashier` (admin + cashier), `requireCashierOrSeller`, `requireAnyRole`.

Lo que oculta el frontend según el rol es solo comodidad: la barrera es el servidor.

**Subida de imagen.** multer → sharp (WebP; de a una imagen por vez, sin caché y con tope de 100 MP
para no pasar la memoria) → R2 con nombre por hash del contenido → la URL pública se guarda en Postgres. Ninguna dirección de imagen está escrita en el código. Al lado de cada foto se
sube su miniatura de 480 px (`<hash>-480.webp`, nombre en `shared/image-variants.ts`), que usan las
tarjetas, las miniaturas de la galería y el carrito; si no existe, la tienda pide la original. Borrar
una foto borra también su miniatura. `npm run thumbnails:backfill` genera las que faltan.

**Pedido de la tienda.** `POST /api/orders/public` recibe ids y cantidades, nunca precios. El
servidor recalcula el total, registra el intento con una clave de idempotencia
(`public_order_attempts`) y crea el pedido en una sola función SQL. Una recarga o un doble clic no
duplican el pedido. La entrega es `managua`, `cargo_trans` o `retiro` (`envio` queda en los pedidos
anteriores a la 0032 y se acepta al reintentar uno guardado). El mensaje de WhatsApp
(`modules/orders/order-message.ts`) usa el número de Configuración → Negocio. Pago del producto,
costo y pago del transporte, comprobante de Cargo Trans y fecha de recepción los carga el panel
(`PATCH /api/orders/admin/:id/operation`), cada uno por separado y con rastro en `audit_logs`; el
estado del pedido no los completa y la vista pública solo muestra la fecha de recepción.

**Buscadores.** `/robots.txt` y `/sitemap.xml` son rutas de Remix (`lib/seo.ts`). Canonical, `og:url`,
sitemap y robots usan `APP_URL`; un producto o combo pedido con otro slug redirige con 301 a su URL.
Panel, login y la vista previa del modo edición llevan `noindex` desde `root.tsx`; Mis pedidos y el
seguimiento, el suyo. Si el catálogo no responde, portada y listados salen con 503 y sin caché. Cada
producto del sitemap lleva `lastmod`: el último cambio del producto o de su plantilla (`updatedAt` del
catálogo, mantenido por el trigger `set_updated_at`). Los datos estructurados declaran todo nuevo en
caja (`NewCondition`, confirmado por el dueño); la ficha suma la categoría y la ficha técnica como
`additionalProperty`, y el negocio va con ciudad y país (Managua, NI), sin calle, y el WhatsApp de
Configuración como contacto.

**Catálogo.** `/catalogo` y `/categoria/:slug` comparten loader (`lib/catalog-listing.server.ts`) y
página (`components/catalog/catalog-listing.tsx`). La categoría se resuelve en el servidor: el HTML
inicial trae solo sus productos, y un id o nombre viejo en la ruta redirige al slug. Los demás filtros
viven en la query y la grilla los lee de la URL, así que también salen filtrados desde el servidor;
Redux solo acompaña a los campos mientras se escribe (`CatalogUrlSync`). Indexación: la portada, el
catálogo y cada categoría con productos tienen canonical propio; con búsqueda, filtros u orden en la
query, o sin productos, llevan `noindex, follow`. No hay paginación: el catálogo entra en una página.

**Contenido editable.** Horarios en `app_config.business_info` (`businessHours`); pagos, entregas y
garantía en `app_config.store_policies` (Configuración → Atención, solo admin). `GET /api/config` las
entrega con `toPublicPolicies`: la página de garantía en borrador nunca sale en la respuesta pública ni
en su caché. Ayuda (`routes/ayuda.*`) y Por mayor tienen estructura fija y leen esos datos
(`lib/info-page.server.ts`); sin config responden 503. Los destacados de la portada son
`featuredProductIds` en la configuración de portada (borrador, versiones y publicación como el resto).
El texto de cada categoría (`categories.description`) sale en `/categoria/<slug>` y es su meta
description; la marca de la plantilla (`templates.brand`) llega al catálogo como `brand` y se publica
como `Brand` en el JSON-LD. Vacíos, no se muestran ni se declaran.

## 5. Patrones obligatorios

- **Todo pasa por el servidor.** Si algo del cliente quiere tocar la base, falta un endpoint.
- **Validación en el borde** con Zod: body, params y query, antes de tocar la base.
- **Errores centralizados.** `asyncHandler` en cada ruta y un `errorHandler` final: Zod → 400 con
  detalle, multer → 400, errores de Postgres (FK, `unique`, `CHECK`) → mensaje legible, el resto → 500
  sin detalles.
- **Costos privados.** Las respuestas para quien no es admin no traen columnas de costo.
- **Stock que nunca se sobrevende.** El pedido web y el canje de códigos son funciones SQL atómicas.
  La reserva FIFO de una venta usa UPDATEs condicionados (solo escriben si el valor no cambió desde
  que se leyó) con compensación si algo falla a mitad de camino. La última defensa es el
  `CHECK (quantity_sold + quantity_reserved <= quantity)` de la base. Pasarla a una función con
  bloqueo está en 05-Pendientes.
- **Estados explícitos.** Los estados son `enum` de Postgres y las transiciones las valida el servidor.
- **Snapshot al aprobar.** Una venta aprobada guarda sus números (coste, comisión, pozos) en
  `order_items`; cambiar la configuración después no reescribe ventas viejas.
- **El esquema vive en git.** Ver `App/database/README.md`.

## 6. Datos

El esquema completo está en `App/database/01_schema.sql`, ordenado por módulo:

| Módulo | Tablas |
|---|---|
| Personal | `profiles` (con baja lógica `deleted_at`), `pending_role_grants` |
| Catálogo | `categories`, `templates` (una por modelo), `catalog_items`, `combos`, `product_offers` (ofertas por color) |
| Clientes | `contacts`, `contact_activities`, `follow_ups`, `stock_notices` |
| Compras | `suppliers`, `purchase_orders`, `purchase_invoices`, `purchases` (lotes) |
| Ventas | `orders`, `order_items`, `invoices`, `invoice_items`, `installments`, `payments`, `commission_payments`, `commission_adjustments`, `sale_returns`, `spo_outbox` |
| Tienda web | `public_orders`, `public_order_items`, `public_order_attempts`, `store_draft`, `store_versions` |
| Stock | `stock_reservations`, `stock_movements`, `losses` |
| Descuentos | `discount_codes`, `discount_code_redemptions` |
| Finanzas | `expenses`, `loan_payments` (se migra a `expenses`, ver 03-Finanzas §13) |
| Sistema | `app_config`, `audit_logs`, `analytics_events` |

Los reportes salen de funciones SQL (`get_financial_kpis`, `get_sales_breakdown`, `get_sales_ledger`,
`get_top_products`, `get_seller_performance`, `get_delivery_*`). El canje de códigos y el registro de
pedidos web también son funciones (`redeem_discount_code`, `register_public_order_attempt`).

**Correlativos.** `invoices.invoice_code` (`GS-PR-n`) y `discount_codes.code` (`GS-DC-n`) salen de
secuencias que no se reinician. Por eso una factura se anula (`void`) y no se borra.

## 7. Seguridad HTTP

Orden del middleware en `server/index.ts`:

```
trust proxy → nonce de CSP → helmet (CSP) → cors → json/urlencoded (5 MB) → sanitizeBody
→ registro de lentas → apiLimiter → borrado de copias en memoria → límites propios por ruta → rutas
→ 404 de /api → frontend (prod) → errorHandler
```

- **CSP**: scripts solo propios o con el nonce de cada petición; imágenes y video de Supabase y R2.
- **CORS**: en producción solo `CORS_ORIGIN` (o la URL de Render).
- **Límites de uso**: general 1000 cada 15 min, por persona si el token tiene firma válida y si no por
  cliente; telemetría 20 cada 5 min; pedido web, contacto y seguimiento de pedido 10 cada 15 min;
  avisos de stock 5 cada 15 min. Cada rechazo queda en el log como `[límite]`.
- **Cliente**: `CF-Connecting-IP` (la escribe Cloudflare); sin ella, `req.ip` con `trust proxy = 1`.
- **Registro de lentas**: toda petición de 1,5 s o más queda en el log como `[lento]` con su duración.

## 8. Despliegue

`render.yaml` define un Web Service (`rootDir: App`, Oregon). El servicio está en un plan pago y ya no
se duerme; el archivo todavía dice `plan: free` (ver Pendientes).

- **Build**: instala el servidor con devDependencies, corre `typecheck`, instala y compila el frontend.
- **Start**: `npm start` → `tsx server/index.ts`. En producción Express sirve también el build de Remix.
- **Health check**: `GET /api/health`.
- `autoDeploy: true`: cada push a la rama desplegada publica.
- **Dominio**: el DNS está en Cloudflare. `gyrostorenic.com` y `www` son CNAME en *Proxied* a
  `gyro-store-3sr6.onrender.com`; como Render también usa Cloudflare, primero aplica la zona propia y
  después la de Render (O2O). Una regla de caché de la zona no guarda `/robots.txt`, para que una
  respuesta de un mal momento no quede fija por horas. `APP_URL` es `https://gyrostorenic.com`.

**En desarrollo** son dos procesos: `npm run dev` en `App/` (API en :3000) y `npm run dev:frontend`
(Vite en :5173, que redirige `/api` a :3000).

**Tareas en segundo plano** (dentro del mismo proceso): la purga diaria de usuarios con más de 30
días en la papelera y el envío de comprobantes a SharePoint cada 60 s.

## 9. Variables de entorno

En Render se cargan en el panel. En desarrollo, `load-env.ts` lee el archivo que indique
`GYRO_ENV_FILE` (por ejemplo en OneDrive) o, si no está, `App/.env`. **Nunca se suben al repo.**

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Obligatorias: el servidor no arranca sin ellas. 🔒 la service_role |
| `SUPABASE_ANON_KEY` | Login del personal en el navegador. No da acceso a datos |
| `SUPABASE_JWT_SECRET` | 🔒 Opcional: verifica tokens HS256 sin consultar a Supabase en cada petición. Con las llaves de firma nuevas no hace falta: se usa la llave pública (JWKS) |
| `PROTECTED_ADMIN_EMAIL` | El `global_admin`. Obligatoria en producción |
| `INTERNAL_DOMAIN` | Dominio del personal (`gyrostorenic.com` por defecto) |
| `NODE_ENV`, `PORT` | |
| `APP_URL` | Dominio público (`https://gyrostorenic.com`): canonical, sitemap, robots, enlace de seguimiento de pedidos y QR del ticket. Sin ella, los enlaces usan `RENDER_EXTERNAL_URL` y el canonical el dominio de cada petición |
| `CORS_ORIGIN` | Si falta se usa `RENDER_EXTERNAL_URL`, que pone Render |
| `BRAND_NAME` | Opcional: título de las páginas; sin ella se usa «Gyro Store» |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (sin barra final), `R2_ENDPOINT` (opcional) | Imágenes. 🔒 las llaves |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `SPO_SITE_ID`, `SPO_DRIVE_ID` | Comprobantes en SharePoint. Opcionales: sin todas, el módulo queda apagado |
| `SPO_SITE_URL` | Solo para `npm run spo:ids` |
| `GYRO_ENV_FILE` | Solo en desarrollo: ruta del archivo de variables |

El proveedor Azure del login se configura en el panel de Supabase (Authentication → Providers), no
con variables de la app. Las variables `WHATSAPP_*` que puedan estar en el archivo de producción no
las usa el código todavía (ver 05-Pendientes).

## 10. Scripts

En `App/`:

| Script | Qué hace |
|---|---|
| `npm run dev` / `npm run dev:frontend` | API en modo watch / frontend con Vite |
| `npm start` | Producción |
| `npm run typecheck` · `npm test` | Tipos y tests del servidor |
| `npm run seed:dev -- --confirm` | Productos y banners de prueba. Se niega a correr en producción |
| `npm run spo:ids` · `spo:status` · `spo:drain` · `spo:pdf` | SharePoint (ver 04-Comprobantes-SharePoint) |

En `App/frontend/`: `npm run check` (tipos, lint y reglas de diseño; tiene que pasar antes de cada
commit), `npm test`, `npm run build`.

## 11. Dependencias externas

| Servicio | Para qué | Si se cae |
|---|---|---|
| Supabase Auth | Login del personal | Nadie entra al panel; la tienda sigue funcionando |
| Supabase Postgres | Todos los datos | La API responde 5xx |
| Cloudflare R2 | Imágenes | No se ven fotos; la tienda muestra el reemplazo |
| Microsoft Graph | Comprobantes | Las ventas se aprueban igual y los PDF se suben cuando vuelve |
| Render | Hosting | No hay tienda ni panel |

## 12. Decisiones vigentes

| Decisión | Por qué |
|---|---|
| Monolito Express + Remix en un servicio | Un solo despliegue y un solo origen (sin CORS en la práctica) |
| Supabase Postgres con `service_role` y RLS cerrada | Transacciones, FKs, `CHECK` y SQL para reportes; la base no queda expuesta |
| Login del personal solo con Microsoft Entra | Una sola fuente de identidad; altas y bajas desde Microsoft 365 |
| Rol leído de `profiles` en cada petición (con caché corta) | Cambiar un rol aplica al instante, sin renovar el token |
| Copias en memoria (tienda 60 s, libro de pozos 30 s) que borra cualquier escritura | La tienda no consulta la base en cada visita y un cambio del panel se ve al instante. Vale con una sola instancia: con varias, cada una tendría su copia |
| El panel vuelve a pedir un dato al abrir una pantalla solo si tiene más de 30 s | Navegar no repite consultas; lo que cambia el propio panel se actualiza por los tags de RTK Query |
| Pedido por WhatsApp, sin pasarela de pago | Así compra el cliente local; el pago queda como evento futuro del pedido |
| Imágenes en R2 con WebP y nombre por hash | Sin costo de salida; subir dos veces el mismo archivo no duplica |
| TypeScript en todo, esquemas Zod compartidos | Un solo contrato entre cliente y servidor |
| Comprobantes en SharePoint con outbox | Aprobar nunca depende de Microsoft; Postgres sigue siendo la fuente de verdad |
