# 03 · Datos y seguridad — Gyro Store

> Este es el documento que más cambia con v2, porque **paso de Firestore (NoSQL) a Postgres (SQL)**.
> El modelo de datos deja de estar orientado a "patrones de acceso" y pasa a ser **relacional de
> verdad**: tablas, claves foráneas, tipos `enum`, `CHECK constraints` y transacciones. La parte de
> seguridad conserva la misma filosofía de v1 (todo por el servidor), reimplementada sobre Supabase.
> Marcador `[v2]` = cambio de esta versión.

---

## PARTE A — Seguridad y autenticación

### A.1 Modelo de acceso [v2 — equivalente a v1]
**RLS en deny-all.** El navegador **solo** usa Supabase **Auth**; todo dato pasa por Express con la
**`service_role key`**, que ignora las RLS. Las políticas RLS de cada tabla quedan restrictivas por
defecto (sin `policy` = sin acceso con la `anon`/`authenticated` key). Es el mismo deny-all de v1,
ahora en Postgres. El schema y las políticas se versionan como **migraciones SQL** en git.

### A.2 Autenticación real [v2]
1. Login en el cliente con **Supabase Auth + proveedor Microsoft (Azure/Entra)** → el staff entra
   con su cuenta `@gyrostorenic.com`. Supabase devuelve un **JWT**.
2. `Authorization: Bearer <JWT>` a la API.
3. El server **verifica el JWT** (con el secret del proyecto Supabase o `auth.getUser(jwt)`).
4. **Verificación de dominio:** solo se aceptan cuentas del tenant `gyrostorenic.com`
   (`INTERNAL_DOMAIN`). Un correo fuera del dominio no es staff. [v2 — antes `gyrostore.com`]
5. **Sync de perfil:** al autenticar por primera vez, creo/actualizo la fila en `profiles`
   (nombre, foto, email) para verlo en Gestión de Usuarios.

> **Compradores:** el storefront sigue siendo 100% público — nunca necesitan loguearse para comprar.
> **Entra ID existe solo para el staff**, sin excepción. Un comprador **puede opcionalmente** crear
> una cuenta, pero por un camino de auth totalmente distinto (OTP por teléfono, no Entra) — ver A.8.

### A.3 Roles [se mantiene el set de v1]
`global_admin · admin · seller · cashier · logistics_admin · logistics_customer`.
- **Multi-rol:** cada usuario tiene un **array** `roles` (columna `text[]` o tabla `user_roles`); el
  "rol primario" se elige por `rolePriority`.
- `global_admin` = acceso total a todo el portal.
- **Resolución del rol por request:** whitelist de env (`ADMIN_EMAILS`/`SELLER_EMAILS`) → si no,
  fila de `profiles` en Postgres (una sola lectura, barata). [v2 — antes era un doc de Firestore]
- `protectedEmail` (primer `ADMIN_EMAILS` o `PROTECTED_ADMIN_EMAIL`) no se puede editar ni borrar.

### A.4 Autorización [se mantiene]
Factory `requireRole(...allowed)` + atajos por portal:
`requireAdmin`, `requireSeller` (admin+seller), `requireCashier` (admin+cashier),
`requireLogisticsAdmin`, `requireLogisticsAny`, `requireAnyRole`.
Deja pasar si el usuario es `global_admin` **o** tiene alguno de los roles permitidos. El
`<RequireRole>` del frontend es solo UX; la barrera real es el servidor.

### A.5 Dónde vive el rol — la decisión de siempre, en términos de Supabase [v2]
En v1 esto era el ADR-006 (custom claims sí/no). En Supabase tengo dos caminos:
- **(a) Leer `profiles` por request** — barato en Postgres, con **efecto inmediato** (cambio un rol
  y aplica en el siguiente request, sin refrescar token). *Es mi opción por defecto.*
- **(b) Meter el rol en el JWT con un *custom access token hook*** de Supabase — elimina la lectura,
  pero el cambio de rol no aplica hasta refrescar el token.

