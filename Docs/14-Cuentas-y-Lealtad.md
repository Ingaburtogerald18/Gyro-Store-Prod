# 14 · Cuentas de Comprador y Lealtad — Gyro Store v2

> Este es un dominio **nuevo y transversal**: toca el storefront (doc 01, 13), el modelo de datos (doc
> 03), el backend (doc 04), el CRM/WhatsApp (doc 10) y hasta la lógica financiera (doc 11). Lo saco a
> su propio documento — igual que hice con el CRM en el doc 10 — para no repetirlo a medias en cada
> uno de esos docs. Ellos lo referencian; **este es la fuente de verdad del dominio**.
>
> **La idea en una frase:** hoy mi tienda cierra 100% por WhatsApp, sin fricción, y eso **no cambia**.
> Lo que agrego es una capa **opcional** encima: si un comprador se registra, gana algo (lealtad,
> auto-servicio, precio mayoreo). Si no se registra, no pierde nada. Es un premio, no un peaje.

---

## 1. Filosofía: premio, no peaje [decisión]

**Regla de oro de este dominio:** si una función castiga al que no se registra, está mal diseñada. Si
premia al que se registra, está bien.

- El catálogo sigue **100% público**, sin muros de registro.
- El cierre de compra sigue siendo por **WhatsApp / contra-entrega**, sin pasarela (doc 02 ADR-004,
  doc 04 §6 — esto no lo toco).
- La cuenta de comprador es una capa de **lealtad y auto-servicio**: ver mis pedidos, mis códigos, mi
  progreso hacia un descuento. Nunca un requisito para comprar.
- Corolario para todo lo que sigue: cualquier feature nueva de este doc que alguien proponga "para
  obligar al registro" se descarta de entrada. Si dudo, repaso esta sección.

---

## 2. Las dos máquinas que se refuerzan

Todo el dominio son dos máquinas retroalimentándose: una **capta**, la otra **retiene**. La lealtad
(§5) es la carnada que empuja gente de la máquina 1 a la máquina 2.

```
MÁQUINA 1 — Captación
  Social (IG/FB/TikTok) + referidos + links de WhatsApp
        │
        ▼
  Visita atribuida (contact_origin + UTM, ver §9)
        │
        ▼
  Registro (el código de lealtad / mayoreo es la carnada — "registrate y ganá")
        │
        ▼
  Contacto capturado (contacts + contacts.auth_user_id, ver §4)


MÁQUINA 2 — Retención
  Contacto registrado
        │
        ▼
  Rastreo de comportamiento (qué buscó, qué visitó — panel de intención, §8)
        │
        ▼
  Follow-up (CRM, doc 10 — "a quién hay que contactar hoy")
        │
        ▼
  Recompra (pedido por WhatsApp, atribuido por teléfono — §3)
        │
        ▼
  Código de lealtad (cada 3 compras entregadas, §5) ──┐
        │                                             │
        └─────────────── vuelve a alimentar la Máquina 2 (recompra) ──┘
```

La máquina 1 sin la máquina 2 es solo captar leads que se enfrían (el problema que ya tengo hoy,
"a pulso, en la cabeza y en el chat" — doc 10 §1). La máquina 2 sin la máquina 1 no tiene con qué
alimentarse. Este doc conecta ambas.

---

## 3. El teléfono como columna vertebral [decisión]

El **teléfono** es la llave que une tres mundos que hoy viven separados: el chat de WhatsApp, el
pedido, y la cuenta.

- Es la llave de los **códigos OTP** (§4).
- Es el **ID de WhatsApp** (`contacts.phone`, ya así desde el doc 10).
- Es el criterio de **atribución automática**: un pedido que llega por WhatsApp (y que el admin
  registra como venta u orden pública, igual que hoy) se atribuye a una cuenta buscando ese mismo
  teléfono en `contacts`. Si hay match, el pedido aparece en "mis pedidos" de esa cuenta sin que nadie
  haga nada a mano.
- **Enlace manual como respaldo:** si el teléfono no matcheó (número distinto al de la cuenta, typo,
  etc.), el comprador puede pedir que le enlacen un pedido viejo, o el admin lo hace a mano desde la
  Ficha 360 (doc 10 §1).

