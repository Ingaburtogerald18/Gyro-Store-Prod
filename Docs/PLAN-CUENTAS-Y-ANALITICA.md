# PLAN — Cuentas de comprador y analítica de intención

> Documento de **planeación**. No hay código escrito para esto todavía.
> Fuente de la spec: `Docs/14-Cuentas-y-Lealtad.md` (dominio) + `Docs/10-CRM-y-WhatsApp.md` (CRM)
> + `Docs/09-Orden-de-construccion.md` HITO 7 (ítems 91–101).

---

## 1. Lo que YA existe (más de lo que parece)

Antes de planear nada nuevo conviene ver qué hay construido. **La analítica anónima está
prácticamente terminada.**

| Pieza | Dónde | Estado |
|---|---|---|
| Tabla de eventos | `analytics_events` + migración `0005_analytics.sql` | ✅ `session_id`, `path`, CHECK de 5 tipos, índices por tipo y fecha |
| Ingesta | `server/services/analytics.ts` → `ingestEvents` | ✅ Lotes, filtro de bots por user-agent, best-effort (no rompe la respuesta) |
| Agregación | `getOverview`, `getTopSearches`, `getZeroResultSearches`, `getTopViewedProducts` | ✅ Embudo por sesión, búsquedas sin resultado, productos más vistos |
| Cliente | `frontend/app/lib/analytics.client.ts` | ✅ Consentimiento, `sessionId` anónimo (30 min deslizantes), cola + `sendBeacon`, excluye staff y rutas privadas |
| Eventos emitidos | `page_view`, `product_view`, `search`, `checkout_start`, `order_created` | ✅ Los cinco |
| Contactos | `contacts`, `contact_activities`, `follow_ups`, `whatsapp_conversations` | ✅ Tablas creadas |
| Lead desde pedido | `services/crm.ts` → `findOrCreateOrderContact` | ✅ find-or-create por teléfono, tolerante a carreras |
| Enlace pedido↔contacto | `public_orders.contact_id` | ✅ Se llena en cada checkout |
| Códigos | `discount_codes` + `discount_code_redemptions` | ✅ Canje atómico con rastro |

**Traducción:** hoy ya se puede responder *"¿qué busca la gente?"*, *"¿qué buscan y no
encuentro?"*, *"¿qué producto se ve más?"* y *"¿dónde se cae el embudo?"*.

---

## 2. El único hueco real: el puente identidad ↔ sesión

Lo que **no** se puede responder hoy es *"¿qué buscó **Juan**?"*. Y ese es exactamente el panel
de intención que pide el doc 14 §9.

El motivo es de una sola línea: **`analytics_events` no tiene `contact_id`.** Toda la telemetría
es anónima por sesión.

Lo llamativo es que **las dos piezas ya se tocan y nadie las unió**. En
`services/orders.ts`, dentro de la misma función:

```ts
// línea 199 — se resuelve QUIÉN es
const contactId = await findOrCreateOrderContact(input.phone, input.customerName);
// línea 264 — se emite el evento con QUÉ SESIÓN era
await ingestEvents([{ type: 'order_created', sessionId: input.sessionId, ... }]);
```

`contactId` y `sessionId` conviven en el mismo scope y **nunca se cruzan**.

---

## 3. Recomendación A — el 90% del valor NO necesita registro [la principal]

