# 08 · Deuda técnica y plan de reconstrucción — Gyro Store v2

> 📌 **NECESITA REVISIÓN.** Este documento es anterior a la mayor parte del código: su "plan de
> reconstrucción" ya se ejecutó y buena parte de las deudas que lista se resolvieron en el camino
> (por ejemplo, §46 pedía sacar `.obsidian/` y `.claude/` del repo — hecho). No lo tomes como lista
> de pendientes sin cotejar cada ítem contra `App/`. Merece una pasada para separar lo cerrado de lo
> que sigue abierto.

> El review del sistema viejo dejó claro algo importante: **el núcleo de v1 estaba bien** (deny-all,
> Admin SDK, FIFO transaccional, Zod compartido, handler central). El rebuild **no es para arreglar
> arquitectura rota**, es para **pulir, unificar y migrar a Supabase**. Y con esa migración,
> **varias deudas se resuelven solas**. Este documento refleja eso.

---

## 1. Deudas de v1 y qué pasa con ellas en v2

| # | Ítem (v1) | Estado en v2 | Por qué |
|---|---|---|---|
| D1 | Reglas de acceso a la base | ✅ **Resuelto** | RLS deny-all versionada en migraciones SQL |
| D2 | Custom claims / dónde vive el rol | ✅ **Decidido** | Lectura de `profiles` por request (barata en SQL), efecto inmediato. Opción de JWT hook a futuro (doc 03 §A.5) |
| D3 | Race conditions de stock | ✅ **Resuelto y mejorado** | Transacción SQL + `SELECT FOR UPDATE`; más simple que `runTransaction` |
| D4 | Edición de venta no era una sola transacción | ✅ **Resuelto** | En Postgres el liberar→re-reservar entra en **una** transacción |
| D5 | Validación de input | ✅ **Se mantiene** | Zod compartido `shared/schemas.ts` + `fileFilter` |
| D6 | Manejo de errores | ✅ **Se mantiene + mejora** | Handler central + mapeo de errores de Postgres |
| D7 | Fuga de costos en DTO | ✅ **Se mantiene + más fácil** | `publicItems` / `SELECT` sin columnas de costo |
| D8 | Límites de Spark / cachear todo | ✅ **Desaparece** | Postgres no tiene ese límite; el caché pasa a opcional |
| D9 | Agregados de reportes en memoria | ✅ **Resuelto** | SQL / vistas / materialized views |
| D10 | Lecturas `in` por lotes de ≤10 (Firestore) | ✅ **Desaparece** | En SQL es un `JOIN` normal |

**Conclusión:** la migración a Supabase no solo cambia de proveedor — **borra la mitad de la deuda
técnica** que arrastraba, porque muchas eran limitaciones de Firestore/Spark, no del diseño.

## 2. Deuda REAL que queda en v2

| # | Ítem | Prioridad |
|---|---|---|
| R1 | **Índices y `EXPLAIN`** de listados grandes (inventory, sales) al crecer el volumen | Media (al crecer) |
| R2 | Decidir qué reportes pesados van a **materialized view** | Baja (medir primero) |
| R3 | **Borrado R2 no transaccional** con la base (huérfano posible, queda en log + cron de limpieza) | Baja |
| R4 | **`created_at` real en productos** para "Lo Más Nuevo" | Baja |
| R5 | **Marcas/logos reales** en `/public/brands` (hoy placeholder) | Baja |
| R6 | **Sombras deprecadas** (`shadow-accent-*`) fuera del storefront | Baja |
| R7 | **CRM** — dirección ya definida (doc 10); falta afinar FAQ del bot, plantillas, pipeline y LTV | Media |

## 3. Deuda de "acumulación" que el rebuild limpia

- **`followups` + `contacts` coexistían** (migración a medias en v1). → En v2 lo resuelvo dentro de la
  decisión de CRM (§4), no arrastro las dos formas sin criterio.
- **Muchos seeds sueltos** (`seedTemplate*` por producto). → Un seeder parametrizable + `02_seed.sql`.
- **Backend JS/CommonJS vs Frontend TS.** → ✅ **Resuelto:** todo TypeScript + ESM en v2.
- **`.obsidian/` y `.claude/` en el repo** — ruido. → Al repo nuevo solo lo esencial.
- **Config web de Firebase hardcodeada** como fallback. → Desaparece con Firebase; la config de
  Supabase viene solo de env.

---

## 4. Decisiones — estado actualizado

**Cerradas para v2:**
- [x] **Base de datos:** Supabase (Postgres). Data vieja se descarta (eran pruebas).
- [x] **Seguridad:** servidor manda (`service_role` + RLS deny-all).
- [x] **Auth:** solo Microsoft Entra `@gyrostorenic.com`.
- [x] **Backend:** TypeScript + ESM (unificado con el front).
- [x] **Imágenes:** Cloudflare R2 (se mantiene).
- [x] **Email:** Microsoft 365.
- [x] **Ambientes:** dos proyectos Supabase (dev / prod).
- [x] **UI:** shadcn/ui sobre tokens de `DESIGN.md`.
- [x] **Dónde vive el rol:** lectura de `profiles` por request (efecto inmediato).

