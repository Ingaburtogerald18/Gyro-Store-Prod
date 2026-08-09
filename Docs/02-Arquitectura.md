# 02 · Arquitectura — Gyro Store

> Cómo está armado el sistema, por qué, y qué patrones me obligo a respetar en todo el código.
> **La arquitectura de v1 era buena y la conservo casi entera; lo que cambia es el motor de datos
> y de auth: Firebase → Supabase.** El principio "todo pasa por el servidor" queda intacto.

---

## 1. Vista de 10.000 pies

Gyro Store es un **monolito híbrido**: un único servicio Node/Express (ahora en **TypeScript + ESM**)
que expone la API REST **y** sirve el frontend Remix ya buildeado. Se despliega como **un solo Web
Service en Render**. [CONFIRMADO — se mantiene de v1]

```
                    ┌─────────────────────────────────────────────┐
   Navegador        │              RENDER (1 Web Service)          │
  (móvil/desktop)   │                                             │
        │           │   ┌──────────────┐   sirve build   ┌──────┐ │
        │  HTTPS     │   │   Express    │ ───────────────▶│Remix │ │
        ├───────────▶│   │  (TS / ESM)  │                 │build │ │
        │            │   │              │  /api/* (REST)  └──────┘ │
        │            │   │ service_role │◀─────────────────────────┤
        │            │   └──────┬───────┘                          │
        │            └──────────┼──────────────────────────────────┘
        │                       │
        │ (solo login staff)    │ service_role (privilegios servidor, ignora RLS)
        ▼                       ▼
  ┌───────────┐          ┌──────────────┐   ┌───────────┐   ┌──────────┐
  │  Supabase │          │  Supabase    │   │Cloudflare │   │Microsoft │
  │   Auth    │          │  Postgres    │   │    R2     │   │   365    │
  │(Entra ID) │          │  (datos+RLS) │   │(imágenes) │   │ (email)  │
  └───────────┘          └──────────────┘   └───────────┘   └──────────┘
```

### Decisión arquitectónica central [se conserva de v1, reimplementada en Supabase]
**El navegador nunca lee ni escribe la base de datos.** Solo usa **Supabase Auth** (con Microsoft
Entra como proveedor) para obtener un JWT. Ese token viaja al backend Express, que lo valida y hace
**toda** la operación de datos con la **`service_role key`** de Supabase. Las **RLS de Postgres
quedan en deny-all**.

**Por qué:** cualquier miembro del staff logueado tiene un JWT válido; si dejara RLS abiertas,
alguien podría abrir el cliente de Supabase por fuera de la app y leer costos/utilidades o escribir
stock. El deny-all cierra esa puerta; la `service_role` **ignora las RLS** (igual que antes el Admin
SDK ignoraba las security rules), así que el servidor no se ve afectado. → **Toda la lógica y la
autorización viven en el servidor.** Es exactamente el modelo de v1, traducido a Supabase. [v2]

> **Nota de equivalencias mentales:** `Admin SDK` → `service_role key`; `security rules` → `RLS
> policies`; `ID token de Firebase` → `JWT de Supabase`; `Firestore` → `Postgres`. Si venís de la
> v1, con este mapa entendés casi todo.

### 1.1 Dos audiencias de auth, una sola regla de seguridad [v2 · doc 14]
Con el dominio de cuentas de comprador (doc 14) hay ahora **dos audiencias** que se autentican, y
conviene dejarlo claro acá porque es arquitectura, no solo dato:

- **Staff** — Microsoft Entra ID, resuelve a `AppRole` (`requireRole`, doc 03 §A.4). Sin cambios.
- **Comprador** — OTP por teléfono vía Supabase Auth, resuelve a un **contacto**
  (`requireCustomer`, doc 14 §4), nunca a un `AppRole`.

La regla que no cambia para ninguna de las dos: **el navegador nunca lee ni escribe la base
directo**, tenga o no un JWT válido. El comprador logueado consulta "mis pedidos"/"mis códigos" igual
que el staff consulta el admin — por Express, con `service_role`, contra tablas en **RLS deny-all**.
Lo único que cambia entre audiencias es a qué middleware llega el request y a qué identidad se
resuelve el JWT; el patrón de fondo (servidor manda) es el mismo para las dos.

