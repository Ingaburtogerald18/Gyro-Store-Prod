# 04 · Backend (API) — Gyro Store

> Los **contratos de la API casi no cambian** con v2: los mismos 19 grupos de rutas, los mismos
> dominios. Lo que cambia por debajo es el motor (Supabase en vez de Firestore), el lenguaje
> (**TypeScript + ESM**) y dos servicios (email → Microsoft 365). El detalle interno de algunos
> endpoints es `[PROPUESTO]` — lo verifico contra el código viejo al portar.

---

## 1. Convenciones
- **Prefijo:** `/api`. Todo lo no-API lo sirve Remix (SSR). Health: `GET /api/health`.
- **Auth:** `Authorization: Bearer <JWT de Supabase>` en lo no público. [v2 — antes ID token de Firebase]
- **Errores:** handler central. `ZodError`→400 `{ error, issues }`; `MulterError`→400; errores de
  **Postgres** (FK/`unique`/`CHECK`) → código legible; status explícito respetado; resto→500 genérico.
- **Validación:** Zod desde `shared/schemas.ts` (contrato compartido front/back) + schemas de servidor.
  Subidas con `multer` + `fileFilter` de mimetype.
- **Sanitización:** `sanitizeBody` global. **Rate limit:** `apiLimiter` global.
- **Paginación:** por cursor sobre `created_at` (más simple en SQL con `WHERE created_at < ? LIMIT n`).

## 2. Cadena de middleware
```
helmet → compression → express.json(5mb) → urlencoded → sanitizeBody →
cors(prod restringido) → morgan(logger) → apiLimiter → [requireRole/atajos] → handler →
errorHandler central
```
`trust proxy = 1` (Render detrás de proxy). El `requireRole` **verifica el JWT de Supabase** y
resuelve el rol (whitelist env → tabla `profiles`). [v2]

## 3. Atajos de rol [se mantiene]
`requireAdmin` · `requireSeller` (admin+seller) · `requireCashier` (admin+cashier) ·
`requireLogisticsAdmin` · `requireLogisticsAny` · `requireAnyRole`. `global_admin` pasa siempre.

**`requireCustomer` [v2 · doc 14]** — middleware **paralelo**, no un atajo más de los de arriba.
Verifica el JWT de comprador (OTP, Supabase Auth) y lo resuelve a un **contacto** (vía
`contacts.auth_user_id`), nunca a un `AppRole`. Protege el grupo `/api/account` (§4). Un JWT de
comprador no pasa `requireRole` ni viceversa — son dos mundos que no se cruzan (doc 03 §A.8).

---

## 4. Los 19 grupos de rutas [se mantiene de v1]

| Ruta base | Dominio | Notas |
|---|---|---|
| `GET /api/health` | sistema | healthcheck Render |
| `/api/auth` | autenticación | `/me` usa `requireAnyRole`; verifica JWT de Supabase [v2] |
| `/api/config` | config pública | expone currency, exchangeRate, whatsapp, etc. |
| `/api/catalog` | catálogo público | query directo a Postgres; caché en memoria opcional [v2] |
| `/api/templates` | plantillas de variantes | admin |
| `/api/combos` | paquetes/combos | público (checkout) + admin |
| `/api/orders` | pedidos | incluye `public_orders` del checkout WhatsApp |
| `/api/contact` | formulario de contacto | público (`contactSchema`) → CRM |
| `/api/inventory` | bodega / FIFO | admin |
| `/api/sales` | ventas | **sub-módulos** (ver §5) |
| `/api/invoices` | facturación POS | caja / admin |
| `/api/reports` | reportes | KPIs, pérdidas, gastos, export — ahora con SQL/vistas [v2] |
| `/api/users` | usuarios | admin; soft-delete con `deleted_at` [v2] |
| `/api/logistics` | Gyro Logistics | timeline + emails (M365) |
| `/api/installments` | cuotas | `installmentSchema` |
| `/api/crm` | CRM + WhatsApp | contactos, ficha 360, follow-ups, conversaciones, **webhook de Meta** — detalle en doc 10 |
| `/api/feedback` | feedback de usuarios | `bug`\|`idea`\|`product` |
| `/api/discount-codes` | códigos de descuento | validar/canjear + campañas por canal — ampliado en v2, ver abajo |
| `/api/search-events` | telemetría | `telemetryLimiter` solo en POST |
| `/api/account` | cuentas de comprador | **[v2 · doc 14]** OTP/registro, `requireCustomer` para el resto — ver abajo |