**Cerradas (cont.):**
- [x] **CRM:** nativo + **WhatsApp Cloud API** (Meta), **sin n8n al inicio** (webhook directo a
      Express), número dedicado, plan por fases. Detalle en doc 10.
- [x] **Lógica financiera:** costeo, Costo F/U escalonado, **7 pozos** (25/7/5/8/40/5/10), PVP con
      márgenes escalonados, cadena de comisión (salary 20% + escala) y mayoreo. Valores reales del
      Excel, editables desde `app_config`, congelados al aprobar. Detalle en doc 11.
- [x] **Config negocio:** las tablas financieras van **editables desde `app_config`** (doc 11 §9).

**Decisiones cerradas en la revisión de arquitectura:**
- [x] **CRM — detalle fino:** FAQ del bot y plantillas resueltas en doc 10.
- [x] **Comisiones y Mayoreo:** Mayoreo definido (2.5% para >=2, 5% para >=3, 10% para >=6, 15% para >=12 + advertencia).
- [x] **Inventario migrado:** Queda ignorado/fuera del alcance por el momento.
- [x] **Pasarela de pago:** Confirmado que sigue **fuera** (checkout WhatsApp, ADR-004).

**Cuentas de comprador y lealtad — DECIDIDO, entra en v2 (doc 14):** hasta acá vivía implícitamente
"fuera" (doc 01 §4.2 lo tenía como excluido); pasa a **dentro de alcance**, como capa opcional:
- [x] **WhatsApp Opción A:** el número de la tienda migra a la Cloud API de Meta; los vendedores
      responden desde el inbox del panel (reemplaza la idea de "número nuevo dedicado" del doc 10 §7).
- [x] **Definición de "compra" para lealtad:** solo cuenta cuando el pedido fue **entregado**.
- [x] **Auth del comprador:** OTP por teléfono + correo opcional, **teléfono siempre obligatorio**.
      Audiencia separada del staff (`requireCustomer`, nunca `AppRole`).
- [x] **"Unresponsive"** es un estado del CRM (etapa/tag), no un borrado. Borrado real = soft-delete,
      solo si el cliente lo pide.
- [x] **Códigos de campaña** por canal, públicos, con tope y vencimiento; validación de "seguidor" es
      manual (screenshot → staff valida → código por WhatsApp).
- [x] **Pagos online (BAC):** sigue fuera de alcance; el diseño deja la puerta abierta (la orden es el
      objeto central, un pago sería un evento pegado a ella).

---

## 5. Principios de la reconstrucción (no negociables)
1. **La documentación manda.** Se codea contra estos docs; divergencia → se actualiza el doc en el mismo commit.
2. **Conservar lo que ya está bien** (es la mayoría): deny-all, todo por el servidor, FIFO
   transaccional, Zod compartido, handler central, R2+Sharp+hash, máquinas de estado.
3. **Aprovechar Postgres:** transacciones, FKs, `CHECK`, `enum`, sequences, SQL para reportes.
4. **Quitar acumulación**, no reescribir arquitectura probada.
5. **Commits pequeños, un dominio a la vez, un archivo a la vez** (ver doc 09).

## 6. Estrategia de repo y migración
1. **Repo nuevo, historia limpia** (`git init` fresco). No arrastrar `.git` viejo ni `.obsidian/`.
2. **Traer y depurar de v1:** `render.yaml`, `.env.example` (con las vars nuevas), `DESIGN.md`,
   `PRODUCT.md`, `shared/schemas` (a `.ts`), `server/` (portado a TS + Supabase), `frontend/app/`
   (con shadcn/ui). El código viejo es **referencia y esqueleto**; se reescribe lo justo.
3. **Nuevo en v2:** carpeta `supabase/` con migraciones SQL, `server/supabase.ts`, config de Entra.
4. **Higiene de secretos:** `.env` real nunca al git; `service_role`, `AZURE_CLIENT_SECRET` y keys de
   R2 son críticas.

---

## 7. Roadmap del rebuild

Como el núcleo ya funciona y la migración simplifica varias cosas, esto es más **portar + migrar +
pulir** que **construir**. El detalle archivo-por-archivo está en el **doc 09**.

### Hito 0 — Fundación limpia
Repo + `docs/` + `.env.example` + `render.yaml`. **Proyecto Supabase (dev) + migración inicial (schema
base + RLS deny-all).** Portar `config`, `supabase.ts`, middleware (`auth` con Entra, `rateLimiter`),
utils, `shared/schemas.ts`. Verde `/api/health`.

### Hito 1 — Storefront (lo crítico para abrir)
Catálogo, templates, combos, PDP, checkout WhatsApp (`public_orders` con recálculo), contacto →
`contacts`. Diseño según DESIGN.md. Cerrar R4/R5/R6.