**Importante:** esto no cambia cómo nace un pedido. El pedido **sigue naciendo en WhatsApp**; el admin
lo sigue registrando igual que hoy (`public_orders` o venta real). Lo único nuevo es que, al tener
teléfono, el sistema puede *mostrárselo* al dueño de ese teléfono si tiene cuenta. Ver §7 para el
detalle de qué ve el comprador.

---

## 4. Auth del comprador — audiencia separada [decisión]

### 4.1 Por qué separada del staff
El staff entra con **Microsoft Entra ID** (`@gyrostorenic.com`, doc 03 §A.2) — **eso no cambia en
absolutamente nada**. El comprador es una **audiencia completamente distinta**: no tiene rol de
negocio (`app_role`), tiene una cuenta de cliente. Mezclar los dos sistemas de auth sería una
**escalada de privilegios** esperando a pasar (un comprador con un JWT que "casi" parece de staff).
Por eso van separados de raíz, no solo en la UI.

### 4.2 Cómo entra el comprador
- **OTP por teléfono** (código de un solo uso enviado por SMS y/o WhatsApp) — método principal.
- **Correo, opcional** — puede agregarlo para recibir avisos por email, pero **el teléfono es siempre
  obligatorio**: es la llave de los OTP y el nexo con WhatsApp (§3). No hay cuenta sin teléfono.
- Se apoya en **Supabase Auth** (mismo proveedor que el staff, pero con su propio flujo — Supabase
  soporta auth por teléfono con proveedor SMS, y separadamente tengo la opción de mandar el código
  también por la Cloud API de WhatsApp ya que el número de la tienda vive ahí — doc 10 §2, Opción A).
  **[PROPUESTO]** cuál de los dos canales (SMS puro vs. plantilla de WhatsApp) uso primero: lo decido
  al implementar, evaluando costo — ninguno de los dos es gratis a este volumen bajo, a diferencia del
  webhook entrante de WhatsApp que sí lo es (doc 10 §3).

### 4.3 `requireCustomer` — middleware paralelo, nunca cruzado
Igual que el staff tiene `requireRole(...)` (doc 03 §A.4), el comprador tiene su propio
**`requireCustomer`**:
- Verifica el JWT de Supabase del comprador.
- Lo resuelve a un **contacto** (`contacts`, vía `contacts.auth_user_id` — doc 03), **no** a un
  `AppRole`.
- `requireCustomer` y `requireRole` **nunca se combinan en el mismo endpoint** ni se resuelven al
  mismo tipo de usuario. Un JWT de comprador que llegue a una ruta de staff se rechaza; no hay ningún
  camino donde un comprador "suba" a admin/seller/etc.

### 4.4 El comprador tampoco toca la base directo
Mismo patrón que todo el resto del sistema (doc 02 §5.1): el navegador del comprador logueado **no**
lee Postgres directo con su JWT. Todas sus lecturas ("mis pedidos", "mis códigos") pasan por Express
con `service_role`, exactamente igual que el storefront público o el admin. **No se abren políticas
RLS de cara al cliente** — la tabla sigue en deny-all (doc 03 §A.1); lo único que cambia es que ahora
hay un middleware que, en vez de resolver un rol de staff, resuelve "esto es *este* contacto, mostrale
solo lo suyo" — filtrado en el `WHERE` de la query del backend, no en RLS.

---

## 5. Lealtad: tarjeta de sellos [decisión]

### 5.1 Qué cuenta como "compra"
Una compra cuenta **solo cuando fue entregada** — contra-entrega cumplida, de punta a punta. Un pedido
"pendiente" o "en camino" no suma. Esto engancha directo con la máquina de estados del §7: el contador
de lealtad avanza cuando el pedido llega al estado final "entregado".

### 5.2 El ciclo
- Cada **3 compras entregadas** → se genera un **código único de un solo uso**, atado a la cuenta, con
  **fecha de vencimiento**.
- El ciclo es **recurrente**: al usarse (o vencer) el código, el contador se reinicia y arranca la
  cuenta siguiente de 3.
- La cuenta muestra el progreso en todo momento: *"2 de 3 para tu descuento"*.

### 5.3 Ciclo de vida del código de lealtad
1. **Generado** — automático, al confirmarse la 3ra entrega del ciclo. Vive en `discount_codes` (doc
   03 la extiende con `contact_id`, `single_use`, `expires_at`, `redeemed_at` — mismo storage que los
   códigos de campaña del §10, distintos por `kind`).
