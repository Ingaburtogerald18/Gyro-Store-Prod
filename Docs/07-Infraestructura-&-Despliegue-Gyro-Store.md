# 07 · Infraestructura y despliegue — Gyro Store

> Entorno, variables, hosting, storage, build e imágenes. **Lo que más cambia en v2 son las variables
> de entorno:** salen las de Firebase, entran las de Supabase, Entra y Microsoft 365. El hosting
> (Render) y las imágenes (R2) se mantienen. Marcador `[v2]` = cambio de esta versión.

---

## 1. Topología de despliegue [se mantiene de v1]

Un único **Web Service en Render** (`render.yaml`):
- `runtime: node`, `plan: starter`, `region: oregon`.
- **Build:** `npm install && cd frontend && npm install && npm run build`.
- **Start:** `node server/index.js` (compilado desde TS) — Express sirve API + frontend buildeado. [v2]
- **Health check:** `/api/health`.

```
render.yaml ──▶ Render Web Service "gyro-store"
   build: instala root + frontend, buildea Remix (y compila el server TS)
   start: node server/index.js  (API /api/* + estáticos Remix)
   health: GET /api/health
```

---

## 2. Variables de entorno [v2]

> En Render, las marcadas como secretas se cargan manualmente. **Nunca commitear `.env`.** El
> `.env.example` del repo nuevo lleva estas claves (con valores de ejemplo, no reales).

### Entorno y app
| Var | Ejemplo | Nota |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `APP_URL` | `https://gyro-store.onrender.com` | usada en links de emails |

### Supabase [v2 — reemplaza a Firebase]
| Var | Nota |
|---|---|
| `SUPABASE_URL` | URL del proyecto (dev o prod según ambiente) |
| `SUPABASE_ANON_KEY` | key pública (cliente / login). **No da acceso a datos: RLS deny-all** |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 **secreto** — llave de servidor, ignora RLS. **Solo en el backend, jamás en el frontend** |
| `SUPABASE_JWT_SECRET` | 🔒 para verificar los JWT en el server (si no uso `auth.getUser`) |

### Microsoft Entra ID (login del staff, vía Supabase Azure) [v2]
| Var | Nota |
|---|---|
| `AZURE_TENANT_ID` | ID del tenant `gyrostorenic.com` |
| `AZURE_CLIENT_ID` | app registration en Entra |
| `AZURE_CLIENT_SECRET` | 🔒 secreto de la app registration |
| `INTERNAL_DOMAIN` | `gyrostorenic.com` → solo estos correos son staff [v2 — antes `gyrostore.com`] |

> El client id/secret de Azure se configuran **en el dashboard de Supabase** (Auth → Providers →
> Azure) y/o en env según cómo se arme. La redirect URL de Entra apunta al callback de Supabase.

### Roles de arranque [se mantiene]
| Var | Nota |
|---|---|
| `ADMIN_EMAILS` | whitelist; el **primero** es `global_admin` protegido |
| `SELLER_EMAILS` | whitelist de vendedores de arranque |
| `PROTECTED_ADMIN_EMAIL` | admin que no se puede degradar/borrar |

### Cloudflare R2 (imágenes) [se mantiene]
| Var | Nota |
|---|---|
| `R2_ACCOUNT_ID` | cuenta de Cloudflare |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 🔒 token S3 |
| `R2_BUCKET_NAME` | `gyro-store-images` |
| `R2_PUBLIC_URL` | URL pública del bucket, **sin barra final** |
| `R2_ENDPOINT` | opcional; si se omite, se arma con `R2_ACCOUNT_ID` |

### Negocio [se mantiene]
| Var | Ejemplo |
|---|---|
| `WHATSAPP_NUMBER` | `50585944758` |
| `CURRENCY` | `C$` |
| `EXCHANGE_RATE` | `37` |

### WhatsApp Cloud API (Meta) [v2 — doc 10]
> **Opción A (doc 10 §2, §7):** `WHATSAPP_NUMBER` de arriba **migra** a la Cloud API — deja de
> usarse en la app normal de WhatsApp. Estas variables son las de esa integración:

| Var | Nota |
|---|---|
| `WHATSAPP_TOKEN` | 🔒 token de acceso a la Graph API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número dedicado en la Cloud API |
| `WHATSAPP_VERIFY_TOKEN` | verificación del webhook (`GET /api/crm/webhook`) |
| `WHATSAPP_APP_SECRET` | 🔒 para validar la firma `X-Hub-Signature-256` de cada mensaje entrante |