**Tesis:** el objetivo que planteaste ("que se registren para saber qué buscan y hacer
follow-up") mezcla dos cosas que conviene separar. La que da valor es la **identificación**, no
el **registro**. Y hoy ya identificás a todo el que compra: `findOrCreateOrderContact` guarda su
teléfono en `contacts` en cada pedido.

**La propuesta:** al crear el pedido, guardar el vínculo `session_id → contact_id`. Con eso:

- Todo lo que esa persona navegó **en esa sesión** queda atribuido a su contacto.
- Y si el vínculo se **persiste** (tabla `contact_sessions`), sus visitas **futuras** desde el
  mismo dispositivo también se atribuyen — sin que se registre nunca.
- El panel de intención del doc 14 §9 se puede construir **ya**, sobre datos que ya se están
  capturando.

**Costo:** una migración con una tabla de dos columnas y ~10 líneas en `orders.ts`.
**Comparación:** el HITO 7 completo (auth de comprador, OTP, `requireCustomer`, front de cuenta)
son 11 ítems del doc 09.

> **Mi recomendación fuerte: hacer esto primero, medir un mes, y recién ahí decidir si las
> cuentas valen la pena.** Es muy posible que con esto ya tengas el follow-up que querés.

**La contra honesta:** un dispositivo compartido (familia, un celular en el mostrador) atribuye
todo a una sola persona. A la escala de la tienda es ruido tolerable; conviene saberlo.

---

## 4. Recomendación B — login por WhatsApp, no OTP por SMS

El doc 14 §4.2 deja abierto el canal del OTP: SMS o plantilla de WhatsApp. **Los dos cuestan
plata por mensaje**, y el §12 ya identifica el riesgo de *OTP-bombing* (alguien pidiendo códigos
en loop para inflar tu factura).

**Hay un tercer camino que el doc no contempla y que es gratis:** invertir la dirección del
mensaje.

```
1. El comprador toca "Entrar con WhatsApp"
2. El servidor genera un código corto de un solo uso (GS-4F2K, vence en 5 min)
3. Se abre WhatsApp con el mensaje ya escrito: "Confirmo mi cuenta: GS-4F2K"
4. El comprador solo toca ENVIAR
5. El webhook ENTRANTE de Meta recibe el mensaje + el teléfono verificado del remitente
6. El servidor cruza código → teléfono, crea/enlaza el contacto y abre la sesión
```

Por qué es mejor:

| | OTP saliente (SMS/plantilla) | Login por WhatsApp entrante |
|---|---|---|
| Costo | Paga por cada intento | **Gratis** — el webhook entrante no se cobra (doc 10 §3) |
| OTP-bombing | Riesgo real, hay que rate-limitear fuerte | **No existe**: no hay nada que enviar a un tercero |
| Verificación del teléfono | Confía en que recibió el código | **Más fuerte**: el mensaje llega DEL número real |
| Fricción | Cambiar de app, leer código, volver, tipear | 2 toques, sin tipear nada |
| Coherencia | Un canal nuevo | Es **el gesto que tus clientes ya hacen** |

**Requisito:** la Cloud API de WhatsApp tiene que estar conectada (la fase de WhatsApp del doc
10). Si todavía no lo está, esta opción está bloqueada y volvemos a evaluar SMS.

---

## 5. Recomendación C — el panel de intención necesita un rollup, no eventos crudos

`analytics.ts` agrega **en memoria** con un techo de 100.000 filas (`QUERY_ROW_CAP`) y el propio
archivo avisa que los eventos crecen sin techo.

Un panel "ordenado por a quién llamar hoy" que cruce eventos crudos **por contacto** va a
degradarse mucho antes que los reportes agregados actuales, porque necesita recorrer todo el
rango por cada contacto.

**Propuesta:** una tabla `contact_intent` con una fila por contacto, actualizada al ingerir
eventos (o por un job nocturno):

```
contact_id · last_seen_at · visits_7d · searches_30d (jsonb: top 3)
           · viewed_products_30d (jsonb: top 5) · last_search_at
           · intent_score  🧮
```

El `intent_score` es lo que ordena la lista. Las señales del doc 14 §9 se traducen a puntos:
buscó lo mismo 3+ veces sin comprar, varias visitas en la semana sin pedido, carrito armado sin
pedir. **La fórmula exacta conviene fijarla después de ver datos reales**, no antes.

---

## 6. Recomendación D — el problema de la carnada

El doc 14 §5 premia con un código **cada 3 compras entregadas**. Para un cliente que llega por
primera vez, eso está a tres compras de distancia: **no es una carnada, es una promesa lejana**.
Si el registro no da algo *en el momento*, la máquina 1 del §2 no arranca.

El propio doc lista **"código de bienvenida"** en §14 como `[PROPUESTO]`. Mi recomendación es
que **deje de ser propuesto y sea parte del alcance mínimo**: sin recompensa inmediata, el
registro no tiene por qué ocurrir, y sin registros la lealtad nunca se activa.

---

## 7. Dos cosas que se rompen al agregar cuentas (y que conviene saber antes)

**7.1 El filtro de staff de la analítica deja de funcionar.**
`analytics.client.ts` excluye al staff así:

```ts
// "El único que inicia sesión con Supabase es el personal (el comprador es anónimo)"
if (key && /^sb-.*-auth-token$/.test(key)) return true;  // → no trackear
```

Ese comentario **deja de ser cierto** el día que el comprador entre con Supabase Auth: todos los
compradores registrados serían clasificados como staff y **desaparecerían de la telemetría**.
Justo los que más nos interesan. Hay que cambiar la heurística por una comprobación de rol real
antes de lanzar cuentas.

**7.2 El consentimiento cambia de significado.**
Hoy el banner autoriza *estadística anónima agregada*. Atribuir la navegación a una persona con
nombre y teléfono es **otra cosa**: es un perfil personal. El doc 14 §12 ya se compromete a
"mínimo dato necesario" y a ser custodio de PII. En la práctica esto pide:

- Texto del banner distinto (decir que se asocia a tu cuenta/pedido).
- Que el "derecho a ser olvidado" del §11 borre también los eventos, no solo el contacto.

Esto no es burocracia: es la diferencia entre una métrica y un expediente.

---

## 8. Plan por etapas propuesto

| Etapa | Qué | Esfuerzo | Desbloquea |
|---|---|---|---|
| **0** | Correr las migraciones pendientes y verificar que la analítica está capturando de verdad | Bajo | Saber si hay datos antes de construir encima |
| **1** | **Puente sesión↔contacto** (`contact_sessions` + 10 líneas en `orders.ts`) | Bajo | El panel de intención SIN registro |
| **2** | **`contact_intent`** (rollup) + panel "a quién llamar hoy" en el CRM | Medio | La máquina 2 del doc 14 §2 |
| **3** | Arreglar el filtro de staff (7.1) + texto de consentimiento (7.2) | Bajo | Precondición de cualquier cuenta |
| **4** | **Auth de comprador** (`requireCustomer` + login) + código de bienvenida | Alto | La máquina 1 |
| **5** | Lealtad (3 entregas → código) + "mis pedidos" + estados de cara al cliente | Alto | Retención |
| **6** | Mayorista, UTM/campañas por canal | Medio | Atribución fina |

**Las etapas 1 y 2 dan casi todo el valor que buscás y no dependen de que nadie se registre.**

---

## 9. Preguntas

1. **¿Está conectada la Cloud API de WhatsApp?** Define si el login por WhatsApp (§4) es viable
   ya o hay que ir a SMS pago.
2. **¿Atribuimos la navegación anónima previa al contacto cuando compra?** Es el mayor valor por
   el menor esfuerzo, pero es una decisión de privacidad, no técnica.
3. **Si sí: ¿solo la sesión de la compra, o también las visitas futuras del mismo dispositivo?**
   Lo segundo da historial real; también es un rastreo persistente.
4. **¿Empezamos por identificación sin registro (etapas 1-2), o vas directo a cuentas?**
5. **¿Entra el código de bienvenida** como recompensa inmediata al registrarse (§6)?
6. **¿Qué querés ver primero en el panel de intención?** Ordenar por "a quién llamar hoy" exige
   una fórmula; conviene que salga de cómo vendés vos, no de un default mío.

---

_Documento de planeación. Nada de esto está implementado._