2. **Atado a la cuenta** — solo lo puede usar el dueño de esa cuenta (o quien lo presente por
   WhatsApp/en tienda a nombre de esa cuenta, ver 5.4).
3. **Un solo uso** — se marca `redeemed_at` al canjearse; no se reutiliza.
4. **Vencimiento** — si no se usa a tiempo, expira. Regla exacta de cuántos días **[PROPUESTO]**, la
   fijo al implementar (vive en `app_config` como todo lo demás editable, doc 11 §9).
5. **Validación** — el vendedor la hace desde el panel (cotizador/checkout), igual que hoy valida
   cualquier código de descuento: lo tipea o lo escanea, el servidor confirma que es válido, de esa
   cuenta, no vencido y no usado, y lo aplica.

### 5.4 Nota de economía (ver también doc 11)
El valor del código de lealtad **tiene que caber dentro de los tiers de margen** — nunca puede dejar
una venta con utilidad negativa. El doc 11 §5 documenta esto como regla de negocio; acá solo lo
menciono porque es la restricción que hace que la lealtad sea sostenible y no un hueco.

---

## 6. Los tres tipos de incentivo (y por qué son distintos)

Antes de este doc, "descuento" era una sola cosa. Ahora son **tres**, con trabajos distintos, y la
estrategia de cada uno es distinta:

| Tipo | Trabajo | ¿Siempre activo? | ¿A quién? | Estrategia |
|---|---|---|---|---|
| **(a) Volumen / mayoreo** | Sube el ticket promedio | Sí, siempre disponible | Detrás de registro (cliente mayorista, §7) o del cotizador del vendedor (staff) | Nunca escaso — es una regla de negocio estable (doc 11 §5) |
| **(b) Lealtad** | Retención — premia recompra | Se **gana**, cíclico | Cuentas registradas con 3 compras entregadas | Ganado, no regalado — refuerza volver a comprar |
| **(c) Promoción / campaña** | Captación — atrae compradores nuevos | Escaso y con fecha | Público, por canal (§10) | Acá SÍ aplica "ser reservado": tope, vencimiento, mensaje de urgencia real (no inventada) |

### 6.1 Estrategia de escasez en el storefront público
**En el storefront público NO se aplican ni se anuncian descuentos automáticos por volumen** a
compradores anónimos. En su lugar, el storefront muestra mensajes tipo *"Registrate para obtener
códigos"* — la carnada de la máquina de captación (§2). Esto es un cambio respecto a como lo tenía
pensado antes (ver corrección en doc 13 §Mundo 1, que decía "se muestran todos los descuentos" — ya
no es así).

**El mayoreo del cotizador del vendedor SE MANTIENE tal cual** (doc 11 §5, doc 12 §2C): un vendedor
armando una cotización real para un cliente que compra volumen sigue viendo y aplicando esos
descuentos automáticamente. Esto no es cara al público anónimo, es una herramienta de staff.

---

## 7. Cliente mayorista

Un comprador puede pedir ser reconocido como **mayorista** (precio especial permanente, no solo el
descuento por cantidad de una compra puntual). El flujo:

1. **Registro** — el comprador necesita cuenta (§4); sin cuenta no hay mayorista.
2. **Historial** — el admin ve su historial de compras (vía la cuenta + Ficha 360, doc 10 §1) para
   decidir si aprueba.
3. **Aprobación manual** — el precio mayoreo **lo aprueba un admin**, nunca se auto-declara. Ningún
   comprador puede marcarse a sí mismo como mayorista y empezar a ver precios distintos sin que
   alguien del staff lo haya revisado y aprobado.
4. Una vez aprobado, esa cuenta ve precio mayoreo en su experiencia de "mi cuenta" (o se lo aplica el
   vendedor al cotizar para ese cliente — el detalle exacto de dónde se refleja el precio **se define
   al construir el front de cuenta**, doc 05/13).

---

## 8. Máquina de estados del pedido/paquete, de cara al cliente

Esto es **una vista simplificada** para el comprador logueado, no un sistema paralelo de gestión. El
**panel de admin sigue siendo la ÚNICA fuente de verdad** (mismo principio que toda la app: el
servidor manda, doc 02 §5.4); la cuenta del comprador es una **ventana de solo lectura** sobre ese
estado.

```
recibido ──▶ en preparación ──▶ salió de la tienda / listo para retiro ──▶ entregado
```

