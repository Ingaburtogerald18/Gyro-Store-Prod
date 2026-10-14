# 05 · Pendientes

Lo que falta construir o arreglar, con las decisiones que ya se tomaron. Cuando algo se termina, se
borra de acá y se describe en el documento que corresponda.

## 1. Arreglos puntuales

- **Foto rota en producción.** El producto *KZ EDX Ultra* tiene guardada una foto con dirección
  `blob:http://localhost:5173/…`: una vista previa del navegador que se guardó antes de terminar de
  subir. Hay que quitarla o volver a subirla desde el modo edición. El borrador ya no acepta fotos
  `blob:`, así que no se repite por ese camino.
- **Pagos de préstamo a gastos.** Correr la migración 0018 con el OK del dueño. Pasos en
  [03-Finanzas §13](03-Finanzas.md).
- **Rol Cajero.** El servidor le permite emitir y anular facturas, pero el menú del panel solo le
  muestra Ventas, Pedidos web, Personal y CRM: no llega a Facturación.
- **Tramos de mayoreo en Configuración.** Configuración → Finanzas deja editar los tramos de mayoreo,
  pero el cotizador no los usa (03-Finanzas §5). O se ocultan o se reactiva el mayoreo.
- **Search Console.** Verificar `gyrostorenic.com` como propiedad de dominio (el TXT de Google ya está
  en Cloudflare), enviar `/sitemap.xml` y pedir la indexación de la portada.
- **Plan free de Render.** El servicio se duerme sin tráfico y la primera visita tardó más de 20 s
  (14 oct 2026). Con el servicio dormido, `/robots.txt` llegó a responder `Disallow: /`; la regla de
  caché de Cloudflare evita que esa respuesta quede guardada, pero no que un buscador la reciba en ese
  momento. Subir de plan es decisión de costo.
- **Servicio viejo en Render.** `gyro-store.onrender.com` sirve una versión anterior de la tienda.
  Revisar si tiene las llaves de Supabase de producción y suspenderlo.
- **Garantía y cambios.** La página nace en borrador en Configuración → Atención con lo que el dueño
  confirmó. Faltan definir quién paga el transporte de cambios y garantías, qué pasa con un cambio del
  mismo día cuando Cargo Trans entrega después, las alternativas cuando no hay el mismo modelo y las
  cancelaciones de pedidos pagados, y revisarlo contra la Ley 842 antes de publicar.
- **Nosotros, Términos y Privacidad.** No existen: faltan textos reales (historia y forma de trabajar,
  datos legales, conservación de datos). No se publican páginas vacías.
- **Textos de la tienda.** Cargar el texto de cada categoría (Inventario → Plantillas → Categorías),
  la marca de cada plantilla y las descripciones que faltan (el 14 oct 2026, 4 de 7 productos no
  tenían). Es lo que leen los buscadores y los asistentes de IA. Antes, correr la migración 0033.
- **Imagen para compartir.** La portada usa el logo como imagen social; falta una propia de 1200×630.
- **Ficha del combo.** Muestra el combo como una unidad (nombre, precio, foto y cantidad de
  artículos). Podría listar su contenido: cada combo ya guarda el nombre y la cantidad de cada
  producto (`comboSchema.items`).

## 2. Orden del código

El repositorio ya está ordenado: servidor y frontend por tema, nombres en kebab-case, archivos
gigantes partidos y comentarios de 1 o 2 líneas sin historia (ver 02-Arquitectura §3). Quedan dos
piezas grandes de lógica:

- `components/editor/landing-editor.tsx` es un solo componente de 850 líneas y `updateSale`
  (`modules/sales/sales-edit.ts`) una sola función de 420. Partirlas cambia código, no solo orden: hay
  que probar el modo edición en claro y oscuro, a varios anchos y con teclado, y editar ventas de punta
  a punta.

## 3. Deuda técnica

- **Reserva de stock con bloqueo.** La reserva FIFO de ventas (`modules/inventory/inventory-fifo.ts`) usa UPDATEs
  condicionados y una compensación manual, no una transacción. Con dos ventas simultáneas del mismo
  lote, el `CHECK` de la base evita sobrevender, pero la compensación puede dejar una reserva a
  medias. Pasarla a una función de Postgres con `SELECT … FOR UPDATE` antes de tener tráfico
  concurrente real.
- **Paginación en el servidor.** `DataTable` pagina en el navegador sobre todo el histórico: para
  mostrar 25 filas descarga todo. Es la deuda de rendimiento más grande del panel (ventas,
  facturación, inventario). Solución: `limit`/`cursor` en los endpoints y `manualPagination` en
  TanStack.
- **Periodo en todos los módulos.** Solo Reportería e Inventario filtran por fechas. Ventas y
  Facturación no aceptan fechas ni en el panel ni en sus endpoints. Primero el filtro en el backend;
  después, un selector de periodo común.
- **Comparación con el periodo anterior** (`<Delta>`): solo `get_financial_kpis` la devuelve. Faltan
  los KPIs de inventario, vendedores y desglose de ventas.
