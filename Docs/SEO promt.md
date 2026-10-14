# Prompt maestro para Claude: rediseño integral de Gyro Store

Actuá como responsable de implementación de este proyecto, con criterio de diseño de e-commerce, desarrollo full stack, accesibilidad y SEO técnico. Primero analizá el estado real del código y después implementá los cambios compatibles con los requisitos de este encargo. No te quedés únicamente en recomendaciones, un wireframe o un plan.

Trabajá en la raíz de este repositorio.
Dominio público principal: https://gyrostorenic.com.
Contexto de este encargo: conversación con el dueño consolidada el 14 de octubre de 2026.

El resultado debe ser una tienda pública clara, mantenible y profesional: portada, catálogo, fichas, navegación, ayuda, footer y administración del contenido. Debe facilitar descubrimiento orgánico y comprensión por buscadores y asistentes de IA, sin prometer posiciones ni tráfico garantizados.

## 1. Alcance, autorización y forma de trabajar

Este encargo autoriza analizar e implementar localmente el rediseño y las mejoras necesarias. Las decisiones comerciales confirmadas están en las secciones siguientes. Las decisiones de diseño que el dueño aprobó el 14 de octubre de 2026 están en DESIGN.md (sección 10, «Pendiente en el código» y registro) y se resumen en la sección 5; lo que no figure allí sigue siendo una recomendación.

- Leé primero AGENTS.md y DESIGN.md. DESIGN.md es el único documento de diseño y sus reglas mandan.
- Leé Docs/README.md, Docs/01-Producto.md, Docs/02-Arquitectura.md, las partes relevantes de Docs/05-Pendientes.md y App/database/README.md.
- Revisá git status y el diff antes de editar. Puede haber trabajo reciente de Claude u otra persona: preservalo, no lo sobrescribás ni revirtás.
- Las rutas y hallazgos de este prompt son una referencia del análisis; verificá si cambiaron. El estado actual del repositorio es la fuente de la implementación.
- Si una propuesta contradice una regla vigente de DESIGN.md, señalá exactamente la contradicción y preguntá antes de aplicar esa parte. Continuá con el trabajo independiente que sí esté autorizado.
- No pidas confirmación para cada elección rutinaria de componentes, distribución o nombres. Preguntá por contradicciones reales, condiciones comerciales pendientes o decisiones que cambien el negocio.
- Las nuevas decisiones de diseño aprobadas deben quedar en DESIGN.md y en su registro, junto con el cambio correspondiente. No registres recomendaciones sin aprobar como si ya fueran decisiones del dueño.
- Actualizá los documentos existentes cuando cambie lo que describen. No creés auditorías, planes, reportes ni otros documentos sueltos dentro del repositorio.
- No migres de framework, no creés otra aplicación y no aproveches este encargo para refactorizar áreas ajenas.
- Implementá de extremo a extremo: una opción nueva que necesita persistencia debe incluir esquema, backend, permisos, interfaz y validación. No entregués botones sin funcionamiento ni contenido editable solo en apariencia.
- Prepará cambios locales revisables. El proyecto tiene autodeploy en Render al hacer push: este encargo no autoriza publicar, cambiar DNS, ejecutar migraciones en producción ni alterar servicios externos.
- Podés preparar migraciones y probarlas en un entorno de desarrollo verificado. No deduzcas que una base es de desarrollo solo por el nombre del archivo .env o por NODE_ENV.
- No imprimas credenciales ni copies secretos a documentación, logs, capturas o frontend.
- No creés commits ni hagás push por iniciativa propia. Si se solicita un commit, las verificaciones exigidas por el proyecto deben pasar antes.

Empezá con un resumen breve de hallazgos y un plan por etapas; después comenzá a implementar. Si surge un bloqueo puntual, delimitá qué afecta y seguí con lo demás. Mantené informado al dueño con avances concretos.

## 2. Qué es Gyro Store y qué queremos conseguir

Gyro Store es una tienda en línea de Managua, Nicaragua. Vende al detalle y atiende consultas de mayoreo. La marca quiere ampliar progresivamente sus categorías y vender a distintos públicos; el capital y el catálogo actuales son limitados.

No reduzcas permanentemente su identidad a audio o gaming, aunque hoy haya productos de esas categorías. Tampoco aparentes un catálogo enorme ni agregues categorías vacías.

El recorrido principal deseado es:
1. Descubrir productos.
2. Ver fotos, modelos, colores, precios y disponibilidad.
3. Consultar por WhatsApp para asesoría, cotización, más fotos o videos.
4. Para clientes que prefieren comprar en línea, registrar un pedido en la plataforma y que el negocio lo reciba y gestione.

Ambos caminos deben ser claros. Consultar por WhatsApp, agregar al carrito, registrar un pedido y realizar un pago son acciones distintas.

Ventajas declaradas por el dueño:
- Importación directa de fábricas.
- Precios competitivos.
- Asesoría.
- Garantía comercial por fallas de fábrica.
- Atención de compras mayoristas mediante cotización.

No transformes estas ventajas en afirmaciones no demostradas como “los más baratos de Nicaragua”, “máxima calidad garantizada”, “distribuidor oficial” o “miles de clientes”. No inventes cifras, premios, años de trayectoria ni certificaciones.

El dueño mantendrá los contenidos y la configuración. La administración debe ser sencilla, con nombres en español y sin exigir conocimientos de SEO para actualizar la tienda.

## 3. Datos comerciales confirmados

### Identidad y contacto

- Nombre comercial: Gyro Store.
- Dominio público: gyrostorenic.com.
- Ciudad y país: Managua, Nicaragua.
- Negocio en línea; existe entrega/retiro desde la vivienda del dueño. No hay un local comercial independiente confirmado.
- El dueño quiere mostrar públicamente la dirección que ya aparece en la configuración y footer.
- Dato de referencia exacto obtenido del footer: “Bo Georgino Andrade, Del Conchita Palacios 2c al lago 1c arriba”.
- Enlace de Maps encontrado: https://maps.app.goo.gl/DhXTHgE9niEYxhAWA?g_st=ic
- Verificá el dato actual configurado y reutilizalo; no lo sustituyás por la dirección abreviada de mensajes anteriores ni creés copias divergentes.
- WhatsApp, correo, redes y cuentas bancarias: usar los datos reales de configuración. No inventarlos ni reemplazarlos con datos de muestra.

Horarios de atención:
- Lunes a viernes: 8:00 a. m. a 5:00 p. m.
- Sábados y domingos: 9:00 a. m. a 4:00 p. m.
- Zona horaria operativa: America/Managua.

Estos son horarios de atención. No asumás que implican retiro inmediato, despacho o entrega garantizados en todo ese horario. No anunciés una futura sucursal como existente.

### Entregas y pagos

Managua:
- Delivery con costo adicional cotizado con el repartidor.
- Entrega el mismo día.
- El cliente puede pagar al recibir mediante efectivo o transferencia.

Fuera de Managua:
- Envíos por Cargo Trans.
- Plazo informado por el dueño: 24 a 48 horas.
- El producto se paga por adelantado, antes del despacho.
- El transporte se paga aparte después del despacho, cuando se envía al cliente el comprobante de Cargo Trans.