### Auth de comprador (OTP) [v2 — doc 14]
- **[PROPUESTO]** cuál canal de envío del OTP uso primero: **Supabase phone auth** (SMS vía su
  proveedor configurado) y/o un **gateway propio** (SMS o plantilla de WhatsApp por la misma Cloud API
  de arriba). Las variables exactas dependen de cuál elija — lo cierro al implementar este dominio
  (doc 09, Hito de Cuentas y Lealtad).
- Ninguna de estas keys se expone al frontend; el flujo de solicitar/verificar OTP pasa por el backend
  (`requireCustomer`, doc 03 §A.8), igual que el resto del sistema.

### Email — Microsoft 365 [v2 — reemplaza a Gmail SMTP]
Dos caminos posibles (decido al implementar):
- **Graph API** (recomendado): `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
  `EMAIL_FROM` (`no-reply@gyrostorenic.com`).
- **SMTP del tenant** (más simple): `EMAIL_HOST` (`smtp.office365.com`), `EMAIL_PORT` (`587`),
  `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`.

### CORS [se mantiene]
`CORS_ORIGIN` — dominio de producción permitido.

---

## 3. Supabase [v2]

- **Dos proyectos:** uno para **dev** y uno para **prod** (el free tier lo permite). Cada uno con su
  `SUPABASE_URL` / keys. Pruebo migraciones en dev antes de tocar prod.
- **Schema versionado:** las tablas, tipos `enum`, índices, RLS y funciones SQL viven en
  `supabase/migrations/` (git). Nada de tocar la base a mano en prod.
- **Auth:** habilitar el proveedor **Azure (Entra)**, configurar redirect URL, restringir al dominio
  `gyrostorenic.com`.
- **RLS:** deny-all en todas las tablas; el servidor usa `service_role`.

> **Checklist de setup v2:** crear proyecto Supabase (dev + prod) → aplicar migración inicial →
> configurar Azure provider en Auth → cargar env en Render → verde `/api/health`.

---

## 4. Imágenes [se mantiene de v1]

- El pipeline de v1 ya es bueno: subir original → **Sharp** (cuadrar 1080, `contain` con fondo,
  calidad, WebP) → **R2** con nombre por **hash de contenido** → guardar la URL en Postgres.
- Esto ya reemplazó al viejo `resize-images.ps1` manual; el admin sube desde el navegador y el
  servidor optimiza. **No cambio nada acá en v2.**

---

## 5. Scripts [v2 — ajustados a TS/ESM + Supabase]

| Script | Qué hace |
|---|---|
| `npm run dev` | server + frontend en paralelo (concurrently) |
| `npm run dev:server` | Express en watch (tsx/ts-node) |
| `npm run dev:frontend` | Vite/Remix dev (`localhost:5173`) |
| `npm run build` | compila el server (TS) + buildea el frontend Remix |
| `npm start` | producción: `node server/index.js` |
| `npm run db:migrate` | aplica migraciones SQL a Supabase [v2] |
| `npm run db:seed` | siembra data de arranque en dev [v2] |
| `npm run seed:admin` | siembra el admin inicial |

Puertos dev: Frontend `5173`, API `3000` (`/api/health`).

---

## 6. Ignorados [se mantiene]

- **`.gitignore`:** `node_modules`, builds, `.env*`, `*.pem`, logs, basura de sistema/IDE. **Ya no
  hay `serviceAccountKey.json` de Firebase** que ignorar. [v2]
- **`.claudesignore`:** ignora `package-lock.json` (salvo problemas de instalación) y `.git/` para no
  cargar ruido cuando una IA lee el repo.

> **Higiene de secretos:** confirmar que ningún `.env` real haya entrado a git. La `SUPABASE_ANON_KEY`
> no es peligrosa (RLS deny-all la protege), pero la **`SERVICE_ROLE_KEY`, el `AZURE_CLIENT_SECRET` y
> las keys de R2 sí son críticas**: nunca al repo, y rotarlas si hubo cualquier duda. [v2]

---

## 7. Ambientes [v2 — decisión tomada]

- **local (dev):** `.env` apuntando al **proyecto Supabase de dev**.
- **producción:** Render + **proyecto Supabase de prod**.
- Los dos proyectos separados evitan ensuciar la data real de la tienda y me dejan probar migraciones
  con seguridad. Esta era una `[MEJORA]` de v1 que en v2 ya está resuelta.