> **`/api/account` (nuevo, doc 14):** audiencia de **comprador**, no de staff.
> - `POST /api/account/otp` · público, rate-limit agresivo · solicita el código OTP por teléfono.
> - `POST /api/account/verify` · público · valida el OTP, devuelve sesión/JWT de comprador.
> - `GET /api/account/me` · `requireCustomer` · datos de la cuenta + progreso de lealtad.
> - `GET /api/account/orders` · `requireCustomer` · "mis pedidos" (atribuidos por teléfono, doc 14 §3).
> - `GET /api/account/codes` · `requireCustomer` · "mis códigos" (lealtad, doc 14 §5).
> - `GET /api/account/wishlist` **[PROPUESTO]** · `requireCustomer` · si se aprueba el extra del doc 14 §14.
>
> **`/api/discount-codes` ampliado (doc 14 §6, §10):** valida/canjea códigos de los tres tipos
> (lealtad atada a cuenta, campaña pública por canal, y el mayoreo que sigue siendo del cotizador, no
> un código). El endpoint de validación es el mismo que ya usa el cotizador del vendedor; solo se le
> suma la lógica de `single_use`/`expires_at`/`redeemed_at`/`channel` (doc 03 §B.9).

> **CRM:** ya está resuelto (doc 10). Unifico todo bajo `/api/crm` (jubilo `/api/followups` de v1) e
> integro la **WhatsApp Cloud API** de Meta. El webhook `POST /api/crm/webhook` es **público pero
> verificado por firma** de Meta (`X-Hub-Signature-256`); el resto pasa por `requireRole`. Sin n8n al
> inicio: el webhook pega directo a Express. Endpoints y flujo del bot en el doc 10.

---

## 5. Ventas — sub-módulos [se mantiene la estructura de v1]
`routes/sales/` sigue partido por responsabilidad: `index.ts` (router), `register.ts` (registrar →
reserva stock), `quotes.ts` (cotizador), `manage.ts` (approve/reject/edit/delete), `payments.ts`
(pagar / pagar-semana), `list.ts` (listados), `sellerPortal.ts` (portal del vendedor), `helpers.ts`.

Endpoints núcleo (de las máquinas de estado):
- `POST /api/sales` · seller · registra venta → **reserva stock** (transacción Postgres). [v2]
- `POST /api/sales/:id/approve` · admin · consume reserva → vendido; **fija comisión/utilidad**.
- `POST /api/sales/:id/reject` · admin · libera reserva (exige motivo).
- `PUT /api/sales/:id` · admin · re-reserva + recalcula comisión + `audit_logs`.
- `DELETE /api/sales/:id` · admin · libera/devuelve stock según estado (exige motivo).
- `POST /api/sales/:id/pay` · `/pay-week` · admin · liquidación (por semana ISO).

> **Ganancia de v2:** el approve (reservar→consumir) y la edición (liberar→re-reservar) los puedo
> envolver en **una sola transacción SQL**, cerrando la ventana de inconsistencia que en v1 quedaba
> mitigada solo por el log (ADR-007 / deuda R4). [v2]

## 6. Checkout público [se mantiene — ADR-004]
`POST /api/orders/public` · sin auth · recibe el pedido del catálogo, **recalcula el total en el
servidor**, crea `public_orders` (+ `public_order_items`), y el frontend arma el **link de WhatsApp**.
El cierre/cobro es manual; luego el admin registra la venta real (que sí descuenta stock).

## 7. Servicios internos [se mantiene, con 2 cambios]
`auth · balance · catalog · combos · commission · config · crm · email · installments · inventory ·
invoice · logistics · orders · reports · sales · storage · telemetry · whatsapp` [v2].

- **`storage` (R2):** sin cambios. `@aws-sdk/client-s3`; optimiza con **Sharp** a **WebP**, nombra por
  **hash de contenido** (subidas idempotentes), limpia huérfanos al borrar.
- **`email` → Microsoft 365:** [v2] invitaciones + notificaciones de logística desde
  `@gyrostorenic.com`, vía Graph API o SMTP del tenant (antes nodemailer + Gmail).
- **`commission`:** escala progresiva; se fija al aprobar, se recalcula al editar.
- **`inventory`:** FIFO — `reserveForItems`, `consumeReservation`, `reserveForMigratedItems`,
  `takeFifo`, ahora sobre **transacciones SQL** con `SELECT ... FOR UPDATE`. [v2]
- **`reports`:** agregados con **SQL / vistas** en vez de recorrer colecciones en memoria. [v2]
- **`whatsapp` (Meta Cloud API):** [v2] verifica la firma del webhook, parsea entrantes, envía
  mensajes/plantillas por la Graph API. Es donde vive el bot; diseñado para que n8n pueda entrar
  después sin reescribir (doc 10).
- **`crm`:** contactos, follow-ups, ficha 360 (contacto + pedidos + ventas + chat con `JOIN`). [v2]

## 8. Utilidades [se mantiene]
`asyncHandler · logger` (JSON estructurado en prod) `· pagination` (cursor) `· sanitize · upload`
(multer + fileFilter) `· validators · dbError` (mapea errores de Postgres a códigos legibles [v2]).

## 9. Lo que falta documentar endpoint-por-endpoint [PROPUESTO]
No leí cada handler del sistema viejo. Al portar cada `routes/*` conviene extraer la firma exacta
(método, path, rol, schema Zod, respuesta) y volcarla en una tabla. El doc 09 (orden de construcción)
va grupo por grupo, así que esa tabla la voy completando a medida que porto cada dominio.