No describás Cargo Trans como envío contra entrega ni afirmés que el transportista cobra al recibir: eso no se confirmó. Tampoco inventes quién recibe el pago del transporte o el medio usado para ese cobro.

No hay tarifa fija de envío confirmada. El envío se cotiza; no es gratuito ni está incluido por defecto en el precio del producto.

No se confirmaron horas de corte, días hábiles, excepciones por feriados, zonas específicas ni el momento exacto desde el cual contar las 24–48 horas. Si hace falta formalizarlos, preguntá sin inventar compromisos.

Métodos confirmados:
- Efectivo.
- Transferencia.

No agregués pago con tarjeta, cuotas, pasarelas, PayPal ni logos de medios no aceptados. Los datos bancarios existentes se reutilizan con sus permisos actuales.

### Mayoreo

- Se atiende por WhatsApp para cotizar y asesorar.
- No hay mínimo de unidades, tabla de descuentos, mezcla de modelos ni procedimiento automático aprobados.
- No muestres precios mayoristas ficticios.
- El llamado debe invitar a indicar productos, cantidades y necesidades para recibir una propuesta.

### Garantía y cambios

Garantía comercial declarada:
- Un mes por fallas de fábrica.
- Comienza cuando el cliente recibe el producto.
- No convertir automáticamente “un mes” en “30 días”.
- Ante una falla confirmada, el negocio plantea reemplazar por el mismo modelo nuevo en caja.
- Si el modelo se agotó, se ofrecen alternativas; la solución exacta no está totalmente definida.
- El dueño pidió presentar el artículo con su caja y sin señales de golpes, rayones o mal uso. Esta condición necesita una redacción que no suprima derechos por un defecto de fábrica.

Cambio voluntario declarado:
- El mismo día de la compra.
- Artículo sin usar.
- Cambio por otro de mayor valor pagando la diferencia.
- No se confirmó quién paga los transportes.
- El dueño no aprobó cambiar el plazo a “día de recepción”. No hagás ese cambio silenciosamente.

Pedidos sin pagar:
- Pueden dejarse sin efecto y no se despachan.

La intención comercial del dueño fue impedir cancelaciones o devoluciones después del pago. Esto NO está validado como política jurídicamente correcta; tratá el punto como pendiente de revisión, no como cláusula definitiva lista para publicar.

## 4. Condiciones pendientes y límites para redactar políticas

Hay cuestiones concretas que no debés resolver inventando:
- Cambio voluntario el día de compra cuando Cargo Trans entrega uno o dos días después.
- Quién paga transportes de cambios y garantías.
- Alternativas exactas cuando no hay el mismo modelo para una reposición.
- Cancelaciones de pedidos pagados antes o después del despacho.
- Cobro y destinatario del transporte de Cargo Trans.
- Excepciones y cómputo de plazos de entrega.
- Procedimiento y condiciones de retiro que no estén ya confirmados.
- Datos legales, conservación de información y otros detalles necesarios para términos y privacidad que no consten en el proyecto.

Revisá la Ley 842 y sus reformas aplicables en fuentes oficiales antes de redactar condiciones finales. El análisis previo identificó que los artículos 37 y 45–48 son relevantes para cláusulas abusivas, defectos, soluciones y garantía. No publiques una prohibición absoluta de reembolsos o cancelaciones por el solo hecho del pago. La aplicación concreta requiere validación local; no conviertas este prompt en un dictamen legal.

