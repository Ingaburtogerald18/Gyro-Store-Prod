# 10 · CRM y automatización de WhatsApp — Gyro Store v2

> Este es el dominio que quería hacer "más interesante" que el CRM de v1. La base de la idea me la
> armó otra IA (Antigravity) y me gustó; acá la dejo en mi voz, aterrizada a mi realidad: **lo más
> barato posible mientras la tienda empieza a generar plata**, y construida por fases para no
> depender de nada de Meta para arrancar. Este doc reemplaza al "CRM decisión abierta" de los docs
> 06 y 08.

---

## 1. Qué quiero lograr

Hoy capto leads de Instagram/Facebook/WhatsApp y los sigo a pulso, en la cabeza y en el chat. Quiero
un CRM dentro de `/admin` que me deje:
- **Ficha 360 del cliente:** ver de un cliente todos sus pedidos (`public_orders` + ventas reales),
  su historial de chat y sus datos, en una sola pantalla.
- **Agenda de seguimientos:** una lista/kanban de "a quién hay que contactar hoy" (llegó el stock que
  pidió, recordatorio de cotización, etc.).
- **Bandeja de WhatsApp:** responder desde el panel los chats que necesitan atención humana.
- **Un bot** que responda dudas frecuentes, atienda leads que vienen de un ad o un link, y **pase a
  humano** cuando no entiende o el cliente lo pide.

---

## 2. Decisiones de costo (lo definido en esta fase)

Todo esto está pensado para arrancar en **~$0/mes** de infraestructura extra:

| Decisión | Qué elegí | Por qué |
|---|---|---|
| **n8n** | **No lo uso todavía.** El webhook de Meta pega **directo a mi Express**. | n8n es un servicio más que hospedar y mantener; n8n Cloud cuesta ~$20+/mes y en Render free no corre bien (se duerme, necesita disco pago). Mi backend ya está always-on en Render. |
| **Motor del bot** | Lógica en TypeScript, en `server/services/whatsapp.ts`, aislada. | Respeta "todo pasa por el servidor" y me deja **meter n8n después sin reescribir** (n8n llamaría a estos mismos endpoints). |
| **WhatsApp Cloud API (Meta)** | Sí, la API oficial. | La API es gratis; solo se pagan ciertos mensajes salientes (ver §3). |
| **Plantillas de Meta** | Acepto el modelo. | A mi escala el costo arranca casi en $0 (§3). |
| **Número de teléfono** | **Opción A: el número de la tienda MIGRA a la Cloud API.** Deja de usarse en la app normal de WhatsApp/WhatsApp Business; el "teléfono" pasa a ser el **inbox del panel** — los vendedores responden desde ahí, no desde su celular. **[v2 — reemplaza la decisión anterior de "número nuevo dedicado + mantener el actual" de §7.]** | Ver §7 — es el punto más importante. |

**Si algún día meto n8n** (cuando los flujos se compliquen): self-hosted en **Oracle Cloud Free
Tier** ($0) o Hetzner (~€4/mes), nunca n8n Cloud.

---

## 3. Cómo funciona el cobro de Meta (y por qué me sale casi gratis al inicio)

- **Cliente me escribe** (desde un ad, un link, orgánico) y respondo **dentro de 24h → GRATIS.** Es
  el grueso de mi tráfico.
- **Solo pago** cuando *yo* inicio la conversación fuera de esa ventana con una **plantilla aprobada**
  (ej. "llegó el stock que pediste"). Las plantillas **utility** (avisos, no promo) son las más
  baratas y de bajo volumen.
- La **API en sí no tiene costo**; el webhook lo recibe mi Express (ya pagado).

> **Pendiente operativo:** verificar la tarifa exacta de **Nicaragua** en el rate card de Meta antes
> de lanzar. El orden de magnitud es unos centavos de USD por mensaje saliente de plantilla.

---

## 4. Arquitectura (respeta la regla de siempre)

```
   Cliente (WhatsApp)
        │  mensaje
        ▼
  ┌──────────────┐   webhook (POST)   ┌─────────────────────────────┐
  │ WhatsApp     │ ─────────────────▶ │  Express  /api/crm/webhook  │
  │ Cloud API    │ ◀───────────────── │  (verifica firma de Meta)   │
  │ (Meta)       │   enviar mensaje   │                             │
  └──────────────┘   (Graph API)      │  services/whatsapp.ts (bot) │
                                      │  services/crm.ts            │
                                      │        │ service_role       │
                                      │        ▼                    │
                                      │   Supabase Postgres         │
                                      └─────────────────────────────┘
                                                 ▲
                                      /admin/crm  │ (Remix + shadcn/ui)
                                      Inbox · Ficha 360 · Agenda
```