---

## 2. Stack técnico [v2]

### Backend
| Área | Tecnología | Nota |
|---|---|---|
| Runtime | Node.js ≥ 20.19 | igual que v1 |
| Lenguaje | **TypeScript + ESM** | [v2] antes era JS/CommonJS |
| Framework | Express | se mantiene |
| Datos | **`@supabase/supabase-js`** (con `service_role`) sobre **Postgres** | [v2] antes Firebase Admin/Firestore |
| Auth (verificación) | Supabase Auth — verificación de JWT en el server | [v2] |
| Validación | **Zod** | se mantiene (contrato compartido front/back) |
| Imágenes | `@aws-sdk/client-s3` (→ R2) + `sharp` | se mantiene |
| Seguridad HTTP | helmet, cors, express-rate-limit | se mantiene |
| Utilidades | compression, morgan, multer, dotenv | se mantiene |
| Email | **Microsoft 365** (Graph API o SMTP del tenant) | [v2] antes Gmail SMTP |
| Cron | node-cron | se mantiene |

### Frontend [se mantiene de v1, + shadcn/ui]
Remix (React, **TypeScript**) · Tailwind CSS **v4** · **shadcn/ui** (nuevo) · Redux Toolkit + RTK
Query · Framer Motion · Lucide · TanStack Table · React Hook Form + Zod · dnd-kit · Recharts · Sonner.

> **Ya no hay asimetría de lenguajes:** en v1 el backend era JS/CommonJS y el frontend TS. En v2
> **todo es TypeScript**, lo que me deja compartir tipos y schemas Zod de punta a punta. [v2]

### Infra
Supabase (Auth + Postgres) · Microsoft Entra ID (identidad del staff) · Cloudflare R2 (imágenes) ·
Render (hosting) · Microsoft 365 (email).

---

## 3. Estructura de carpetas [PROPUESTO para v2]

```
gyro-store/
├── frontend/                 # App Remix (TypeScript)
│   ├── app/
│   │   ├── routes/           # rutas (storefront + /admin)
│   │   ├── components/       # UI — shadcn/ui pintado con tokens (ver DESIGN.md)
│   │   ├── components/ui/    # primitivas de shadcn/ui (generadas por el CLI)
│   │   ├── store/            # Redux Toolkit + RTK Query
│   │   ├── lib/              # supabase.client.ts (solo Auth), helpers
│   │   └── hooks/            # useTheme, etc.
│   ├── public/               # estáticos (brands/, mascota)
│   └── package.json
│
├── server/                   # API Express (TypeScript / ESM)
│   ├── index.ts              # entry: monta Express + sirve Remix build
│   ├── supabase.ts           # init cliente service_role, exporta { db, auth } [v2]
│   ├── routes/               # auth, config, catalog, inventory, sales, ... (por dominio)
│   ├── middleware/           # auth (requireRole), rate limiting
│   ├── services/             # email (M365), storage (R2), ...
│   └── utils/                # asyncHandler, sanitize, validators (Zod)
│
├── shared/                   # schemas.ts (Zod) — contrato único front/back [v2: .ts]
├── supabase/
│   ├── migrations/           # migraciones SQL versionadas [v2]
│   └── seed.sql              # data de arranque para dev [v2]
├── scripts/                  # seed de admin/plantillas
├── render.yaml               # infra as code [se mantiene]
├── .env.example              # plantilla de entorno [se mantiene, con vars nuevas]
└── package.json              # backend (root)
```

> **Cambios de estructura respecto a v1:** desaparecen `firestore.rules`, `firestore.indexes.json`,
> `firebase.json`, `.firebaserc` y `server/firebase.js`. Aparecen `server/supabase.ts` y la carpeta
> `supabase/` con **migraciones SQL versionadas** (el schema de la base vive en git). [v2]

---

## 4. Flujo de datos (request lifecycle)