- **Datos viejos atenuados durante una recarga** (`fetching` de `QueryState`): solo está en Ventas.
- **Búsqueda en vivo en la paleta ⌘K**: no existe `GET /api/search?q=` (máximo 5 resultados por tipo,
  recortados por rol).
- **Precarga de datos al pasar el mouse** por el menú (`api.util.prefetch`). Hoy solo se precarga el
  código de la ruta.
- **Medición**: falta un `npm run analyze` del bundle y los números base de Lighthouse.
- **Analítica en memoria.** Los reportes leen hasta 100.000 eventos por consulta y agregan en
  memoria. Cuando el volumen se acerque, pasar a tablas de resumen.
- **Índices y `EXPLAIN`** de los listados grandes cuando crezca el volumen; evaluar vistas
  materializadas para los reportes pesados.
- **Borrar en R2 no es transaccional** con la base: puede quedar una imagen huérfana. Los banners se
  limpian solos al publicar; las fotos de productos no.
- **Comprobantes con más de una instancia**: ver los límites en
  [04-Comprobantes-SharePoint §7](04-Comprobantes-SharePoint.md).

## 4. CRM y WhatsApp

**Hecho (fase CRM-A):** contactos, ficha 360, seguimientos y avisos de stock, con todo cargado a mano.

**Decisiones tomadas:**

- **WhatsApp Cloud API oficial de Meta**, con el webhook directo a Express. **Sin n8n** al principio:
  sería otro servicio para mantener (n8n Cloud cuesta unos USD 20/mes y en el plan free de Render no
  corre bien). El bot vive aislado en `server/modules/crm/whatsapp.ts`, así n8n puede entrar después sin
  reescribir nada.
- **Opción A: el número de la tienda migra a la Cloud API.** Deja de funcionar en la app normal de
  WhatsApp y el equipo responde desde la bandeja del panel. Un solo número para el cliente. El costo:
  no queda un segundo canal si el panel o Meta fallan, y eso hay que resolverlo **antes** de migrar.
- **Costo**: responder dentro de las 24 h de un mensaje del cliente es gratis. Solo se pagan las
  plantillas que inicia la tienda (avisos tipo «llegó tu pedido»).

**Lo que falta:**

| Fase | Qué |
|---|---|
| **CRM-B** | Alta en Meta Business, migración del número, tablas `whatsapp_conversations` y `whatsapp_messages` (no existen todavía), webhook `GET/POST /api/crm/webhook` que verifica el token y la firma `X-Hub-Signature-256`, y bandeja en el panel para responder todos los chats |
| **CRM-C** | Bot: respuestas frecuentes, respuesta según el origen (anuncio o link), paso a una persona cuando no entiende o el cliente escribe «asesor». Tarea diaria que manda una plantilla para los seguimientos del día |
| **CRM-D** (opcional) | n8n en un servidor propio barato, solo si los flujos se complican |

Antes de CRM-B hay que definir: la tarifa de plantillas para Nicaragua, las respuestas frecuentes y
plantillas a aprobar, las etapas finales del pipeline (hoy: nuevo, contactado, cotizado, ganado,
perdido) y cómo se calcula el valor de un cliente (solo ventas confirmadas). Las variables `WHATSAPP_*`
que ya están en el archivo de producción se usan recién en esta fase.

## 5. Cuentas de comprador y lealtad

Una capa **opcional** sobre la tienda. Ya existe, sin cuenta: «Mis pedidos» desde el navegador, la
búsqueda por número y teléfono, y la página de seguimiento con los estados del pedido (nuevo,
preparando, enviado, entregado, cancelado).

**Decisiones tomadas:**

- **Premio, no peaje.** El catálogo sigue público y el pedido sigue por WhatsApp. Si algo castiga al
  que no se registra, está mal diseñado.
- **El teléfono une todo**: es la llave del login, el id de WhatsApp y la forma de atribuir un pedido a
  una cuenta. Siempre obligatorio; el correo es opcional.
- **Auth separada del personal**: un middleware `requireCustomer` que resuelve a un contacto, **nunca**
  a un rol del personal. Ningún endpoint acepta los dos tipos de token. El comprador tampoco toca la
  base: lee lo suyo por Express, filtrado en el servidor.
- **Lealtad**: cada 3 compras **entregadas**, un código de un solo uso, atado a la cuenta y con
  vencimiento (los días se definen al construirlo). El ciclo se repite.
- **Tres incentivos distintos**: mayoreo (regla de precio del vendedor, hoy apagada), lealtad
  (ganado) y campaña (público por canal, tipo `TIKTOK10`, con tope y vencimiento).
- **Validar seguidores es manual**: el cliente manda una captura por WhatsApp, el equipo la revisa y le
  da el código.
- **Mayorista**: precio especial que aprueba un administrador; nunca se autodeclara.
- **«Sin respuesta» es una etapa del CRM**, no un borrado. Solo se borra (baja lógica) si el cliente
  lo pide.
- **Pago en línea** sigue fuera.

**Plan recomendado por etapas:**