- **Meta → Express:** un solo endpoint recibe todos los mensajes entrantes.
- **El bot vive en Express** (`services/whatsapp.ts`): decide si responde solo o marca `needs_human`.
- **El panel** lee/escribe siempre por el backend; nunca toca la base directo (regla de v2).
- **Salientes:** el backend llama a la Graph API de Meta para enviar mensajes/plantillas.
- **n8n:** hueco reservado. El día que entre, se para entre Meta y Express, o consume estos endpoints.

---

## 5. Modelo de datos (nuevas tablas — ver también doc 03)

Unifico el CRM en `contacts` (jubilo la vieja tabla `followups` de v1) y agrego lo de WhatsApp:

- **`contacts`** (el cliente/lead, ya existía — lo amplío): `phone` 🔑 `unique` (es el ID de
  WhatsApp), `name`, `origin` (`contact_origin`: `fb_ads`\|`organic`\|`whatsapp_link`\|`referral`\|
  `other`), `stage`, métricas de LTV 🧮 (derivadas de sus ventas).
- **`contact_activities`** (timeline de toques, ya existía): notas, llamadas, cambios de etapa.
- **`follow_ups`** (agenda / recordatorios) — **nuevo**:
  `contact_id` FK, `scheduled_date` 🔑, `reason` (texto), `status` (`follow_up_status`:
  `pending`\|`completed`\|`cancelled`), `created_by`.
- **`whatsapp_conversations`** — **nuevo**:
  `contact_id` FK, `phone`, `status` (`conversation_status`: `bot`\|`needs_human`\|`closed`),
  `assigned_to`, `last_message_at` 🔑.
- **`whatsapp_messages`** — **nuevo**:
  `conversation_id` FK, `direction` (`message_direction`: `inbound`\|`outbound`), `body`,
  `wa_message_id` (id de Meta, para dedupe), `template_name` (si fue plantilla), `status`, `created_at`.
- **Enlace para la Ficha 360:** agrego `contact_id` (FK nullable) + `phone` a **`public_orders`** y
  **`orders`**, para poder hacer `JOIN` y ver todo el historial de compras de un cliente.

**Enums nuevos:** `contact_origin`, `follow_up_status`, `conversation_status`, `message_direction`.

Todo esto entra en una **migración SQL nueva** (`supabase/migrations/00XX_crm.sql`).

> **Comprador registrado = contacto con auth [v2 · doc 14]:** cuando agrego cuentas de comprador,
> `contacts` se extiende con `auth_user_id` (FK nullable `unique` → `auth.users`) — un contacto puede
> seguir siendo un lead suelto (sin cuenta) o convertirse en una cuenta autenticada. Es el **mismo**
> registro de `contacts` en los dos casos; no hay una tabla paralela de "clientes con cuenta". Detalle
> completo del dominio, incluida la atribución de canal + campos UTM y los códigos de campaña por
> canal (validados por screenshot manual): **doc 14**.

---

## 6. Endpoints de Express (ver también doc 04)

Grupo `/api/crm`:

| Método · Ruta | Rol | Qué hace |
|---|---|---|
| `GET /api/crm/webhook` | público (verify token de Meta) | responde el challenge de verificación de Meta |
| `POST /api/crm/webhook` | público (valida **firma** de Meta) | recibe mensajes entrantes → guarda + corre el bot |
| `GET /api/crm/conversations` | admin/seller | lista chats (filtro `needs_human`) |
| `GET /api/crm/conversations/:id/messages` | admin/seller | historial del chat |
| `POST /api/crm/conversations/:id/reply` | admin/seller | envía mensaje a Meta (Graph API) |
| `POST /api/crm/conversations/:id/handover` | admin/seller | alterna `bot`\|`needs_human` |
| `GET /api/crm/contacts/:id` | admin/seller | **Ficha 360**: contacto + pedidos + ventas + chat |
| `GET /api/crm/follow-ups` | admin/seller | agenda (hoy / pendientes) |
| `POST /api/crm/follow-ups` · `PUT` · `PATCH` | admin/seller | crear/editar/cerrar recordatorio |

