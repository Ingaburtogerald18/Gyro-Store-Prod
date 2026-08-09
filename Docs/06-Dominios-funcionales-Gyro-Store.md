# 06 · Dominios funcionales — Gyro Store

> Las **8 fases** del sistema, cada una como un dominio. Los flujos de negocio **no cambian** con v2;
> lo que cambia es cómo se implementan por debajo (transacciones SQL, auth Entra, email M365). Marco
> con `[v2]` solo lo que cambia de mecánica.

---

## Fase 1 · Fundación
Scaffolding, autenticación con **Microsoft Entra** [v2], layouts base (storefront + admin).

**Entregables v2:**
- Monolito Express (TS/ESM) + Remix corriendo con `npm run dev` (concurrently).
- Auth end-to-end: login con Entra vía Supabase → verificación de JWT en el servidor → resolución de rol.
- Dos pieles de layout (store / admin) con theming y **shadcn/ui** pintado con tokens.
- Middleware base: `requireAuth`, `requireRole`, `validate`, `asyncHandler`, `errorHandler`.
- **Migración SQL inicial** con el schema base y RLS deny-all aplicada. [v2]

---

## Fase 2 · Catálogo público
Grid con filtros/búsqueda, detalle (PDP), carrito + checkout WhatsApp, contacto.

**Flujo del comprador:**
```
Home ──▶ filtra/busca ──▶ PDP (variantes, precio, fotos) ──▶ Agregar al carrito (local)
                                                               └──▶ Carrito ──▶ "Pedir por WhatsApp"
                                                                        (arma mensaje con items + total)
```
- Carrito **local**, sin backend. El botón WhatsApp abre `wa.me/<WHATSAPP_NUMBER>` con el mensaje
  pre-armado.
- Contacto captura lead → `contacts` (CRM).
- **Regla:** el catálogo público consume **DTO recortado** (sin costos).
- El catálogo se consulta directo a Postgres (índices por `published`/`sort_order`); caché opcional. [v2]

---

## Fase 3 · Inventario
Compras a China, flujo `china → pending → received`, KPIs, inventario actual.

**Máquina de estados de compra:**
```
[china] ──(en tránsito)──▶ [pending] ──(recibido en bodega)──▶ [received]
                                                                   │
                                       incrementa stock (TRANSACCIÓN SQL) [v2]
```
- El estado es un `enum` de Postgres; solo transiciones válidas, validadas en el servidor.
- KPIs: unidades en tránsito, valor de inventario, productos bajo mínimo.
- **Invariante:** el stock solo cambia por eventos (compra recibida ↑, venta aprobada ↓), nunca por
  edición manual libre (o si se permite, queda auditado). Reforzado por `CHECK` en la base. [v2]
- **Costeo automático:** al registrar/recibir la compra, el sistema calcula costo real (USD y C$ con
  tasa **congelada**), Costo F/U escalonado, los 7 pozos y el Coste final. Toda la fórmula: **doc 11**.

---

## Fase 4 · Ventas
Cotizador en vivo, comisiones (escala progresiva), aprobación FIFO, pago semanal.

**Flujo:**
```
Seller: cotizador en vivo (items + precio) ──▶ registra venta [pending_approval] → reserva stock (TX)
Admin:  aprueba en orden FIFO ──▶ [approved] + decremento de stock ATÓMICO (TX SQL) [v2]
Sistema: calcula comisión por ESCALA PROGRESIVA
Admin:  liquidación SEMANAL ──▶ [paid]
```
- **Toda la matemática (utilidad bruta → salary 20% → utilidad neta → comisión → ganancia tienda),
  la escala de comisión y el mayoreo están en el doc 11** (costeo/comisión = valores del Excel;
  mayoreo = reglas finales revisadas). Se **congela al aprobar** (snapshot en `order_items`).
- **Aprobación FIFO:** se aprueban en orden de llegada; el primero en la cola gana el stock. Ligado a
  la transacción SQL (`SELECT ... FOR UPDATE` sobre los lotes por `purchase_date`).
- **Pago semanal:** corte semanal de comisiones aprobadas (por `week_of`, semana ISO).
- **Cotizador con mayoreo:** descuentos por volumen (≥2 2.5%, ≥3 5%, ≥6 10%, ≥12 15% + alerta) — doc 11 §5.

---

## Fase 5 · Facturación
Tickets POS 80mm (react-to-print), vinculación ticket ↔ venta.

