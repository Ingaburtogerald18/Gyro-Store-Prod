# 09 · Orden de construcción — Gyro Store v2

> **Qué queda de este documento.** Nació como un plan de armado archivo por archivo, de abajo hacia
> arriba, para construir el repo sin perderse. Los **Hitos 0–5 ya se ejecutaron**: sus tablas se
> borraron de acá porque describían rutas que hoy no coinciden con la realidad (`supabase/migrations/`
> cuando el esquema vive consolidado en `App/database/01_schema.sql`, archivos como `routes/health.ts`
> que terminaron inline en `index.ts`) — una lista obsoleta de nombres de archivo no documenta nada,
> desorienta. Para el estado real, mirá `App/`.
>
> Lo que sigue vivo y por eso se conserva: **las fases de CRM que faltan**, **el Hito 7 completo** y
> **las reglas transversales**.

---

## Lo ya construido (Hitos 0–5)

| Hito | Qué entregó | Dónde mirar hoy |
|---|---|---|
| **0** · Fundación | Express + TS/ESM, config, cliente Supabase, middleware (auth, errores, rate limit), `/api/health`, esquema inicial con RLS deny-all | `App/server/`, `App/database/01_schema.sql` |
| **1** · Storefront | Catálogo público, PDP, combos, carrito → WhatsApp, contacto, login con Entra | `App/frontend/app/routes/{_index,producto.$id,combo.$id,contacto,login}.tsx` |
| **2** · Inventario y catálogo | FIFO transaccional, compras, costeo (doc 11), CRUD de catálogo con imágenes en R2 | `services/{inventory,storage}.ts`, `admin.{inventario,catalogo}.tsx` |
| **3** · Ventas y facturación | Ciclo completo: registrar → aprobar (snapshot financiero) → facturar → pagar comisión. Cuotas | `services/{sales,commission,invoice,installments}.ts` |
| **4** · Reportes y soporte | KPIs por SQL, códigos de descuento, personal, analítica, caja y cuadre | `services/reports.ts`, `routes/{caja,cuadre,analytics}.ts` |
| **5** · Polish | Cron de papelera, limpieza de huérfanos en R2, CSP endurecida | `services/cleanupUsers.ts`, `scripts/cleanup-r2.ts`, `server/index.ts` |

**Logística quedó fuera.** Es el único dominio del plan original sin construir (el nav lo muestra con
badge "Pronto").

---

## HITO 6 — CRM y WhatsApp (doc 10)

**Fase CRM-A: hecha.** Contactos, ficha 360 y agenda de seguimientos → `server/routes/crm.ts`,
`admin.crm.tsx`. Entrega valor sola, aunque todo se cargue a mano.

Lo que falta depende de Meta (número dedicado + setup de la Cloud API), y por eso se dejó para el
final: es la única parte del sistema que depende de un tercero para arrancar.

### Fase CRM-B — WhatsApp Cloud API
| Archivo | Qué hace | Depende de |
|---|---|---|
| `server/services/whatsapp.ts` | Verificar firma de Meta, enviar mensaje/plantilla, parsear webhook | `config.ts` |
| `server/routes/crm.ts` (webhook) | `GET/POST /api/crm/webhook` (verify token + firma) | whatsapp.ts |
| `admin.crm.tsx` — Inbox | Bandeja tipo WhatsApp Web para chats `needs_human` | CRM-A |

### Fase CRM-C — bot y automatización
| Archivo | Qué hace |
|---|---|
| `server/services/whatsapp.ts` (bot) | FAQ, ruteo por origen (ads/links), handover a humano |
| `server/cron/followupsOutbound.ts` | Cron diario: `follow_ups` de hoy → plantilla saliente |

### Fase CRM-D (opcional)
n8n self-hosted, **solo si los flujos se complican**. Consumiría los endpoints ya hechos.

---

## HITO 7 — Cuentas de comprador y lealtad (doc 14)

**Sin empezar.** Capa opcional sobre el storefront ya construido; no bloquea nada. Depende de que
`contacts`, `discount_codes` y `orders`/`public_orders` existan — todas ya están.

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `database/migrations/00XX_accounts.sql` | `contacts.auth_user_id` (FK nullable unique → `auth.users`), campos UTM en `contacts`/`analytics_events`, extensión de `discount_codes` (`campaign`, `contact_id`, `single_use`, `expires_at`, `redeemed_at`, `channel`), aprobación de mayorista, estado del pedido de cara al cliente |
| 2 | `shared/schemas.ts` | Schemas Zod de OTP/registro, "mis pedidos", "mis códigos" |
| 3 | `server/middleware/requireCustomer.ts` | Verifica el JWT del comprador y lo resuelve a **contacto**, nunca a un `AppRole` |
| 4 | `server/services/account.ts` | OTP (solicitar/verificar), perfil, "mis pedidos" por atribución de teléfono |
| 5 | `server/routes/account.ts` | `/api/account` (otp, verify, me, orders, codes) |
| 6 | `server/services/loyalty.ts` | Contador de compras entregadas, código cada 3, ciclo de vida del código |
| 7 | `server/routes/discount-codes.ts` | Validar y canjear códigos de lealtad y de campaña |
| 8 | `server/services/crm.ts` | Panel de intención ("a quién llamar hoy") sobre `analytics_events` |
| 9 | `frontend/routes/mi-cuenta.*.tsx` | Login OTP, resumen, mis pedidos, mis códigos |
| 10 | `frontend/routes/admin.crm.{clientes,campanas}.tsx` | Panel de intención y gestión de campañas |

> **La separación que no hay que romper:** un comprador se resuelve a `contacts`, **nunca** a un
> `AppRole` del staff. Son dos sistemas de identidad distintos que comparten `auth.users`.

---

## Reglas transversales

Siguen vigentes. Son el acuerdo de trabajo, no una fase:

1. **La tabla antes que la ruta.** Ninguna ruta usa una tabla que no esté en una migración aplicada.
2. **El servicio antes que la ruta.** La ruta es fina; la lógica vive en `services/`.
3. **El schema Zod antes que el handler.** Se valida en el borde, siempre.
4. **Nada del cliente toca la base.** Si tienta, es señal de que falta un endpoint.
5. **Un archivo por commit** cuando se pueda; el mensaje dice qué dominio toca.
6. **Si el código y el doc discrepan, se actualiza el doc en el mismo commit.**