**Decisión v2:** arranco con **(a)** por el efecto inmediato y porque en Postgres el costo es
despreciable. Si algún día el volumen lo justifica, evalúo (b). [v2 · decisión tomada, reversible]

### A.6 Hardening HTTP [se mantiene, con una verificación]
- `helmet`. En v1 tenía `crossOriginOpenerPolicy: 'same-origin-allow-popups'` para no romper el
  popup de login de Firebase. **Con Supabase + Entra, si uso el flujo de redirect, puedo endurecer
  el COOP.** Lo verifico al implementar el login. [v2 · a verificar]
- `compression`, `express.json({limit:'5mb'})`, `sanitizeBody` global, `cors` restringido en prod
  (`corsOrigin` = `RENDER_EXTERNAL_URL`/`CORS_ORIGIN`).
- `app.set('trust proxy', 1)` — sin esto `express-rate-limit` ve la IP del proxy de Render.
- Rate limit: `apiLimiter` global + `telemetryLimiter` solo en POST de escritura de telemetría.

### A.7 Manejo de errores central [se mantiene, + errores de Postgres]
Un handler final: `ZodError`→400 con `issues`; `MulterError`→400; errores con `status` explícito
respetan su código; **errores de Postgres** (violación de FK, `unique`, `CHECK`) se mapean a un
código legible; el resto → 500 genérico (no filtra detalles). 404 de API → `{ error }`. [v2]

### A.8 Auth de comprador (OTP) — audiencia separada del staff [v2 · doc 14]
El dominio de **cuentas de comprador** (doc 14) agrega una segunda audiencia de auth, con su propio
middleware, **paralelo** a todo lo de A.2–A.4 (que sigue siendo exclusivamente para staff):

1. **Login:** OTP por teléfono (SMS y/o WhatsApp) vía Supabase Auth. Correo es opcional; teléfono
   **siempre obligatorio** — es la llave del OTP y el nexo con WhatsApp (doc 14 §3–4).
2. **`requireCustomer`** — middleware nuevo, estructuralmente igual a `requireRole` pero resuelve a un
   **contacto** (`contacts`, vía `contacts.auth_user_id`), **nunca** a un `AppRole`. No hay overlap:
   un JWT de comprador no es válido en ninguna ruta protegida por `requireRole`, y viceversa. Mezclar
   ambos sería una escalada de privilegios.