- Ticket de **80mm** imprimible con `react-to-print`.
- Cada ticket referencia su `sale_id` (1:1 con la venta), vinculación en **transacción** → 1 ticket = 1 uso.
- **Numeración correlativa** con una **`sequence` de Postgres** (`0001`, `0002`…), reimpresión, datos
  del negocio en el encabezado. [v2 — antes colección `counters`]

---

## Fase 6 · Reportes
KPIs, gráficos Recharts, pérdidas, exportación Excel/PDF.

- Dashboard con KPIs (ventas, utilidad, pérdidas) y gráficos Recharts.
- Exportación **Excel/PDF**.
- **[v2] Agregados con SQL:** los KPIs salen de queries/vistas de Postgres, no de recorrer
  colecciones en memoria. Decido si algún reporte pesado va a **materialized view** para performance.
- **Reporte financiero (doc 11 §8):** por vendedor (ventas, unidades, vendido, coste, comisión,
  ganancia tienda), **Salary acumulado** (fondo empresa) y **los 7 pozos recogidos**. Todo desde SQL
  sobre los snapshots de `order_items`, sin planillas.

---

## Fase 7 · Usuarios + Logística

### Usuarios
- CRUD con **papelera de 30 días** (soft-delete vía `deleted_at` + cron de purga). [v2]
- **Invitación por email** (link con `APP_URL`), enviada desde **Microsoft 365**. [v2]
- `PROTECTED_ADMIN_EMAIL` no se puede degradar/borrar.
- El rol se resuelve por request desde `profiles` (efecto inmediato). Opción futura: rol en el JWT
  vía access token hook de Supabase (ver doc 03 §A.5).

### Gyro Logistics
- Gestión de envíos con **timeline** de estados (`logistics_events`, tabla hija) y **emails** de
  notificación por M365. [v2]
- Roles `logistics_admin` (gestiona) y `logistics_customer` (sigue su envío).

---

## Fase 8 · Polish
Modo edición del catálogo (drag & drop, CRUD de productos, imágenes, promo), cron de limpieza.

- **Modo edición del catálogo:** reordenar con **dnd-kit**, CRUD de productos, subir/gestionar
  imágenes (Sharp + R2), marcar promos.
- **Cron de limpieza:** purga papelera 30 días (y lo que agregue). Limpieza de imágenes huérfanas en R2.

---

## Dominio transversal · CRM y automatización WhatsApp [DECIDIDO — detalle en doc 10]
- CRM **nativo** con **Ficha 360** (todos los pedidos y ventas de un cliente en una pantalla),
  **agenda de seguimientos** (kanban/lista de "a quién contactar hoy") y **bandeja de WhatsApp**.
- Integra la **WhatsApp Cloud API oficial de Meta**; el webhook pega **directo a Express** (sin n8n
  al inicio, por costo). Un **bot** responde dudas frecuentes y leads de ads/links, y hace **handover
  a humano** cuando no entiende. Cron diario dispara avisos salientes (ej. "llegó tu stock") con
  plantillas de Meta.
- **Tablas:** unifico en `contacts` (+ `contact_activities`), agrego `follow_ups`,
  `whatsapp_conversations`, `whatsapp_messages`; jubilo la vieja `followups`. Enlace `contact_id`/
  `phone` en `orders`/`public_orders` para la Ficha 360.
- **Costo:** ~$0/mes al inicio (mensajes entrantes gratis dentro de 24h; solo pago plantillas
  salientes puntuales). **Opción A (doc 10 §2, §7):** el número de la tienda **migra** a la Cloud API
  — deja de usarse en la app normal de WhatsApp; los vendedores responden desde el **inbox del panel**.
- Pipeline por `stage` (nuevo → contactado → interesado → cerrado → **unresponsive**, doc 14 §11).
  [PROPUESTO — afinar]
- **Plan por fases:** primero base de datos + panel (sin Meta), después WhatsApp, después el bot.

---

## Dominio transversal · Cuentas de comprador y Lealtad [DECIDIDO — detalle en doc 14]
- Capa **opcional** de auto-servicio y retención sobre el mismo storefront público: nunca un requisito
  para comprar (regla de oro del doc 14 §1). El catálogo sigue 100% público, el cierre sigue por
  WhatsApp/contra-entrega.
- **Auth separada del staff:** OTP por teléfono (`requireCustomer`, resuelve a `contacts`, nunca a
  `AppRole`). El teléfono es la columna vertebral: une WhatsApp, pedido y cuenta.