### Hito 2 — Inventario y catálogo admin
`purchases` (FIFO con TX SQL), `products`, `migrated_inventory`, modo edición del catálogo (dnd-kit,
CRUD, imágenes vía Sharp+R2, promo). Máquina de estados del lote (`enum`).

### Hito 3 — Ventas y facturación
`orders` (+ `order_items`, reservas en `stock_reservations`), comisiones (escala progresiva — documentar tramos),
pagos por semana, `invoices` (POS 80mm, sequence para numerar, 1 ticket=1 uso), `installments`,
`audit_logs`.

### Hito 4 — Reportes, gastos, logística, CRM
`reports` (KPIs con SQL, `losses`, gastos con pozos, export), `logistics_shipments` (+ eventos,
email M365), **CRM base (doc 10, Fase CRM-A: tablas + Ficha 360 + agenda, sin Meta todavía)**,
`feedback`, telemetría. Cron de limpieza. WhatsApp/bot (CRM-B/C) puede ir en paralelo o post-lanzamiento.

### Hito 5 — Polish y QA de lanzamiento
Seeder parametrizable, auditoría a11y/perf móvil, checklist Render, verificación de secretos, endurecer
COOP si el login de Entra usa redirect.

### Hito 6 — Cuentas de Comprador y Lealtad [doc 14, transversal — no bloquea el lanzamiento]
Auth de comprador (OTP, `requireCustomer`, `contacts.auth_user_id`), tarjeta de sellos, extensión de
`discount_codes` (campaña + lealtad), estados de pedido de cara al cliente, panel de intención admin,
front de "mi cuenta". Encaja **post-lanzamiento** o en paralelo si hay ancho de banda — el desglose
archivo-por-archivo está en el doc 09. Explícitamente **no** es requisito de "listo para lanzar" (§8).

---

## 8. Definición de "listo para lanzar"
- [ ] Storefront completo, rápido en móvil, catálogo real con fotos WebP optimizadas.
- [ ] Checkout WhatsApp con recálculo de total en servidor.
- [ ] Núcleo seguro portado (RLS deny-all, `service_role`, FIFO transaccional SQL, Zod, handler central).
- [ ] Login del staff con Entra funcionando end-to-end.
- [ ] Admin con **catálogo editable + inventario + ventas** para operar el día a día.
- [ ] Sin fuga de costos (verificado en los `SELECT`/DTOs).
- [ ] Secretos fuera de git; `/api/health` verde en Render (prod) con el Supabase de prod.

Reportes finos, logística, cuotas y el CRM "interesante" pueden iterarse post-lanzamiento sin bloquear
la apertura.

---

## 9. Deuda técnica pendiente del frontend

Lo que es de diseño está en DESIGN.md, en «Pendiente en el código». Acá queda el resto:

- **Paginación en servidor.** `DataTable` pagina en cliente sobre el dataset completo: el navegador
  descarga todo el histórico para mostrar 25 filas. Es la deuda de rendimiento más grande del panel
  (ventas, facturación, inventario histórico). Ruta: `limit`/`cursor` en los endpoints +
  `manualPagination` en TanStack.
- **Prefetch de datos en hover** del nav: los `NavLink` ya precargan el código de la ruta
  (`prefetch="intent"`), pero no los datos con `api.util.prefetch`.
- **Periodo global en el topbar.** Solo Reportería e Inventario filtran por rango; `getSales`, caja y
  facturación no aceptan fechas ni en el front ni en sus endpoints. Primero agregar el filtro de
  fechas a esos módulos (backend incluido) y después subir el selector.
- **`<Delta>` fuera del dashboard.** Solo `get_financial_kpis` devuelve el periodo anterior.
  `InventoryKpis`, `SellerPerformance`, `SalesBreakdownCards` y los KPIs de caja necesitan la
  misma doble ventana en sus RPCs.
- **`fetching` de `QueryState`** (datos viejos atenuados durante un refetch) solo está en
  `admin.ventas`. Falta en inventario, facturación, cuotas y caja.
- **Búsqueda en vivo en la paleta ⌘K.** Requiere `GET /api/search?q=` con recorte por rol (máx. 5
  resultados por tipo: factura, cliente, producto, vendedor). No existe.
- **Medición de bundle y Lighthouse.** Falta `npm run analyze` (`rollup-plugin-visualizer`) y los
  números base de LCP/TBT/CLS.
- **Rutas gordas.** `admin.usuarios.tsx` y `admin.configuracion.tsx` siguen siendo monolitos. El
  objetivo es que ninguna ruta pase de ~250 líneas, extrayendo a `components/admin/<modulo>/`.
- **`ModuleLoader`** (`components/ui/module-loader.tsx`) quedó exportado sin consumidores;
  `BrandLoader`, del mismo archivo, sí se usa.