### 4.1 Lectura pública del catálogo (storefront)
```
Navegador ──GET /api/catalog──▶ Express
                                  │  (sin auth: el catálogo es público)
                                  ├─ valida query (Zod)
                                  ├─ db.from('catalog_items').select(...)  (service_role)
                                  └─ responde JSON  ──▶ Remix loader / RTK Query ──▶ UI
```

### 4.2 Operación autenticada (back-office)
```
Login (Supabase Auth + Entra en el navegador) ──▶ JWT
        │
Navegador ──Authorization: Bearer <JWT>──▶ Express
                                            ├─ verifica el JWT (Supabase)
                                            ├─ resuelve rol (tabla profiles / claim en JWT / whitelist env)
                                            ├─ requireRole('admin'|'seller'|...)
                                            ├─ valida body (Zod)
                                            ├─ ejecuta (TRANSACCIÓN Postgres si toca stock)
                                            └─ responde JSON
```

### 4.3 Subida de imagen de producto (sin cambios respecto a v1)
```
Admin ──multipart──▶ Express (multer) ──▶ sharp (optimiza/redimensiona a WebP)
                                            └─▶ PutObject a R2 (S3 SDK), nombre por hash
                                                 └─▶ guarda la URL pública (R2_PUBLIC_URL) en Postgres
```

---

## 5. Patrones transversales (obligatorios en todo el código)

### 5.1 Todo dato pasa por el servidor [se mantiene]
Ningún componente del frontend habla con Postgres directo. El frontend solo conoce **endpoints REST**
y **Supabase Auth**. Regla dura, es la base de la seguridad.

### 5.2 Validación en el borde con Zod [se mantiene]
Todo input que entra al backend (body, params, query) se valida con un **schema Zod** antes de tocar
la base. Si no valida → `400` con detalle. En v2 el schema Zod se comparte con el front desde
`shared/schemas.ts`.

### 5.3 Manejo de errores estándar [se mantiene]
Un único `asyncHandler` envuelve cada handler async y un **error handler central** traduce errores a
respuestas consistentes:
```
{ "error": { "code": "STRING_MACHINE", "message": "humano", "details": {...} } }
```
Nada de `try/catch` copiado en cada ruta. Los errores de Postgres (violación de FK, de `CHECK`, de
`unique`) se mapean a códigos legibles en este handler. [v2]

### 5.4 Autorización solo del lado servidor [se mantiene]
`requireRole(...)` en el backend es la verdad. El `<RequireRole>` del frontend es solo UX (ocultar
botones); nunca es la barrera de seguridad.

### 5.5 Concurrencia de inventario con transacciones [MEJORA que ahora es nativa]
En v1 esto lo resolvía con `runTransaction` de Firestore. En v2 es **una transacción de Postgres**
con bloqueo de fila (`SELECT ... FOR UPDATE`) o funciones SQL (`plpgsql`) que hacen el decremento
FIFO atómico. **Es más simple y más fuerte que antes.** Regla: ninguna lectura-modificación-escritura
de stock sin transacción. [v2]

### 5.6 Idempotencia y estados explícitos [se mantiene, reforzado por la base]
Los flujos con máquina de estados (inventario `china→pending→received`, ventas, logística) guardan
el estado como **`enum` de Postgres** y solo permiten transiciones válidas, validadas en el servidor.
Ahora la base misma ayuda: los estados son tipos `enum`, las relaciones son **FKs reales**, y hay
**`CHECK constraints`** para invariantes (ej. `quantity_sold + quantity_reserved <= quantity`). [v2]

### 5.7 El schema vive en git [v2 nuevo]
Cada cambio de estructura de la base es una **migración SQL versionada** en `supabase/migrations/`.
Nunca toco la base a mano en producción; primero la migración, la pruebo en el proyecto de dev, y
recién ahí la aplico en prod. Esto no existía en Firestore (schemaless).

---

## 6. Límites del sistema y dependencias externas