| Etapa | Qué | Esfuerzo |
|---|---|---|
| 1 | **Unir sesión y contacto** al crear un pedido (`contact_sessions`): lo que navegó esa persona queda atribuido a su contacto sin que se registre | Bajo |
| 2 | **Panel de intención**: una tabla de resumen por contacto (`contact_intent`: última visita, visitas de la semana, búsquedas, productos vistos, puntaje) y la lista «a quién llamar hoy» en el CRM | Medio |
| 3 | Arreglar el filtro de personal de la analítica (hoy asume que quien tiene sesión de Supabase es personal; con cuentas, los compradores desaparecerían de las métricas) y el texto del consentimiento (atribuir la navegación a una persona es un perfil, no una estadística) | Bajo |
| 4 | Login del comprador y **código de bienvenida** (sin premio inmediato nadie se registra) | Alto |
| 5 | Lealtad, «mis códigos» | Alto |
| 6 | Mayorista, campañas por canal y UTM | Medio |

Las etapas 1 y 2 dan casi todo el valor sin que nadie se registre. Recomendación: hacerlas primero,
medir un mes y recién decidir las cuentas.

**Login por WhatsApp en lugar de código por SMS.** El comprador toca «Entrar con WhatsApp», se abre
WhatsApp con un código ya escrito, lo envía, y el webhook recibe el mensaje desde su número real. Es
gratis (el mensaje entrante no se cobra), no hay códigos que alguien pueda pedir en bucle y verifica
mejor el teléfono. Necesita la fase CRM-B.

**Riesgos y mitigación:** pedir códigos en bucle → límite estricto por teléfono e IP; descubrir quién
tiene cuenta → respuestas siempre iguales; datos personales → pedir solo el teléfono y borrar también
los eventos si el cliente pide ser olvidado.

**Preguntas abiertas:** ¿se atribuye la navegación anterior al contacto cuando compra? ¿Solo esa
sesión o también las visitas futuras del mismo dispositivo? ¿Entra el código de bienvenida? ¿Qué
señales ordenan «a quién llamar hoy»?

**Ideas sin decidir:** lista de deseos, referidos, reseñas de compra verificada, niveles VIP, envíos
segmentados por WhatsApp con autorización del cliente, y mostrar stock bajo real a quien tiene cuenta.

## 6. Logística

Los roles `logistics_admin` y `logistics_customer` existen, pero el módulo no. La idea original: envíos
de China a Nicaragua con una línea de tiempo de estados y avisos por correo desde Microsoft 365. No hay
envío de correos en la app.

## 7. Capa fiscal (Nicaragua)

> No es asesoría legal. Montos y reglas cambian: confirmar todo con un contador y con la DGI antes de
> construir o inscribirse.

**Estado:** la facturación del sistema no tiene capa fiscal. El «impuesto» de las compras
(`impuesto_unit_usd`) es el de importación, un costo, no el IVA. Confirmar con el dueño si el negocio
ya está inscrito.

**El régimen decide todo:**

- **Cuota fija** (lo más probable al empezar): ingresos de hasta C$100,000 al mes e inventario de
  hasta C$500,000. Una cuota mensual que junta IR e IVA: no se cobra ni se desglosa IVA. Con ingresos
  menores a C$10,000 se está inscrito pero exento del pago. **Duda clave**: si un importador para
  reventa puede estar en cuota fija.
- **Régimen general**: IVA 15 % con declaración mensual, anticipo de IR del 1 % e IR anual, facturas
  con numeración autorizada por la DGI.

**Pasos de inscripción:** definir el régimen con un contador → RUC en la DGI (cédula y comprobante de
domicilio) → inscripción en el régimen → matrícula municipal y alta del IMI (1 % mensual de ingresos)
en la Alcaldía de Managua → si es régimen general, autorizar la numeración o el sistema de facturación
→ cuenta bancaria del negocio.

**Qué cambia en el código** (construirlo configurable por régimen, para arrancar con IVA 0 y cambiar
solo la configuración):

- En `app_config`: razón social, RUC, dirección fiscal, municipio, régimen, tasa de IVA y datos de la
  autorización de la DGI (serie, rango, resolución).
- En `invoices` (hoy tiene correlativo `GS-PR-n`, cliente, subtotal, descuento, delivery, total y
  anulación): base gravable, tasa y monto de IVA, moneda y tipo de cambio oficial del BCN, RUC o cédula
  del cliente, contado o crédito, serie y el régimen con que se emitió.
- Reportes mensuales: IMI (1 %), anticipo de IR (1 %) e IVA cobrado si corresponde.
- El ticket de 80 mm imprime lo que exija el régimen.

**Verificar antes de construir:** el reglamento 2024/2025 sobre sistemas informáticos de facturación
(puede exigir autorizar el software o transmitir a la DGI), si la factura electrónica es obligatoria
para el régimen, los tramos vigentes de la cuota fija y el tipo de cambio oficial del BCN.

Fuentes consultadas en julio de 2026: DGI (requisitos de inscripción), Consortium Legal (régimen de
cuota fija, 2023), Dele Peso a sus Pesos, GCH Accounting Firm y la Disposición Técnica 09-2007 sobre
sistemas de facturación computarizados.