Fuente oficial consultada: [Ley 842, texto publicado en La Gaceta](https://www.superintendencia.gob.ni/sites/default/files/documentos/leyes/Ley_842_3.pdf). Verificar reformas y aplicación vigentes.

Separá cambios voluntarios, garantía y cancelaciones. No uses una frase genérica de “sin perjuicio de la ley” para dar por resuelta una condición incompatible. Tampoco rechacés automáticamente cualquier garantía por falta de caja o por un rayón sin analizar la causa del defecto.

Podés implementar el soporte y dejar contenido sensible en borrador para revisión. No publiqués páginas vacías, cláusulas sin aprobar ni avisos internos de revisión legal a los compradores. No elimines las funciones existentes de cancelación, devolución o atención de reclamos para forzar una política todavía pendiente.

Estas cuestiones no deben detener portada, navegación, catálogo, SEO, datos de contacto ni los textos comerciales ya confirmados.

## 5. Dirección de diseño y navegación

Conservá logo, paleta, tipografías y lenguaje visual de DESIGN.md. No diseñes otra marca ni una tienda genérica con colores ajenos.

Decisiones del dueño (14 de octubre de 2026, ya en DESIGN.md):
- Portada corta en /, en este orden: Presentación, Destacados, filas por categoría con «Ver todo», Novedades, Cómo comprar y Mayoreo.
- Presentación = el banner principal existente (`locked` en `heroSlides`): fijo, sin flechas ni puntos y único H1 de la portada. Novedades = los demás banners visibles, todos a la vista y sin rotar. El esquema de `heroSlides` no cambia: borradores, versiones y restauración siguen valiendo.
- Destacados: hasta 8 productos elegidos por ID, como bloque nuevo de la tarea Portada (campo opcional, compatible con configuraciones viejas). Con 8 productos o menos en el catálogo, sin filas por categoría para no repetir.
- Catálogo completo en /catalogo y categorías en /categoria/:slug, con productos en el HTML inicial.
- Ficha disponible: «Consultar por WhatsApp» (variante `whatsapp`) principal y «Agregar al carrito» (`outline`) secundaria, también en la barra móvil. «Avisame cuando haya» sigue principal en Agotado y Próximamente.
- Tarjeta de producto sin botones: foto, nombre, precio y estado; toda la tarjeta abre la ficha. Se retira la acción rápida de la tarjeta.
- Todo dentro del dominio principal, sin nuevos subdominios para catálogo, ayuda o guías.

No borres imágenes, banners, borradores o versiones. Cambiar comportamiento no debe hacer perder material del dueño.

No hace falta un mega menú con pocas categorías. Usá navegación proporcionada al catálogo real.

Header de escritorio:
- Logo enlazado al inicio.
- Búsqueda visible y fácil de usar.
- Carrito con contador accesible.
- Navegación compacta: Catálogo, Por mayor, Ayuda y Guías solo cuando haya contenido publicado.
- “Nosotros” y “Contacto” pueden ir en navegación secundaria/footer si ayuda a mantener el encabezado claro.

Móvil:
- Un menú principal coherente, búsqueda y acceso al carrito.
- Evitar menús duplicados de categorías, ayuda y ajustes que obliguen a adivinar dónde está cada opción.
- Categorías como enlaces reales; filtros móviles en Sheet según DESIGN.md.
- Los diálogos gestionan foco, cierre con Escape y retorno al disparador.

Configuración del visitante:
- Mantener preferencia de apariencia si existe.
- No mostrar ajustes internos ni acceso del personal como acciones principales de compra.
- El acceso del personal puede quedar discreto en footer o mediante su ruta directa.
- “Mis pedidos” debe encontrarse con facilidad y explicar el funcionamiento real sin exigir cuenta.

Ningún enlace visible debe llevar a una página inexistente, vacía o no publicada.

## 6. Arquitectura de páginas

Implementá o completá esta estructura según su utilidad real y la convención de rutas Remix:

| Ruta pública | Función |
| --- | --- |
| / | Portada para conocer la propuesta y descubrir productos |
| /catalogo | Catálogo completo con búsqueda, filtros y orden |
| /categoria/:slug | Categoría real con productos filtrados en SSR |
| /producto/:slug--id | Ficha individual; conservar identificador estable y enlaces actuales |
| /combo/:slug--id | Ficha del paquete con productos incluidos reales |
| /por-mayor | Explicación y cotización por WhatsApp, sin condiciones inventadas |
| /nosotros | Historia y forma de trabajar con datos reales |
| /contacto | Contacto, horario, ubicación de retiro y medios existentes |
| /ayuda | Índice útil de ayuda |
| /ayuda/como-comprar | Consulta por WhatsApp, carrito, registro y seguimiento |
| /ayuda/pagos-y-entregas | Diferencias Managua, Cargo Trans y retiro |
| /ayuda/garantia-y-cambios | Política aprobada y procedimiento de atención |
| /terminos | Condiciones revisadas y aprobadas |
| /privacidad | Tratamiento real de datos y servicios utilizados |
| /mis-pedidos | Consulta existente, sin indexación |
| /pedido/:id | Seguimiento existente, privado y sin indexación |
| /guias | Índice solo cuando existan guías publicadas |
| /guias/:slug | Contenido editorial útil y revisado |

No todas las rutas necesitan aparecer en el header. No generés páginas nuevas solo por completar una lista: cada página pública debe tener contenido suficiente, propósito y enlaces internos.

No dupliqués las políticas entre cinco páginas: definí un destino principal y resúmenes enlazados. Si no hay texto aprobado, prepará la estructura y dejala fuera de navegación e indexación hasta publicarla.

## 7. Portada: orden y contenido

La portada debe responder rápido qué vende la tienda, por qué confiar y cómo explorar o consultar. No debe convertirse en una página interminable de banners y políticas.

Orden recomendado, ajustable al catálogo real:

1. Presentación principal fija.
   - Un H1 específico y comprensible.
   - Una explicación breve del negocio y su ubicación.
   - Acción principal “Ver catálogo”.
   - Fotografía real de productos si aporta valor y cumple DESIGN.md.
   - La imagen no sustituye el texto HTML.
   - No usar la mascota como decoración del hero: DESIGN.md restringe sus usos.

2. Productos destacados.
   - Selección pequeña y editable por IDs del catálogo publicado.
   - Fotos, nombre, precio y estado reales.
   - No repetir todo el catálogo ni copiar precios al contenido de portada.
   - “Destacados” no implica “más vendidos”; esa etiqueta necesita datos reales.

3. Categorías.
   - Solo categorías con contenido útil y productos publicados.
   - Nombre e imagen real si existe.
   - Enlace a su página correspondiente.

4. Ofertas o combos.
   - Mostrar únicamente si hay ofertas vigentes o paquetes reales.
   - Sin precios anteriores inventados ni contadores de urgencia falsos.
   - Evitar que los mismos pocos productos llenen todas las secciones.

5. Cómo comprar.
   - Ver productos.
   - Consultar o registrar pedido.
   - Coordinar pago y entrega.
   - Enlace a la explicación completa.

6. Asesoría y mayoreo.
   - Mensaje breve con una salida clara a WhatsApp.
   - Sin convertir cada bloque en una tarjeta idéntica con un botón principal.

7. Confianza y preguntas frecuentes.
   - Resúmenes verdaderos de garantía, atención y entrega.
   - Reseñas solo si existen y puede verificarse su origen.
   - Un grupo breve de preguntas útiles, enlazadas a ayuda.

8. Footer.

El primer tramo de la página debe permitir llegar a productos sin recorrer un anuncio de pantalla completa. No impongas una altura fija que falle en 360 px o con textos más largos.

Si faltan fotos, reseñas o contenido, omití el bloque correspondiente o permití prepararlo como borrador. No inventes material para llenar espacios.

## 8. Catálogo, búsqueda y categorías

- Reutilizá la lógica y componentes existentes para que portada y catálogo consuman la misma información.
- Cada consulta compartida debe reproducir su estado al abrirse directamente.
- /catalogo y /categoria/:slug deben traer sus productos y contexto correctos en el HTML inicial.
- No depender de useEffect, Redux o hidratación para decidir qué productos pertenecen a la categoría solicitada.
- El buscador del header lleva al catálogo con el término correcto.
- Búsqueda tolerante a espacios y diferencias razonables de escritura; no introduzcas un motor externo sin necesidad.
- Filtros proporcionados a datos existentes: categoría, precio, disponibilidad y otros atributos solo si están modelados y son útiles.
- No construyas filtros de marcas o características con valores inventados.
- Contador de resultados, filtros activos, limpiar filtros y estados vacíos comprensibles.
- Conservar estado al volver desde una ficha, abrir en nueva pestaña o compartir.
- Ordenamientos con criterio real. No “más vendidos” o “mejor valorados” sin fuente.
- Si hay paginación, sus páginas deben ser accesibles mediante enlaces y tener política de indexación coherente.
- No ocultar productos al buscador detrás de scroll infinito como único acceso.
- Enlaces de producto con texto significativo y URL real.

Categorías:
- Título específico.
- Introducción breve, útil y propia de la categoría.
- Productos reales.
- Enlaces a guías relacionadas cuando existan.
- Nada de párrafos repetidos cambiando el nombre de la categoría.
- No crear páginas para cada ciudad, sinónimos o combinación de filtros con el fin de inflar URLs.

## 9. Fichas de producto y combos

Revisá las fichas existentes y completá lo que falte:
- Nombre real del modelo.
- Galería principal, miniaturas, ampliación y fotos por color cuando existan.
- Descripción clara de qué es y para qué sirve.
- Precio real y variaciones correctas.
- Opciones por nombre y muestra visual accesible; el color no debe ser la única identificación.
- Disponibilidad legible.
- Compatibilidad, especificaciones verificadas, contenido de la caja y advertencias relevantes.
- Diferenciar descripción pública de notas internas.
- No inventar especificaciones, certificaciones, resistencia al agua o compatibilidades.
- Enlace a entrega y garantía cerca de la decisión de compra.
- Relacionados útiles y limitados al catálogo real.
- Breadcrumbs visibles.

Jerarquía aprobada para productos disponibles:
- «Consultar por WhatsApp» (variante `whatsapp`) como acción principal.
- «Agregar al carrito» (`outline`) como acción secundaria, del mismo alto.
- Una acción principal por contexto conforme a DESIGN.md; no dos botones compitiendo con el mismo peso.
- La tarjeta del catálogo va sin botones: toda la tarjeta abre la ficha.
- Volvé a medir `add_to_cart` y `whatsapp_open` (salieron de `ANALYTICS_EVENT_TYPES` y de la restricción de `analytics_events`) para comparar pedidos registrados antes y después del cambio.

El mensaje de WhatsApp debe incluir nombre, enlace y variante si se eligió. Debe permitir pedir asesoría, fotos o videos sin fingir que ya se creó un pedido. Abrir WhatsApp no envía el mensaje automáticamente.

Disponibilidad:
- Nunca mostrar conteos exactos de stock en la interfaz.
- Usar Disponible, Próximamente, Agotado o Consultar disponibilidad según la lógica real.
- Próximamente no muestra precio ni oferta.
- Próximamente y Agotado no se pueden pedir.
- Para esos estados, “Avisame cuando haya” debe conservar el flujo CRM existente y no enviar mensajes automáticos.
- Consultar disponibilidad no equivale a afirmar que hay stock.

Combos:
- Listar exactamente los productos y cantidades incluidos.
- Enlazar a sus fichas cuando corresponda.
- Aclarar variantes o limitaciones reales.
- Precio del paquete y ahorro solo si están calculados con datos válidos.
- No reemplazar todo esto por un nombre y una fotografía genéricos.

## 10. Carrito, registro y seguimiento de pedidos

Preservá el funcionamiento transaccional existente y mejorá la claridad:
- Fotos, variantes, cantidades y montos correctos.
- Subtotal de productos.
- Descuento real, si aplica.
- Envío pendiente de cotizar, sin usar cero como si fuera gratis.
- Total de productos claramente separado de un total definitivo con transporte.
- No prometer cobro en línea cuando el pago se coordina por WhatsApp.

Distinguí retiro, delivery Managua y Cargo Trans con un modelo compatible con los pedidos anteriores. El esquema actual tiene retiro/envío; no supongas que alcanza con cambiar una etiqueta.

Antes de registrar el pedido, explicar:
- Managua: transporte cotizado y pago al recibir mediante efectivo o transferencia.
- Cargo Trans: producto pagado antes del despacho y transporte separado después del comprobante.
- Retiro: datos confirmados de ubicación y coordinación, sin condiciones inventadas.

Conservar:
- Registro real de pedido en la plataforma.
- Código de pedido.
- Enlace de seguimiento.
- Explicación de que el usuario debe enviar el mensaje al abrir WhatsApp.
- Consulta de pedidos sin obligar a crear cuenta.
- Protección de datos personales y límites de abuso existentes.

Si se agregan campos de operación:
- Estado del pedido, estado logístico y pago son conceptos distintos.
- Producto pagado no implica transporte pagado.
- Subir un comprobante no acredita automáticamente recepción del dinero.
- Registrar pedido o marcarlo entregado tampoco confirma el pago.
- Guardar cotización/transporte sin alterar el precio histórico de los productos.
- Permitir registrar comprobante de Cargo Trans y referencia de envío de forma privada; no asumir integración con la empresa.
- Registrar fecha real de recepción con trazabilidad para el inicio de garantía.
- No usar fecha de creación, pago o despacho como si fuera recepción.
- Evitar rehacer contabilidad, ventas, comisiones o inventario para este rediseño; integrá lo imprescindible con las reglas actuales.

Las reservas, cambios de estado y eventuales liberaciones de stock deben seguir siendo consistentes y estar controlados por el servidor.

## 11. Footer y ayuda

Rediseñá el footer para que facilite orientación sin repetir páginas enteras.

Agrupación aprobada (DESIGN.md, sección 10):
1. Gyro Store: logo, descripción breve real (qué vende y dónde, con datos confirmados), Nosotros cuando exista y redes confirmadas. Reemplaza la frase «Comprar con confianza nunca estuvo tan cerca de vos…».
2. Comprar: catálogo, categorías útiles y mayoreo.
3. Ayuda: cómo comprar, pagos y entregas, garantía y cambios, mis pedidos y contacto, según contenido publicado.
4. Contacto: WhatsApp, correo real, punto de retiro con «Cómo llegar» y horarios de atención.

En móvil: Gyro Store y Contacto a todo el ancho, Comprar y Ayuda en dos columnas. Todo alineado a la izquierda (hoy está centrado) y sin desplegables.

Parte inferior:
- Privacidad y términos cuando estén aprobados y publicados.
- Copyright con nombre del negocio.
- «Diseñado por Ing. Gerald Aburto» se conserva, chico y en gris, sin resaltar.
- «Acceso del personal», que sale del menú del header.
- Preferencia de privacidad/analítica si el sistema la requiere y ya permite cambiarla.

Mover explicaciones extensas a ayuda; conservar solo resúmenes útiles cerca de producto/carrito. No dupliqués el mismo párrafo en cada columna. Evitar grandes huecos, texto centrado largo y listas interminables.

En móvil, grupos compactos y legibles; si usás desplegables, que funcionen con teclado y no oculten enlaces esenciales al rastreo.

No usar sellos ficticios, logos de tarjetas no aceptadas, certificados inventados o puntuaciones de reseñas sin verificar.

Ayuda debe ofrecer respuestas concretas a:
- Cómo consultar.
- Cómo registrar un pedido.
- Cómo ver su estado.
- Cómo se paga en Managua y por Cargo Trans.
- Cómo se cotiza y paga el transporte.
- Dónde está el punto de retiro.
- Cuáles son los horarios de atención.
- Cómo contactar por un problema o garantía.
- Cómo pedir una cotización mayorista.

No escribás respuestas definitivas para las condiciones pendientes de la sección 4.

## 12. Nosotros, contacto, mayoreo y reseñas

Nosotros:
- Explicar que es una tienda en línea de Managua.
- Describir asesoría, importación y atención con datos confirmados.
- Identidad amplia y crecimiento gradual, sin aparentar una empresa de tamaño no demostrado.
- Sin historia, nombres, fotografías del equipo ni fechas inventadas.

Contacto:
- Mantener formulario y CRM si ya existen.
- WhatsApp claramente identificable.
- Horarios reales.
- Dirección y enlace a Maps.
- Diferenciar punto de retiro de local comercial.
- No cargar un mapa embebido pesado si un enlace resuelve la necesidad.
- Formularios accesibles, con errores y confirmación reales.

Mayoreo:
- Página breve orientada a cotizar.
- Pedir información útil sin imponer mínimos no aprobados.
- Un enlace de WhatsApp con contexto basta si no se justifica un formulario adicional.

Reseñas:
El dueño compartió https://share.google/qvhuAxm4M6UU4rRGW.
- Verificá a qué perfil conduce y su relación con Gyro Store.
- Preferí enlace verificable al perfil como primer paso.
- Si proponés mostrar reseñas, verificá permiso, atribución y método permitido de obtención.
- No hagás scraping improvisado ni copies puntuaciones estáticas que parezcan actualizadas automáticamente.
- No inventes testimonios, estrellas, cantidad de compradores ni insignias.
- No agregues aggregateRating a productos usando reseñas generales del negocio.
- Si no se dispone de material verificable, omití el bloque.

## 13. Guías y contenido para SEO, AEO y GEO

No necesitamos publicar un blog por obligación. Prepará una sección de guías útiles cuando exista contenido que el dueño pueda mantener.

Posibles temas, sujetos a productos reales y datos verificables:
- Compatibilidad de conectores o accesorios.
- Diferencias entre modelos realmente vendidos.
- Qué incluye cada producto.
- Cuidado y uso.
- Cómo elegir según la necesidad.
- Cómo comprar y recibir pedidos desde departamentos de Nicaragua.

Cada guía:
- Resuelve una intención concreta.
- Tiene título y estructura claros.
- Incluye una respuesta directa donde corresponda.
- Usa tablas comparativas solo con datos respaldados.
- Enlaza a productos/categorías útiles sin convertirse en publicidad vacía.
- Identifica autor y fecha de revisión reales cuando se conozcan.
- Se actualiza si cambian productos o instrucciones.
- Puede incluir fotos o pruebas propias cuando existan.

No generés docenas de artículos con IA para llenar el sitio. No inventes experiencia de uso, mediciones, opiniones o pruebas del negocio. Las propuestas de contenido quedan como borradores hasta revisión factual.

No muestres “Guías” en el menú principal mientras no haya contenido publicado suficiente. No publiques archivos, etiquetas y categorías editoriales vacíos.

## 14. Configuración y administración del contenido

El dueño debe poder mantener la tienda sin cambiar código. Usá las capacidades existentes y agregá lo necesario sin construir un CMS genérico desproporcionado.

Organización por responsabilidad:
- Datos del negocio: nombre, contacto, dirección pública, Maps, horarios y redes.
- Pagos y entregas: métodos, modalidad Managua/Cargo Trans/retiro, textos y plazos confirmados.
- Políticas: contenido aprobado, borrador, fecha de actualización y publicación.
- Portada: textos, media, secciones visibles, orden y selección de productos por ID.
- Navegación y footer: destinos válidos y orden razonable.
- Páginas informativas y guías: título, slug, contenido, estado, imagen opcional y metadatos.
- SEO: valores automáticos por defecto y sobrescrituras justificadas, no una lista de campos técnicos obligatorios para todo.

Una sola fuente de verdad:
- No duplicar dirección, teléfono, horarios o garantía en constantes, componentes y páginas.
- No copiar precios ni disponibilidad al CMS.
- No alterar dirección de facturación/tickets inadvertidamente al agregar preferencias públicas.
- Si separás dirección documental y pública, migrá con compatibilidad y conservá los datos existentes.
- No exponer configuración interna, secretos o notas privadas en la respuesta pública.

El editor existente debe conservar:
- Borrador compartido en servidor.
- Un administrador editor a la vez.
- Bloqueo, heartbeat y vencimiento de sesión.
- Aviso de inactividad a los 13 minutos y cierre a los 15.
- Guardado del borrador, deshacer y rehacer.
- Vista previa aislada, incluyendo 360 px.
- Revisión antes de publicar.
- Versiones y restauración.
- Restaurar diseño no restaura precios, stock ni plantillas.

DESIGN.md fija tareas Portada, Productos, Combos y Carrito, y no se agregan tareas nuevas. Ubicación aprobada:
- Destacados: bloque de la tarea Portada.
- Horarios de atención: Configuración → Negocio, como campo opcional de `business_info` (JSON en `app_config`, sin migración).
- Pagos y entregas, garantía y cambios: Configuración → pestaña nueva «Atención», en su propia clave de `app_config` para no tocar facturas ni tickets. Cada política con estado Borrador o Publicada y fecha; reemplaza `app/lib/store-policies.ts`.
- Páginas de ayuda: estructura fija en código que lee esos datos; no se construye un editor de páginas.
- Guías: cuando exista la primera guía real.

Los campos nuevos deben ser compatibles con configuración, borradores y versiones antiguas. No debe perderse una publicación anterior por cambiar el esquema.

Validá enlaces y contenido. Prohibí URLs peligrosas, sanitizá texto enriquecido y comprobá permisos en backend. Un borrador no debe aparecer por error en API pública, sitemap o caché.

## 15. SEO técnico: requisitos de implementación

La tienda ya tiene SSR. Mejoralo; no propongas rehacer todo suponiendo que es una SPA sin HTML útil.

### HTML inicial y semántica

- Contenido principal, enlaces y contexto deben llegar en HTML inicial.
- Un H1 principal claro por página y jerarquía ordenada de H2/H3.
- Usar header, nav, main y footer adecuadamente.
- Enlaces reales con href para navegar.
- Botones para acciones, no para simular todos los enlaces.
- Idioma español adecuado para Nicaragua; considerar lang es-NI.
- No crear idiomas, hreflang ni páginas internacionales sin contenido real para ellos.
- Precio, disponibilidad y categoría deben coincidir entre SSR y la interfaz hidratada.

### Metadatos

- Títulos específicos por tipo de página y producto.
- Descripciones útiles tomadas de contenido real, con fallback cuando falte texto o venga vacío.
- No tratar longitudes de título/descripción como límites rígidos de ranking.
- Canonical absoluto y único.
- Origen público desde configuración confiable; no reflejar libremente Host o parámetros manipulables.
- Open Graph y tarjetas sociales con título, descripción, imagen y URL coherentes.
- Previews útiles al compartir por WhatsApp.
- No meta keywords ni texto oculto para buscadores.

### URLs, redirecciones y filtros

- Conservar IDs estables y enlaces ya compartidos.
- La presencia del ID en una URL no exige eliminarlo para tener SEO.
- Corregir slugs no canónicos con redirección permanente hacia su URL correcta, sin bucles.
- Actualizar enlaces internos a los nuevos destinos.
- Definir migración de /?categoria=slug hacia categorías reales cuando corresponda.
- Los fragmentos como /#catalogo no llegan al servidor: resolver compatibilidad de forma consciente; no afirmar que un redirect HTTP puede leer ese fragmento.
- Definir una matriz clara de indexación/canonical por home, catálogo, categoría, búsqueda, filtros, orden y paginación.
- Evitar miles de URLs indexables por combinaciones de facetas.
- Búsqueda interna y filtros de escaso valor no deben competir con páginas de categoría.
- No aplicar canonical a la primera página de todas las páginas de una categoría paginada.
- No mezclar noindex y canonical de forma contradictoria para intentar resolver todo.
- No bloquear el rastreo de una URL si necesitás que Google lea su noindex para retirarla.

### Sitemap y robots

- Implementar /sitemap.xml válido con Content-Type adecuado.
- Incluir solo URLs públicas, canónicas, publicadas y con contenido real.
- Excluir pedidos, panel, login, auth, borradores, previews y búsquedas internas.
- Usar lastmod de cambios reales cuando exista, no la hora actual para todas las URLs en cada petición.
- Implementar /robots.txt coherente e incluir la URL del sitemap.
- Revisar si Cloudflare reemplaza o modifica el robots que llega al público.
- Robots no sustituye autenticación ni autorización.
- No bloquear Googlebot o Bingbot por accidente.

### Estado HTTP y caché

- 404 para recurso realmente inexistente; 410 solo si tiene sentido por eliminación permanente.
- 5xx/503 para fallos temporales que impiden servir el contenido principal.
- No convertir un fallo de API en una categoría vacía, producto inexistente o página exitosa engañosa.
- La caída de un bloque accesorio no necesariamente debe derribar una ficha válida.
- Conservar páginas útiles de productos agotados cuando corresponda; no eliminarlos automáticamente del índice.
- Noindex en panel, login, auth, pedidos, vistas previas y otros recorridos privados.
- Proteger previews/borradores y aplicar caché privada/no-store donde corresponda.
- Nunca servir datos de otro usuario, pedidos o borradores desde caché pública.
- Desarrollo/staging deben estar protegidos y sin indexación, sin trasladar ese bloqueo a producción.

## 16. Datos estructurados

Aprovechá el Product JSON-LD existente; no agregues varios generadores contradictorios.

Implementar según corresponda:
- Organization o un tipo de negocio adecuado y verificable.
- WebSite con identidad básica.
- BreadcrumbList en páginas con recorrido visible.
- Product y Offer para productos reales.
- ProductGroup y variantes solo si el modelo de datos y las reglas actuales lo justifican.
- Article en guías publicadas cuando corresponda.
- ItemList en listados si aporta descripción correcta, sin venderlo como garantía de resultados enriquecidos.

Reglas:
- Precio, moneda NIO, variante, disponibilidad y URL deben coincidir con lo visible.
- No declarar InStock cuando la disponibilidad es desconocida.
- Próximamente no publica una oferta ni un precio ficticio.
- Revisar el rango de AggregateOffer: no incluir precios cero de variantes próximamente como si fueran ofertas reales.
- No inventar GTIN, MPN, SKU, marca, condiciones, fechas o certificaciones.
- No agregar reseñas o puntuaciones sin respaldo.
- No declarar dirección de tienda física abierta ni atributos de local comercial que el negocio no cumple.
- No poner envío gratis, plazos estructurados o políticas de devolución que contradigan la operación.
- Evitar MerchantReturnPolicy u otros campos comerciales incompletos o sin aprobación.
- Serializar JSON-LD de forma segura y compatible con la CSP/nonce existente.

A octubre de 2026 Google retiró los resultados enriquecidos de FAQ. Conservá preguntas frecuentes útiles para personas; no prometás rich results por agregar FAQPage ni lo tratés como requisito especial de AEO. Verificá la documentación vigente al implementar.

Fuentes: [Product en Google Search](https://developers.google.com/search/docs/appearance/structured-data/product), [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization) y [actualizaciones oficiales de Search Central](https://developers.google.com/search/updates).

## 17. AEO, GEO y acceso de asistentes de IA

SEO, AEO y GEO comparten una base: contenido accesible, claro, comprobable y enlazado. No existe una configuración que garantice que Google o una IA recomienden la tienda.

Aplicación práctica:
- Explicar con texto real qué vende Gyro Store y dónde opera.
- Información comercial coherente en producto, ayuda, contacto y footer.
- Responder preguntas de compra, compatibilidad, pago, envío y garantía.
- Fichas completas y guías con información verificable.
- Identidad consistente del negocio y enlaces a perfiles oficiales.
- HTML accesible sin depender de una sesión.
- Nada de contenido oculto o distinto solo para bots.
- No esconder información importante únicamente dentro de imágenes.
- Revisar que CDN, firewall o desafíos no impidan a rastreadores legítimos acceder a páginas públicas.

Google indica que sus funciones de IA usan los fundamentos de SEO y no requieren un esquema especial ni archivos de IA adicionales. No hagas de llms.txt un requisito de lanzamiento ni una promesa de posicionamiento.

OpenAI:
- OAI-SearchBot corresponde a búsqueda.
- GPTBot corresponde al uso de contenido para entrenamiento; es una decisión independiente.
- ChatGPT-User corresponde a determinadas acciones iniciadas por usuarios.
- Facilitar búsqueda no autoriza automáticamente entrenamiento.
- No cambies la preferencia existente sobre entrenamiento sin una decisión del dueño.
- Si configurás reglas por agente, preservá las restricciones de rutas necesarias; no uses un Allow global específico que desproteja lo bloqueado en otro grupo.
- Verificá las instrucciones e IPs oficiales vigentes antes de proponer reglas de firewall.
- No desactives globalmente protecciones de Cloudflare para permitir bots.
- Para Bing, Perplexity o Claude, verificá documentación oficial y distinguí búsqueda, acciones de usuario y entrenamiento antes de proponer reglas.

Fuentes: [funciones de IA y sitios web](https://developers.google.com/search/docs/appearance/ai-features), [guía de optimización para IA de Google](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) y [rastreadores de OpenAI](https://developers.openai.com/api/docs/bots).

Lo que dependa de Cloudflare, DNS o cuentas externas se informa como acción pendiente concreta; no afirmés haberlo cambiado desde el código.

## 18. SEO local, Google y elegibilidad comercial

- Mantener nombre, dirección pública y teléfono consistentes con los datos confirmados.
- Usar Managua/Nicaragua donde aporte contexto, sin repetir palabras artificialmente.
- No crear páginas clonadas para todas las ciudades.
- Verificar el perfil compartido por el dueño antes de usarlo como perfil oficial del negocio.
- No crear ni modificar un Perfil de Empresa de Google sin autorización y sin revisar elegibilidad.
- Ser tienda en línea con entregas no basta por sí mismo para asumir elegibilidad de local o de área de servicio.
- No presentar la vivienda como establecimiento abierto con señalización y atención presencial si eso no está confirmado.

Merchant Center:
- No asumir que Nicaragua, NIO, el modelo de pedido o las fichas son elegibles para todas sus funciones.
- Verificar países, monedas y requisitos de compra vigentes antes de proponer un feed.
- Separar SEO orgánico de admisión a Merchant Center.
- No convertir Merchant Center en un requisito para lanzar la tienda.
- No prometer Google Shopping o listados gratuitos sin esa comprobación.

Fuentes: [directrices de Perfil de Empresa](https://support.google.com/business/answer/3038177?hl=es), [idiomas y monedas admitidos en Merchant Center](https://support.google.com/merchants/answer/160637?hl=es) y [requisitos de las fichas gratuitas](https://support.google.com/merchants/answer/12160471?hl=en).

## 19. Rendimiento y accesibilidad

Conservar las reglas de DESIGN.md:
- Chivo y Chivo Mono para códigos.
- Paleta por tokens; sin valores de color sueltos.
- Una acción principal por contexto.
- Claro por defecto y revisión en oscuro.
- Tienda desde 360 px.
- Objetivos táctiles de 44 px.
- Foco visible, navegación por teclado y contraste adecuado.
- Movimiento reducido según preferencia del sistema.
- Componentes compartidos sin estilos locales duplicados.
- Nuevos formularios con React Hook Form y Zod.
- Fotos completas con object-contain y especificaciones de imagen del diseño.

Rendimiento:
- Medir antes y después; no afirmar puntuaciones actuales que no se midieron.
- Objetivos de campo p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- Distinguir medición de laboratorio de datos reales de usuarios.
- Priorizar imagen principal visible y evitar lazy loading del recurso LCP.
- Usar lazy loading en medios fuera de pantalla.
- Revisar srcset/sizes, dimensiones, formato y tamaños transferidos.
- La imagen original debe cumplir el diseño; servir variantes menores cuando haga falta.
- No precargar todos los productos de varios carruseles.
- Evitar video automático pesado, embeds innecesarios y librerías nuevas sin justificar.
- Verificar caché, carga de fuentes, saltos de layout y JavaScript de la tienda.
- No enviar dependencias del panel al público sin necesidad.

Accesibilidad:
- Referencia WCAG 2.2 AA.
- Etiquetas persistentes, mensajes comprensibles y errores asociados a campos.
- Íconos decorativos ocultos a lectores; controles con nombre accesible.
- Alt útil en producto, sin repetir palabras clave.
- Estados de disponibilidad y selección no comunicados solo por color.
- Galería, variantes, filtros, menús y carrito utilizables con teclado.
- Comprobar zoom, textos largos y movimiento reducido.
- WhatsApp flotante o barra de compra móvil no deben tapar navegación, consentimiento ni contenido.

Fuentes: [Core Web Vitals](https://web.dev/articles/vitals) y [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 20. Medición, privacidad y contenido externo

Reutilizá la analítica existente antes de integrar herramientas nuevas.

Medir, con consentimiento y sin datos personales:
- Exploración de catálogo y categorías.
- Búsquedas y búsquedas sin resultados.
- Vistas de producto.
- Clic de consulta por WhatsApp.
- Agregar al carrito.
- Inicio y registro exitoso de pedido.
- Uso de mayoreo y ayuda si aporta decisiones concretas.

No equiparar clic de WhatsApp con mensaje enviado, pedido registrado o venta pagada. No enviar teléfono, nombre, dirección, comprobantes ni códigos privados en eventos, URLs de analítica o metadatos.

Conservar consentimiento y exclusión del personal; revisar también vistas previas y rutas de pedidos. No agregar píxeles ni scripts de terceros por defecto.

Para medir SEO, pedir acceso de lectura o indicar acciones del dueño en Search Console/Bing Webmaster Tools si no está disponible. No inventar datos de indexación, volumen, CTR, posición o consultas.

No prometer una métrica separada de tráfico de IA si la herramienta no la expone de forma verificable. Diferenciar referencias detectables y búsquedas/citaciones que no generan clic.

Privacidad debe describir el tratamiento real: formularios, pedidos, seguimiento, analítica consentida, WhatsApp y proveedores efectivamente usados. Los datos legales o plazos de conservación no confirmados quedan pendientes, no se completan con texto genérico.

## 21. Integración técnica y archivos de referencia

Stack actual a verificar:
- Monolito Express/TypeScript/ESM.
- Remix 2, React 18, Vite, Tailwind.
- RTK Query para la API.
- Supabase en servidor, con RLS cerrado.
- R2 para imágenes.
- Login del personal mediante Supabase Auth/Microsoft.

El navegador nunca consulta directamente las tablas. La service_role nunca llega al frontend. Los cambios deben respetar permisos y validación en servidor.

Rutas y componentes relevantes encontrados:
- App/frontend/app/routes/_index.tsx
- App/frontend/app/routes/producto.$id.tsx
- App/frontend/app/routes/combo.$id.tsx
- App/frontend/app/routes/contacto.tsx
- App/frontend/app/routes/mis-pedidos.tsx
- App/frontend/app/routes/pedido.$id.tsx
- App/frontend/app/routes/admin.configuracion.tsx
- App/frontend/app/routes/admin.estilo.tsx
- App/frontend/app/routes/admin.pedidos-web.tsx
- App/frontend/app/components/storefront/
- App/frontend/app/components/catalog/
- App/frontend/app/components/product/
- App/frontend/app/components/cart/
- App/frontend/app/components/editor/
- App/frontend/app/components/admin/config/
- App/frontend/app/lib/store-policies.ts
- App/frontend/app/lib/formatters.ts
- App/frontend/app/lib/analytics.client.ts
- App/frontend/app/state/api/
- App/frontend/app/state/slices/builder-slice.ts
- App/shared/schemas/
- App/server/modules/catalog/
- App/server/modules/combos/
- App/server/modules/orders/
- App/server/modules/settings/
- App/server/modules/store-editor/
- App/frontend/app/entry.server.tsx
- App/server/core/serve-frontend.ts
- App/server/index.ts

Patrones obligatorios:
- Esquemas Zod compartidos antes del handler.
- Rutas finas y servicios por dominio.
- Autorización real en backend.
- Frontend por API; sin acceso directo a tablas.
- Precios recalculados en servidor.
- Checkout mediante IDs/cantidades; no confiar en montos del cliente.
- Idempotencia de registro de pedido y operación atómica.
- Defensa contra sobreventa y consistencia de reservas.
- No exponer costos, notas internas o información privada.
- Nombres kebab-case; excepción de rutas Remix.

Cambios de base:
- Seguir App/database/README.md.
- Nueva migración incremental e idempotente y mismo cambio en 01_schema.sql.
- Al analizar se documentaba 0032 como siguiente número; verificar disponibilidad antes de usarlo.
- No reescribir migraciones ya aplicadas.
- RLS y permisos solo de servidor para nuevas tablas/funciones.
- No correr 01_schema.sql sobre una base con datos.
- No ejecutar seeds que publiquen productos en una base no verificada.
- La migración financiera 0018_loan_payments_a_gastos.sql es ajena a este encargo y requiere autorización específica; no ejecutarla.
- No trasladar migraciones a historial como si se hubieran aplicado en producción si solo se probaron localmente.

## 22. Hallazgos previos que debés comprobar

No son una orden de modificar a ciegas; pueden haber cambiado.

Resuelto en la fase A (14 de octubre de 2026; comprobalo en el código antes de rehacerlo; requiere `APP_URL` en Render): canonical y `og:url` desde `APP_URL` (`app/lib/site-url.server.ts`, `shared/site-url.ts`), `config.appUrl` con `APP_URL` antes que `RENDER_EXTERNAL_URL`, `/robots.txt` y `/sitemap.xml` como rutas de Remix (`app/lib/seo.ts`), 301 al slug canónico en producto y combo, 404/503 en combo, 503 sin caché en la home si falla el catálogo, JSON-LD sin variantes próximas ni precios cero, Organization y WebSite en la home, `noindex` en panel, login, auth y vista previa, y `lang="es-NI"`.

Comprobado el 14 de octubre de 2026 y todavía externo al código:
- `gyrostorenic.com` y `www` están en *Proxied* hacia Render, que también usa Cloudflare (O2O): primero aplican los ajustes de la zona propia (caché, robots administrado, bots) y después los de Render. Por eso el DNS público muestra IPs de Render.
- Antes del deploy, `/robots.txt` devolvía solo el preámbulo de content signals, sin reglas. Con el servicio dormido (15:30 UTC) devolvió `User-agent: *` / `Disallow: /` y quedó en caché 4 horas. Está en Docs/05-Pendientes.
- El servicio real es `gyro-store-3sr6.onrender.com`. `gyro-store.onrender.com` sirve una versión anterior y `gyro-store-prod.onrender.com`, destino de los CNAME de `gyrostorenic.com` y `www`, no tiene servidor.
- El plan free de Render duerme el servicio; en frío la portada tardó más de 20 s.

Vigentes:
- La home ya usa loader SSR para catálogo/configuración/portada.
- Los loaders piden la API por el origen de la petición (`${origin}/api/...`): en producción cada SSR sale a Cloudflare y vuelve. /catalogo, las categorías y el sitemap multiplican esas vueltas; evaluá llamar a los servicios en el mismo proceso.
- Home/producto/combo usan caché pública, que requiere cuidado al añadir borradores o personalización.
- El menú de ajustes público mezcla ayuda, apariencia y acceso del personal.
- El footer incluye varios párrafos comerciales que pueden pasar a ayuda.
- Datos generales de configuración se usan también en tickets y facturas.
- La interfaz no debe mostrar stock exacto; el contrato público actual sí puede incluir cantidades para lógica de compra. No afirmes que el dato ya está ausente de todas las APIs ni lo elimines sin revisar consumidores.
- Ya hay dimensiones, alt y lazy loading en varias imágenes. La optimización pendiente debe medirse; no asumir que todo está mal.
- No se hizo una auditoría visual interactiva completa ni una medición de Core Web Vitals.
- No se inspeccionaron las cuentas de Search Console, Cloudflare o DNS.

Confirmá cada hallazgo relevante y corregí lo que siga vigente.

## 23. Orden de implementación

Trabajá por fases, cada una revisable y commiteable por separado (el dueño revisa y commitea entre una y otra):

- A. SEO técnico sin cambios visuales. Hecha el 14 de octubre de 2026 (ver sección 22).
- B. /catalogo y /categoria/:slug con productos en el HTML inicial; 301 de /?categoria=x a /categoria/x y de /?q= a /catalogo?q=; /#catalogo sigue como ancla de los productos de la portada; categorías en el sitemap y BreadcrumbList en listados y ficha. Hecha el 14 de octubre de 2026 (ver Docs/02-Arquitectura, «Catálogo»).
- C. Portada (Presentación, Destacados, Novedades), header, tarjeta, ficha, footer, ayuda, contacto, por mayor, horarios y pestaña Atención en Configuración. Hecha el 14 de octubre de 2026 (ver Docs/01-Producto y Docs/02-Arquitectura, «Contenido editable»). Nosotros, Términos y Privacidad esperan textos reales (Docs/05).
- D. Entrega Managua, Cargo Trans o retiro y fecha real de recepción en pedidos, y vuelta de `add_to_cart`/`whatsapp_open`, todo en la migración 0032. Hecha el 14 de octubre de 2026 (ver App/database/README.md y Docs/02-Arquitectura, «Pedido de la tienda»). El comprobante de Cargo Trans se guarda como número de guía; subir la foto necesita almacenamiento privado (hoy R2 es público).
- Guías, reseñas y políticas legales: cuando haya contenido aprobado.

Dentro de cada fase seguí este orden cuando aplique: verificar reglas y estado, definir fuente de datos y compatibilidad, implementar, completar accesibilidad y medición, y verificar recorridos completos. El orden puede ajustarse por dependencias. No dejés el editor desincronizado de la portada ni generés temporalmente páginas públicas con información comercial falsa.

Guías sin contenido validado, reseñas, política pendiente y configuraciones externas pueden quedar preparadas pero sin publicar; identificá exactamente qué falta. No lo uses como motivo para dejar incompleto el resto.

No agregar como parte de este trabajo:
- Newsletter sin operación real.
- Cuentas obligatorias para compradores.
- Favoritos, puntos, afiliados o suscripciones.
- Integración automática de WhatsApp o Cargo Trans.
- Pasarela de pago.
- Traducciones.
- Subdominios innecesarios.
- Una plataforma editorial compleja.
- Una reorganización de contabilidad, finanzas o todo el backend.

Si considerás alguna de esas funciones necesaria, justificála como propuesta separada.

## 24. Verificación y criterios de aceptación

Usá los scripts vigentes. Al momento de preparar este encargo, desde la raíz funcionan estos comandos:

~~~bash
npm --prefix App run typecheck
npm --prefix App test
npm --prefix App/frontend run check
npm --prefix App/frontend test
npm --prefix App/frontend run build
~~~

El check del frontend incluye tipos, lint y verificación de diseño. No existe un check equivalente en la raíz; comprobá package.json antes de cambiar los comandos.

No hace falta escribir tests cosméticos para cada texto o clase. Agregá pruebas donde aporten garantía real:
- Filtros SSR y metadatos de categoría.
- Canonical, redirecciones, noindex, robots y sitemap.
- Precio/rango/stock y datos estructurados.
- Selección Managua/Cargo Trans/retiro y claridad de montos.
- Compatibilidad de pedidos y configuraciones antiguas.
- Persistencia, borrador, publicación y restauración del editor.
- Idempotencia y reglas transaccionales si se modifican.

Comprobación funcional:
- Inicio claro y rápido de recorrer, con productos visibles temprano.
- Catálogo separado y búsqueda compartible.
- Categorías con HTML inicial correcto.
- Fichas completas y variantes coherentes.
- WhatsApp con contexto correcto.
- Registro de pedido real y seguimiento existente sin cuenta.
- Envío cotizado separado de producto.
- Condiciones distintas de pago Managua/Cargo Trans.
- Avisos de disponibilidad conservados.
- Footer compacto, con enlaces funcionales.
- Datos de contacto y horarios consistentes.
- Contenido editable y publicación compatible.
- Ningún borrador, comprobante o dato de cliente en HTML público, caché o sitemap.
- Ninguna cláusula pendiente publicada como si estuviera aprobada.

Comprobación visual:
- Tienda a 360 px, otro ancho móvil, tableta y escritorio.
- Panel a 1280 y 1440 px en las pantallas afectadas.
- Claro y oscuro.
- Solo teclado.
- Zoom y textos largos.
- Sin desbordes horizontales ni controles tapados.
- Estados de carga, vacío, error, sin resultados y sin disponibilidad.
- Comparar con las reglas y página de muestra del proyecto cuando corresponda.

Comprobación técnica:
- Revisar el HTML recibido mediante petición directa, no solo el DOM después de hidratar.
- Comprobar códigos HTTP, cabeceras y ausencia de datos privados.
- Validar JSON-LD y las funciones compatibles en Rich Results Test/Schema Validator.
- Verificar previews sociales.
- Medir rendimiento y accesibilidad con herramientas disponibles, explicando condiciones.
- Revisar que contenido y enlaces son los mismos para personas y rastreadores.
- Si una herramienta o credencial no está disponible, decir qué prueba no se hizo; no declararla aprobada.

Para probar localmente, el proyecto usa dos procesos en App/: npm run dev y npm run dev:frontend. Usar GYRO_ENV_FILE o App/.env según la configuración existente; no crear ni imprimir credenciales. No correr seeds ni modificar datos reales para simular pruebas.

## 25. Entrega esperada

Al finalizar, explicá de forma concreta:
1. Qué cambió y qué problema resuelve.
2. Qué rutas y capacidades nuevas funcionan.
3. Cómo edita el dueño la portada, ayuda, horarios, políticas y footer.
4. Qué se conservó del editor y de los pedidos existentes.
5. Qué migraciones se prepararon y dónde se probaron.
6. Qué verificaciones pasaron y cuáles no se pudieron realizar.
7. Qué contenido o decisiones quedan pendientes del dueño.
8. Qué pasos externos faltan, si aplica: Search Console, sitemap, Cloudflare u otros.
9. Cómo abrir y revisar localmente el resultado.
10. Qué cambios de DESIGN.md corresponden a decisiones realmente aprobadas.

No afirmés que Google ya indexó la tienda, que apareció en una IA o que mejoró el tráfico por haber terminado el código. Separá implementación verificable de resultados que solo se podrán medir después.

No marques el trabajo completo si siguen rotos recorridos incluidos en el alcance. Presentá limitaciones concretas y continuá con todo lo que pueda resolverse dentro de la autorización.

Empezá ahora: inspeccioná el proyecto, mostrá el plan breve y realizá la implementación autorizada, respetando los puntos pendientes y las reglas del repositorio.