| Dependencia | Rol | Falla si… | Mitigación v2 |
|---|---|---|---|
| Supabase Auth (Entra) | login del staff | cae → nadie entra a `/admin` | el storefront público sigue vivo (no requiere auth) |
| Supabase Postgres | toda la data | cae → API 5xx | health check + página de estado; catálogo cacheable |
| Cloudflare R2 | imágenes | cae → sin fotos | las fotos son URLs; placeholder/`onError` |
| Render | hosting | cold start / caída | health check `/api/health` |
| Microsoft 365 | emails de logística/invitación | cae → sin email | encolar/reintentar; no bloquear la operación |

---

## 7. Decisiones de arquitectura (ADRs)

> La v1 tenía 10 ADRs formales. Acá los repaso y marco cuáles conservo tal cual y cuáles cambian con
> la migración a Supabase. Esta tabla es mi referencia rápida.

| ADR (v1) | Decisión original | Estado en v2 |
|---|---|---|
| 001 | Monolito Express que sirve API + Remix en Render | **MANTENER** |
| 002 | Firestore (Spark) + Admin SDK | **REEMPLAZADO → Supabase Postgres + service_role.** Desaparece el problema de límites de Spark. [v2] |
| 003 | Cliente nunca toca la base; todo por el backend | **MANTENER (base de todo)** — ahora con RLS deny-all + service_role |
| 004 | Checkout manual por WhatsApp (sin pasarela) | MANTENER (reversible) |
| 005 | Cloudflare R2 + Sharp (WebP) + nombre por hash | **MANTENER** |
| 006 | Roles resueltos por request (sin custom claims) | **MANTENER, mejorado.** En Postgres la lectura de `profiles` por request es barata; opción de meter el rol en el JWT con un *access token hook* de Supabase (doc 03 §A.5) |
| 007 | Reservar→consumir stock con transacciones (FIFO atómico) | **MANTENER (excelente)** — ahora con transacciones SQL, más simple |
| 008 | Reglas deny-all versionadas | **MANTENER → RLS deny-all** + migraciones SQL en git |
| 009 | Limpieza de imágenes huérfanas en R2 al borrar | MANTENER |
| 010 | Zod + `fileFilter` en subidas | **MANTENER** |
| 011 | *(nuevo v2)* Cuentas de comprador: audiencia separada, backend-mediated | **NUEVO.** OTP por teléfono vía Supabase Auth, resuelve a contacto (`requireCustomer`), nunca a `AppRole`. El navegador del comprador tampoco toca la base — mismo patrón deny-all + `service_role` que el resto del sistema. Opcional, capa de lealtad, nunca requisito para comprar. Detalle: doc 14. [v2] |

**Decisiones nuevas de v2 (ADRs a escribir):** backend TypeScript+ESM; auth con Microsoft Entra vía
Supabase; email por Microsoft 365; dos proyectos Supabase (dev/prod); migraciones SQL versionadas;
cuentas de comprador (ADR-011, doc 14).

> **Nota — Opción A de WhatsApp (doc 10 §2, §7):** el número de la tienda migra a la Cloud API de
> Meta. Esto cambia cómo operan los vendedores: ya no responden desde la app normal de WhatsApp en su
> teléfono, sino desde el **inbox del panel admin** (`/admin/crm`). Es un cambio operativo, no de
> arquitectura de datos — el patrón "todo por el servidor" no cambia.

### Detalles de arquitectura que no quiero perder en el rebuild
- **Caché de catálogo en memoria** (`catalogCache`): en v1 era **obligatorio** por los límites de
  lectura de Spark. En v2 con Postgres pasa a ser **opcional** (optimización, no necesidad). Si lo
  dejo, invalida al escribir; si no, Postgres aguanta el query directo. [v2]
- **COOP relajado** (`same-origin-allow-popups`) en helmet — lo necesitaba para el `signInWithPopup`
  de Firebase. **Verificar si el flujo de Supabase + Entra lo sigue necesitando** (Supabase suele usar
  redirect en vez de popup; si es redirect, puedo endurecer el COOP). [v2 · a verificar]
- **`trust proxy = 1`** — imprescindible tras el proxy de Render (rate-limit e IPs correctas). Se mantiene.
- **Checkout público** recalcula el total en el servidor (`public_orders`), nunca confía en el cliente. Se mantiene.