- El webhook es **público** pero **verificado**: en `GET` valida el `verify token`, en `POST` valida
  la **firma `X-Hub-Signature-256`** de Meta antes de procesar. Nada entra sin firma válida.
- Todo lo demás pasa por `requireRole` como el resto del admin.
- **Servicios:** `services/whatsapp.ts` (verificar firma, enviar mensaje/plantilla, parsear webhook) +
  `services/crm.ts` (contactos, follow-ups, ficha 360).

---

## 7. ⚠️ El número de teléfono (decisión operativa clave) — Opción A [v2]

La Cloud API exige un número dado de alta en la plataforma de Meta, y una vez migrado **ya no se
puede usar en la app normal de WhatsApp / WhatsApp Business** con ese mismo número.

**Decisión (reemplaza la anterior):** **Opción A** — **migro mi número actual de la tienda** a la
Cloud API, en vez de sacar un número nuevo aparte. Esto significa:
- Ese número **deja de estar disponible en la app normal de WhatsApp**: ya no lo abro desde mi
  celular para escribir a mano.
- El **"teléfono" pasa a ser el inbox del panel** (`/admin/crm`, §6): los vendedores responden desde
  ahí, con la Graph API haciendo el envío/recepción real.
- **Por qué migrar y no sacar número nuevo:** mantiene un solo número de cara al cliente (menos
  confusión, un solo lugar donde escribir), y evita que el trato humano quede fragmentado en dos
  números distintos mientras el CRM madura.
- **Costo de la decisión:** ya no hay "salida de emergencia" por el WhatsApp normal — si el panel/la
  Cloud API tiene un problema, no hay un segundo canal humano de respaldo en ese mismo número. Esto lo
  tengo que resolver **antes** de conectar nada de Meta.

---

## 8. Bot — lógica mínima (Fase de WhatsApp)

- **Entrante (inbound):** llega mensaje → busco el `phone` en `contacts` (¿nuevo o existente?) → creo/
  actualizo `whatsapp_conversations` + guardo el `whatsapp_messages`.
  - Si trae un **payload de origen** (link con texto predefinido, ad de FB) → respondo con info de ese
    producto/campaña.
  - Si es **duda común** → respuesta automática (FAQ).
  - Si **no entiende** o el cliente escribe "asesor" → marca `needs_human` y **el bot deja de
    responder** esa conversación.
- **Saliente (outbound / agenda):** un **cron diario** en el backend revisa `follow_ups` con
  `scheduled_date = hoy` y `status = pending`. Si toca avisar (ej. "llegó tu stock"), el backend envía
  una **plantilla utility** por la Graph API (requerida por Meta fuera de la ventana de 24h).

---

## 9. Plan por fases (prioridad: barato y sin depender de Meta para arrancar)

### Fase CRM-A — Base de datos + panel (primero, sin Meta)
Migración de tablas CRM, **Ficha 360**, **Agenda de seguimientos** (kanban/lista), unificar en
`contacts`. **Da valor desde el día 1 aunque cargue todo a mano.** No depende de aprobaciones de Meta.

### Fase CRM-B — WhatsApp Cloud API (después)
**Migración del número actual** a la Cloud API (Opción A, §7), setup de Meta Business + verificación,
webhook `/api/crm/webhook`, **Inbox** en el panel para responder **todos** los chats (ya no solo
`needs_human` — el número dejó de estar disponible en la app normal), enviar/recibir mensajes.

### Fase CRM-C — Bot y automatización
FAQ automáticas, ruteo por origen (ads/links), handover a humano, cron de salientes con plantillas.
**[PROPUESTO]** broadcasts segmentados (mensajes a grupos de contactos, con opt-in explícito y
plantillas aprobadas por Meta) — extra del doc 14 §14, a decidir.

### Fase CRM-D (opcional, a futuro) — n8n
Solo si los flujos se vuelven complejos. Self-hosted barato; consume los endpoints que ya existen.

---

## 10. Lo que sigue pendiente de definir
- Tarifa exacta de plantillas para **Nicaragua** (verificar en Meta antes de CRM-B).
- Set inicial de **FAQ** del bot y las **plantillas** a enviar a aprobar por Meta.
- Etapas exactas del **pipeline** (`stage`) que quiero en el kanban.
- Cómo calculo el **LTV** en la ficha (suma de ventas confirmadas, ¿incluyo pedidos públicos no
  cerrados? probablemente no).