- El pedido **nace en WhatsApp** como siempre (chat → admin registra `public_orders`/venta real).
- Se **atribuye por teléfono** a la cuenta si hay match (§3).
- El admin es quien mueve el estado (a mano, o derivado de eventos de logística/ventas que ya existen
  — `logistics_events`, `order_status`, doc 03 §B.4). El comprador solo lee.
- El estado "entregado" es el que dispara el contador de lealtad (§5.1).
- Detalle exacto de qué columna/tabla guarda este estado de cara al cliente (¿nueva columna en
  `orders`/`public_orders`, o una vista/mapeo desde los estados que ya existen?) **[PROPUESTO]** — lo
  cierro en doc 03 al construir esta parte; conceptualmente es una traducción amigable del estado
  interno, no un sistema nuevo de verdad paralela.

---

## 9. Panel de intención (admin)

Un panel nuevo dentro del CRM (doc 10) que ordena a los contactos **por "a quién hay que llamar hoy"**,
no por fecha de registro ni alfabético. Muestra por contacto:
- **Qué buscó** (cruce con `analytics_events` de búsquedas — doc 01 §3, doc 06 Fase 6).
- **Última visita** y **frecuencia** de visitas.
- **Señales de intención** que lo suben en la lista:
  - Buscó lo mismo **3+ veces sin comprar**.
  - **Varias visitas en la semana** sin cerrar pedido.
  - **Carrito armado sin pedir** (si logueado y el carrito se puede asociar a la cuenta — detalle de
    implementación **[PROPUESTO]**, hoy el carrito es local sin backend, doc 06 Fase 2).

Este panel alimenta directamente la Máquina 2 (§2): es de acá de donde el vendedor saca su lista de
follow-ups del día (doc 10 §1, Agenda de seguimientos).

---

## 10. Atribución de canal y campañas

### 10.1 Lo que ya existe
`contacts.origin` (enum `contact_origin`: `fb_ads`\|`organic`\|`whatsapp_link`\|`referral`\|`other`,
doc 03 §B.1) ya captura de dónde vino un contacto. Este dominio lo **usa**, no lo reemplaza.

### 10.2 Lo que agrego
- **Campos UTM** en `contacts`/`analytics_events` — para saber exactamente qué campaña/link trajo la
  visita, más fino que el `contact_origin` genérico.
- **Códigos de campaña por canal** — un código por canal (`TIKTOK10`, `IG10`, etc.), pensados para
  **medir qué canal trae compradores reales**, no solo clics. Viven en la misma tabla
  `discount_codes`, con `kind='campaign'`, `channel`, tope de usos y vencimiento — son **públicos**
  (cualquiera con el código lo puede usar, a diferencia del código de lealtad que es de una sola
  cuenta).

### 10.3 Validación de "seguidores" — proceso manual
No hay verificación automática de que alguien siga la cuenta de TikTok/IG. El proceso es:
1. El cliente manda un **screenshot** por WhatsApp mostrando que sigue/compartió.
2. El staff lo valida **a mano**.
3. Se le entrega un **código por WhatsApp**, que el cliente puede:
   - Usarlo en la plataforma (cuenta o cotizador), o
   - Que se lo agreguen **en la factura** si viene físicamente a la tienda.

Esto es deliberadamente manual y liviano — no vale la pena automatizar una verificación de "follow"
al volumen actual de la tienda.

---

## 11. "Unresponsive" es un estado, no un borrado [decisión]

Cuando un contacto deja de responder, se le pone una **etiqueta/etapa** (`stage` en `contacts`, doc 10
§5) de "unresponsive" dentro del pipeline del CRM. Eso significa:
- **Se deja de invertirle follow-ups** (no sale más en el panel de intención del §9 como prioridad).
- **El registro se conserva completo** — historial, pedidos, todo sigue ahí.
- El **borrado real es soft-delete** (`deleted_at`, mismo patrón que `profiles`, doc 03 §B.5) y
  **solo ocurre si el cliente lo pide explícitamente** (derecho a ser olvidado). Nunca automático,
  nunca por inactividad.

---

## 12. Riesgos de este dominio