- **Tarjeta de sellos:** cada 3 compras **entregadas** → código de lealtad único, atado a la cuenta,
  un solo uso, con vencimiento.
- **Cliente mayorista:** precio especial aprobado por admin (nunca auto-declarado), visible en la
  cuenta.
- **Panel de intención (admin):** contactos ordenados por "a quién llamar hoy", no por fecha.
- Este dominio es **transversal** (toca storefront, CRM y datos a la vez), igual que el CRM de arriba
  — no es una de las 8 fases originales ni bloquea el lanzamiento (doc 08 §8).

---

## Matriz dominio × rol (quién hace qué) [PROPUESTO — ajustar]

> El **comprador** (con o sin cuenta) no entra en esta matriz — no tiene `AppRole`, no es staff. Su
> acceso es aparte (`requireCustomer`, doc 14 §4) y se limita a lo suyo (mi cuenta, mis pedidos, mis
> códigos), nunca a un dominio administrativo de la tabla de abajo.

| Dominio | global_admin | admin | seller | cashier | logistics_admin | logistics_customer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Catálogo (edición) | ✅ | ✅ | — | — | — | — |
| Inventario | ✅ | ✅ | — | — | — | — |
| Ventas | ✅ | ✅ (aprueba) | ✅ (crea) | — | — | — |
| Facturación | ✅ | ✅ | — | ✅ | — | — |
| Reportes | ✅ | ✅ | ver propios | — | — | — |
| Usuarios | ✅ | ✅ | — | — | — | — |
| Logística | ✅ | ✅ | — | — | ✅ | ver el suyo |
| CRM | ✅ | ✅ | ✅ | — | — | — |

---

## ADENDA — Dominios reales que las "8 fases" no listaban [CONFIRMADO en v1]

### Combos (`/api/combos`, `combos`)
Paquetes con precio propio; se enriquecen en el checkout público.

### Órdenes públicas / checkout WhatsApp (`public_orders`)
El catálogo arma el pedido → `POST /api/orders/public` (sin auth) **recalcula el total en servidor** →
genera link de WhatsApp. Cierre y cobro manuales; luego se registra la venta real que descuenta stock.
(ADR-004.) Doble entrada posible (pedido público vs. venta) = trade-off aceptado.

### Cuotas / Installments (`installments` + `payments`)
Ventas fraccionadas: 2–24 cuotas, monto por cuota, fecha de primer pago, pagos parciales
(`efectivo`/`transferencia`/`tarjeta`), notas. Saldo y ajustes en `commission_adjustments`.

### Pérdidas (`losses`)
Categorías: `robo`, `dano`, `devolucion`, `regalias`. **Consumen costo FIFO** (por eso no se edita
producto/cantidad de una pérdida). Entran a reportes.

### Gastos operativos con "pozos" (`reports`/`app_config`)
Grupos budgeted (`publicidad`, `servicios`, `utiles`, `garantias`) con reserva mensual de costos
fijos; el gasto no baja la ganancia hasta superar su pozo. `varios` no tiene pozo. Ver doc 03 §B.6.

### Códigos de descuento (`/api/discount-codes`, `discount_codes`)
Códigos aplicables (validación y cálculo en servidor). **Ampliado en v2 (doc 14 §6, §10):** ahora
cubre dos tipos con trabajos distintos, sobre la misma tabla (`kind` los distingue):
- **Lealtad** — generado automático cada 3 compras entregadas, atado a una cuenta (`contact_id`), un
  solo uso, con vencimiento.
- **Campaña** — un código por canal (`TIKTOK10`, `IG10`...) para medir atribución, público, con tope
  y vencimiento. La validación de "seguidor" es **manual**: el cliente manda screenshot, el staff lo
  valida a mano y entrega el código por WhatsApp.
El **mayoreo** (descuento por volumen del cotizador, doc 11 §5) sigue siendo una regla de precio, no
un código de esta tabla.

### Auditoría (`audit_logs`)
Registra ediciones/eliminaciones de ventas: motivo, autor, montos antes/después. Obligatorio para
rechazo/eliminación.

### Feedback (`/api/feedback`, `feedback`)
Reportes de usuarios: `bug` | `idea` | `product`, con teléfono opcional.

### Telemetría (`/api/search-events`, `analytics_events`)
Eventos de búsqueda y "populares". `telemetryLimiter` solo en POST de escritura. En v2 los populares
y las búsquedas sin resultado salen con **SQL directo** sobre `analytics_events`. [v2]