3. **Mismo patrón deny-all:** el comprador logueado tampoco lee Postgres directo. Sus lecturas ("mis
   pedidos", "mis códigos") pasan por Express con `service_role`, igual que el staff y que el
   storefront público. **No se abren políticas RLS de cara al cliente** — el filtro "mostrale solo lo
   suyo" vive en el `WHERE` del backend, no en RLS.
4. **Rate-limit propio y agresivo** en el endpoint de solicitud de OTP (más estricto que `apiLimiter`,
   ver A.6) — mitiga OTP-bombing. Respuestas **genéricas** en login (nunca confirmar si un teléfono
   tiene cuenta o no) — mitiga enumeración de cuentas. Detalle de riesgos: doc 14 §12.

---

## PARTE B — Modelo de datos relacional (Postgres)

> En v1 esto eran **25 colecciones Firestore** modeladas por patrones de acceso. En v2 las convierto
> en **tablas Postgres normalizadas**, con relaciones reales. Varias cosas que antes eran arrays
> embebidos (items de una venta, reservas, actividades de un contacto) ahora son **tablas hijas con
> FK** — más limpio de consultar y con integridad garantizada por la base. Los `counters` de v1 los
> reemplazo por **sequences** nativas de Postgres. [v2]
>
> Convención: 🔑 = índice / se consulta por acá · 🧮 = derivado/calculado · FK = clave foránea.

### B.0 Mapa de tablas (de colección Firestore → tabla Postgres)

| Dominio | Tablas Postgres v2 | Venía de (colección v1) |
|---|---|---|
| Catálogo | `catalog_items`, `templates`, `combos` | catalog, templates, combos |
| Inventario | `purchases`, `products`, `migrated_inventory`, `stock_reservations` | idem |
| Ventas | `orders`, `order_items` (reservas: `stock_reservations`, doc 03 B.3) | orders (arrays embebidos → tablas hijas) |
| Facturación | `invoices` | invoices |
| Pedidos públicos | `public_orders`, `public_order_items` | public_orders |
| Cuotas | `installments`, `payments` | installments, payments |
| Comisiones | `commission_adjustments` | commission_adjustments |
| Usuarios | `profiles` (+ `deleted_at` para soft-delete) | users, users_deleted |
| Config | `app_config` | app_config |
| Pérdidas / auditoría | `losses`, `audit_logs` | losses, audit_logs |
| Logística | `logistics_shipments`, `logistics_events` | logistics_shipments (timeline → tabla hija) |
| CRM | `contacts`, `contact_activities`, `follow_ups`, `whatsapp_conversations`, `whatsapp_messages` | contacts + activities (unifico; jubilo `followups`) + tablas nuevas de WhatsApp |
| Telemetría | `analytics_events` | analytics_events |
| Feedback | `feedback` | feedback |
| Descuentos | `discount_codes` (extendida: campaña + lealtad) | discount_codes |
| Cuentas y lealtad | `contacts` (extendida: `auth_user_id`, UTM), `discount_codes` (extendida) | — (nuevo v2, doc 14) |

> **`counters` desaparece:** la numeración correlativa (tickets, lotes, etc.) la hago con
> **`sequences` de Postgres**, que son atómicas por diseño. [v2]
> **CRM:** ya está decidido (doc 10). Unifico en `contacts` + `contact_activities`, agrego
> `follow_ups` y las tablas de WhatsApp, y **jubilo la vieja `followups`** de v1. El CRM integra la
> **WhatsApp Cloud API** de Meta con el webhook directo a Express (sin n8n al inicio).

### B.1 Tipos `enum` que definо (integridad desde la base) [v2]
```sql
purchase_status   : 'china' | 'pending' | 'received'
order_status      : 'pending_approval' | 'approved' | 'paid' | 'rejected'
sale_origin       : 'native' | 'migrated'
invoice_status    : 'unlinked' | 'linked'
payment_method    : 'efectivo' | 'transferencia' | 'tarjeta'
loss_category     : 'robo' | 'dano' | 'devolucion' | 'regalias'
feedback_type     : 'bug' | 'idea' | 'product'
app_role          : 'global_admin' | 'admin' | 'seller' | 'cashier' | 'logistics_admin' | 'logistics_customer'
contact_origin    : 'fb_ads' | 'organic' | 'whatsapp_link' | 'referral' | 'other'   -- CRM (doc 10)
follow_up_status  : 'pending' | 'completed' | 'cancelled'                            -- CRM (doc 10)
conversation_status : 'bot' | 'needs_human' | 'closed'                               -- CRM (doc 10)
message_direction : 'inbound' | 'outbound'                                           -- CRM (doc 10)
```

### B.2 Catálogo público
**`catalog_items`** — ítems publicados
| Campo | Tipo / nota |
|---|---|
| `id` | PK |
| `template_id` FK → `templates` 🔑 | plantilla de variantes |
| `base_price`, `price` | precio base; override por variante en `variant_mappings` |
| `variant_mappings` | `jsonb` → `"opt / opt": { sku, price? }` (combinación → SKU de bodega) |
| `axis_options` | `jsonb` → qué opciones ofrece por eje |
| `images`, `images_by_color` | `jsonb`/`text[]` → URLs en R2 |
| `published`, `is_promo`, `sort_order` 🔑 | filtros de la lista |

> **Patrón de lectura [v2]:** en v1 traía toda la colección + templates a memoria por los límites de
> Spark. En Postgres puedo consultar directo con `WHERE published = true ORDER BY sort_order`, con
> índices. El caché en memoria queda como optimización **opcional**, no como necesidad.

**`templates`** — plantillas de variantes (ejes/opciones/specs en `jsonb`). Producto cartesiano de
variantes. Se leen junto al catálogo (join o segundo query).

**`combos`** — paquetes con precio propio; se enriquecen en el checkout público.

### B.3 Inventario (bodega) — con contabilidad FIFO
**`purchases`** — lotes de compra (inventario **NATIVO**)
| Campo | Tipo / nota |
|---|---|
| `id` | PK |
| `code` 🔑 | código de compra (FIFO), formato `IN\d+` (ej. IN13) — `unique` |
| `lot` | formato `LT\d+` |
| `status` | `purchase_status` (`china`\|`pending`\|`received`); solo `received` es vendible |
| `purchase_date` 🔑 | orden **FIFO** + filtro por período |
| `quantity`, `quantity_sold`, `quantity_reserved` | `CHECK (quantity_sold + quantity_reserved <= quantity)` 🧮 `available = quantity - sold - reserved` |
| `costo_china_usd`, `impuesto_unit_usd`, `envio_unit_usd` | entradas de costo por unidad (USD) — ver doc 11 §1 |
| `exchange_rate` | **congelada al recibir el lote** (el costo histórico no se mueve) [v2] |
| 🧮 `costo_real_usd`, 🧮 `costo_real_cs` | costo real derivado (base de todos los cálculos, doc 11) |
| `product_name`, `category`, `arrival_date`, `suggested_price` | campos del panel v1 (migración 0007) — `product_name` es texto libre: a esta altura del flujo la compra **no** está vinculada a `catalog_items`/`products`, eso pasa recién en el catálogo admin (ítem 54) |
| 🧮 `costo_f_u`, 🧮 `coste_final` | Costo F/U + coste final (doc 11 §2), migración 0007 — viven acá y no en `products` porque `stock_reservations.purchase_id` prueba que el FIFO real corre sobre `purchases`, no sobre `products` |

**`products`** — stock por SKU (vista de bodega). `sku`/`code` 🔑 (`unique`), `stock` 🧮 descontado
atómicamente. En Postgres el detalle de catálogo resuelve stock con un `JOIN` normal (adiós al
`where('sku','in',<=10)` por lotes que imponía Firestore). [v2] **Aún sin uso**: nada en el Hito 2 de
inventario (`purchases`/FIFO) la toca todavía — se activa cuando el catálogo admin (ítem 54) vincule
una compra a un `catalog_item`/SKU.

**`migrated_inventory`** — inventario histórico (Excel viejo), `origin='migrated'`, costo real ya
dado (no corre FIFO). Aislado de `purchases`. Migración 0005 le agrega el resto de campos que pide el
panel v1: `status` (texto libre, no el enum `purchase_status` — no tiene sentido "en tránsito" para
algo migrado), `lot`, `code`, `purchase_date`, `quantity_sold`, `quantity_reserved`, `cost_unit_usd`,
`shipping_unit_usd`, `suggested_price`, `comments`.

**`stock_reservations`** — reservas de stock. En v2 es una **tabla con FK** a `orders` y `purchases`,
no un array suelto; la integridad la garantiza la base.

### B.4 Ventas y facturación
**`orders`** — cabecera de la venta
| Campo | Tipo / nota |
|---|---|
| `id` | PK |
| `status` | `order_status` (`pending_approval`→`approved`→`paid` / `rejected`) |
| `sale_origin` | `sale_origin` (`native`\|`migrated`) |
| `seller_uid` FK → `profiles`, `seller_email`, `week_of` 🔑 | pagos agrupados por **semana ISO** |

**`order_items`** — líneas de la venta (**tabla hija**, antes array embebido)
`order_id` FK, `sku`, `precio_unit`, `quantity`, y el **snapshot financiero congelado al
aprobar** (solo admin): `coste_final_snap`, `utilidad_bruta`, `salary`, `utilidad_neta`, `comision`,
`ganancia_tienda`, `pozos` (jsonb con los 7 montos). Toda la matemática está en el doc 11. [v2]

La venta ↔ stock reservado se enlaza con **`stock_reservations`** (B.3 arriba, `order_id` FK) — no
hay una tabla `order_reservations` aparte: 0003_sales.sql había creado una duplicada por error
(mismo shape, sin usar); se eliminó en la migración 0008 (doc 09 ítem 60).

> Los costos (`cost`, `commission`) se filtran (`publicItems`) antes de responder a no-admin. Con
> tablas separadas es aún más fácil: el `SELECT` para no-admin simplemente no trae esas columnas.

**`invoices`** — tickets POS (caja). `status` = `invoice_status` (`unlinked`→`linked`). La
vinculación a una venta corre en **transacción** → **1 ticket = 1 uso**. `method` = `payment_method`.
`delivery_fee` es **solo informativo** (se imprime, no entra al total ni a comisiones).

**`public_orders`** + **`public_order_items`** — pedidos del catálogo (checkout WhatsApp). Se crean
**sin auth**; el total se **recalcula en el servidor**. Admin los lista paginando por `created_at`.

### B.5 Soporte
| Tabla | Uso |
|---|---|
| `profiles` (+ `deleted_at`) 🔑 email | roles fuera de whitelist env; soft-delete con papelera de 30 días |
| `app_config` | doc `pricing` (descuentos por volumen), costos fijos |
| `audit_logs` | ediciones/eliminaciones de ventas (motivo, autor, montos antes/después) |
| `losses` | `loss_category` (`robo`\|`dano`\|`devolucion`\|`regalias`) — consumen costo FIFO |
| `installments` / `payments` / `commission_adjustments` | cuotas, pagos, ajustes de saldo |
| `contacts` (+ `contact_activities`), `follow_ups`, `whatsapp_conversations`, `whatsapp_messages` | CRM + WhatsApp — detalle completo en doc 10. `contacts.phone` 🔑 = ID de WhatsApp |
| `logistics_shipments` (+ `logistics_events`) | logística China→Nicaragua (timeline + emails) |
| `analytics_events` | telemetría (búsquedas, populares) — consultable con SQL directo |
| `feedback` | `feedback_type` (`bug`\|`idea`\|`product`) |
| `discount_codes` | códigos de descuento |

### B.6 Costeo, pozos y precios → **doc 11 (fuente de verdad)**
Toda la matemática financiera (costeo de compra, Costo F/U escalonado, los **7 pozos**, PVP con
márgenes escalonados, comisiones y mayoreo) está en el **doc 11**, con las cifras reales de mi Excel.
Resumen para el modelo de datos:
- **7 pozos** (suman 100% del Costo F/U): Publicidad 25%, Mantenimiento 7%, Útiles 5%, Garantías 8%,
  **Préstamos 40%**, Suscripciones 5%, Servicios 10%. [v2 — reemplaza los placeholders 10/5/5/5 de v1]
- **Costo F/U** se asigna por tramos del `costo_real_cs`; el **Coste final** = `costo_real_cs + costo_f_u`.
- Todas las tablas (tiers, %, márgenes, comisión, mayoreo) son **editables desde `app_config`**.
- Los valores calculados de cada venta se **congelan** en `order_items` al aprobar (snapshot).

---

## B.7 Reglas de integridad — ahora repartidas entre base y servidor [v2]

En v1 **toda** la integridad la garantizaba el servidor (Firestore no tiene constraints). En v2
**muevo lo que puedo a la base** (más difícil de romper) y dejo en el servidor lo que necesita lógica:

| Regla | Quién la garantiza en v2 |
|---|---|
| Stock nunca sobrevendido | Servidor (transacción + `SELECT FOR UPDATE`) **+** `CHECK (sold+reserved<=quantity)` en la base |
| Costos privados a no-admin | Servidor (`publicItems` / `SELECT` sin columnas de costo) |
| Transiciones de estado válidas | Servidor (máquina de estados) — el `enum` limita los valores posibles |
| Relación venta↔ítems↔reservas | Base (**FK** con `ON DELETE`), antes eran arrays sin integridad |
| Soft-delete de usuarios | `deleted_at` + vista; cron purga a los 30 días |
| Numeración correlativa | **`sequence`** de Postgres (atómica), antes colección `counters` |
| Auditoría de ventas | Servidor escribe `audit_logs` en edición/eliminación, con motivo y autor |

## B.8 Deuda de datos que arrastro o resuelvo [v2]
- **Se resuelve solo:** race conditions de stock (transacción SQL), agregados de reportes (SQL/vistas
  en vez de cachear), límites de Spark (ya no existen), lecturas `in` por lotes de ≤10 (ya no existen).
- **Queda pendiente:** definir bien índices y `EXPLAIN` de los listados grandes (inventario, ventas)
  cuando el volumen crezca; decidir si algunos reportes van a **materialized view**.
- **CRM:** resuelto en el doc 10 (unifico en `contacts`, agrego `follow_ups` + tablas de WhatsApp).
  Para la Ficha 360 agrego `contact_id` (FK nullable) + `phone` a `orders` y `public_orders`, así
  puedo hacer `JOIN` y ver todo el historial de compras de un cliente.

## B.9 Cuentas de comprador y lealtad → **doc 14 (fuente de verdad)** [v2]
El flujo y las decisiones de producto están en el doc 14; acá el resumen para el modelo de datos.

- **`contacts` se extiende:** `auth_user_id` uuid, **FK nullable `unique`** → `auth.users` (liga el
  contacto a una cuenta de comprador; nullable porque la mayoría de contactos no tienen cuenta —
  siguen siendo leads sueltos como hoy). Se suman campos **UTM** (fuente/medio/campaña) para
  atribución fina, más allá del `contact_origin` genérico que ya existe (doc 14 §10). El
  reconocimiento de **cliente mayorista** es un campo aprobado por admin, no auto-declarado (doc 14
  §7) — nombre exacto de columna a fijar al implementar.
- **`discount_codes` se extiende:** `campaign` (texto, para campañas por canal), `contact_id` FK
  nullable → `contacts` (los códigos de **lealtad** quedan atados a una cuenta; los de **campaña**
  quedan `null` porque son públicos), `single_use` boolean, `expires_at` timestamptz, `redeemed_at`
  timestamptz, `channel`. El `kind` (columna ya existente) distingue el tipo (ej. `'loyalty'` \|
  `'campaign'`). Mismo storage para los tres tipos de incentivo del doc 14 §6 salvo el (a) mayoreo, que
  no es un código — es una regla de precio (doc 11 §5).
- **Contador de lealtad** (compras entregadas → código cada 3, doc 14 §5): **[PROPUESTO]** si se
  deriva contando órdenes entregadas desde el último código generado (sin tabla nueva) o si necesita
  una tabla de eventos propia. El diseño asume que alcanza con derivarlo de `orders`/`order_items` +
  el estado "entregado"; lo cierro al implementar.
- **Estado de pedido de cara al cliente** (doc 14 §8, `recibido → en preparación → salió/listo para
  retiro → entregado`): **[PROPUESTO]** si es una columna nueva en `orders`/`public_orders` o una
  traducción/mapeo desde `order_status` + `logistics_events` que ya existen. Conceptualmente es una
  vista de solo lectura, no una segunda fuente de verdad.
- **`analytics_events`** se extiende con los mismos campos UTM, para cruzar visita → campaña → cuenta.
- **[PROPUESTO] tablas futuras** (doc 14 §14, no se crean todavía): `wishlist`, `referrals`, `reviews`
  — dependen de que apruebe esos extras.

**Seguridad — sin excepciones al patrón:** el comprador logueado lee "mis pedidos"/"mis códigos" por
Express con `service_role`, igual que cualquier otra audiencia. **No se abren políticas RLS de cara al
cliente**; el deny-all de A.1 se mantiene sin excepción también para esta tabla y las que se agreguen.