Superficie nueva que no existía antes de agregar cuentas de comprador — los enumero con su mitigación,
en el mismo espíritu de la auditoría del doc 12 §1 (que hay que **templar**, ver ahí):

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Fricción que mata conversión** | Si el registro pide más de un toque, la gente lo abandona y vuelvo a fallar la regla de oro (§1) | Registro de **un solo toque** (teléfono + OTP, nada más obligatorio) |
| **OTP-bombing / costo** | Alguien puede pedir OTPs en loop para spamear un teléfono ajeno o inflar mi costo de SMS/WhatsApp | **Rate-limit agresivo** por teléfono e IP en el endpoint de solicitud de OTP (más estricto que el `apiLimiter` general, doc 03 §A.6) |
| **Enumeración de cuentas** | Un endpoint que responde distinto según si el teléfono existe o no permite mapear mi base de clientes | **Respuestas genéricas** siempre ("si el número existe, te enviamos un código"), nunca confirmar existencia |
| **Separación estricta staff/cliente** | Ya cubierto en detalle en §4.3, pero lo listo acá como riesgo de seguridad, no solo de diseño | `requireCustomer` nunca resuelve `AppRole`; ningún endpoint acepta ambos tipos de JWT indistintamente |
| **PII (datos personales)** | Ahora guardo más datos personales atados a una identidad autenticada (antes eran solo leads sueltos) | **Mínimo dato necesario.** Soy el custodio: no pido más de lo que uso (teléfono obligatorio, correo opcional, nada de datos que no tengan un propósito claro en este doc) |
| **Sincronía WhatsApp ↔ plataforma** | Con Opción A (doc 10 §2) los vendedores responden desde el panel — si el panel y WhatsApp se desincronizan, hay respuestas duplicadas o perdidas | El panel es la **única fuente de verdad** del estado de la conversación (mismo principio que §8 para pedidos) |
| **Scope creep hacia pagos** | "Ya que hay cuenta, agreguemos pago con tarjeta" es la pendiente resbalosa | Pagos online (BAC) **siguen fuera de alcance** (§13) — la cuenta es lealtad/auto-servicio, no un rediseño del checkout |

---

## 13. Puerta abierta a pagos online (sin implementarlos)

Los pagos online (BAC) **siguen fuera de alcance** — el cierre sigue siendo WhatsApp/contra-entrega,
igual que doc 01 §4.2 y doc 02 ADR-004 ya establecían. Pero el diseño de este dominio mantiene la
puerta abierta a propósito: la **orden es el objeto central**, y un pago (cuando algún día exista) es
solo un **evento pegado a una orden** — el mismo patrón que ya uso para `payments` en `installments`
(doc 03 §B.5). No hay nada en este doc que haya que deshacer el día que se decida abrir esa puerta.

---

## 14. Extras propuestos [PROPUESTO — para decidir, no construir todavía]

Ideas que quedan fuera del alcance inicial de este dominio, para que las revise y decida cuáles entran
y cuándo. Ninguna está descartada, ninguna está aprobada:

- **Wishlist + "avisame cuando llegue"** — dispara cuando un `purchase`/producto pasa a `received`
  (doc 03 §B.3).
- **Programa de referidos** — un comprador trae a otro, ambos ganan algo.
- **Reseñas de comprador verificado** — solo quien tiene una compra entregada puede reseñar.
- **Código de bienvenida** — un código de captación al registrarse (distinto del de lealtad, que se
  gana con compras).
- **Niveles / VIP** (Bronce/Plata/Oro) — evolución del ciclo de 3 del §5 hacia algo escalonado.
- **Broadcasts segmentados por WhatsApp** — mensajes salientes a grupos de contactos, con **opt-in
  explícito** y **plantillas aprobadas** por Meta (mismo mecanismo que doc 10 §8 salientes, pero
  segmentado en vez de 1:1).
- **Señal de escasez real "quedan 3"** — mostrar stock bajo real a compradores logueados (nunca
  inventado — si digo "quedan 3", tienen que ser 3 de verdad).

---

## 15. Relación con el roadmap

Este es un **dominio transversal** (toca storefront, CRM, backend y datos a la vez), igual que el CRM
del doc 10. No es parte de los 8 dominios originales del doc 06 ni bloquea el lanzamiento (doc 08 §8
sigue sin requerir cuentas de comprador para "listo para lanzar"). Vive en su propio **Hito** dentro
del doc 09 — ver ahí el desglose archivo por archivo (migración de auth de cliente, `requireCustomer`,
services/routes de cuenta, lealtad, extensión de `discount_codes`, estados de pedido de cara al
cliente, panel de intención, front de cuenta).
