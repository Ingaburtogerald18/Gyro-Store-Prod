# Gyro Store · Reglas de diseño

Este es el único documento de diseño del proyecto. Vale para la tienda y para el panel.

- Si el código no cumple una regla, se arregla el código.
- Si una regla parece estar mal, se pregunta al dueño antes de cambiarla.
- Cuando el dueño decide algo nuevo, se cambia este archivo en el mismo commit y se anota en el registro del final.

## 1. Color

Los colores viven en `app/tailwind.css`, en el bloque de la paleta de marca. En los componentes se usa siempre el nombre del color, nunca el valor.

| Color | Nombre | Claro | Oscuro | Uso |
| --- | --- | --- | --- | --- |
| Tinta | `--ink`, `--foreground` | `#2a1d1d` | `#f4f4f2` | Texto. Contorno del botón principal (`--action-outline`: `#111111` en oscuro) |
| Crema | `--background` | `#fffcf3` | `#0e0f10` | Fondo de página |
| Blanco | `--card`, `--popover` | `#ffffff` | `#18191b` | Tarjetas, menús, ventanas |
| Rosa | `--rose`, `--muted`, `--selection` | `#f4ded9` | `#222326` (`--selection`: `#26272a`) | Fondo de lo elegido, encabezado de tablas, ofertas |
| Texto secundario | `--muted-foreground` | `#6e5a57` | `#a8a29e` | Etiquetas, ayudas, fechas |
| Amarillo | `--action` | `#ffc20e` | `#ffc20e` | Acción principal. Texto tinta (`#111111` en oscuro) |
| Bordó | `--bordo`, `--primary-2` | `#812c2c` | `#e8a09a` (rosa oscuro) | Selección, navegación, links, foco, precios, línea del header de la tienda |
| Sombra del botón | `--sticker-shadow`, `--header-cart-shadow` | `#812c2c` | `#812c2c` | Sombra dura del botón principal y del carrito |
| Teal del logo | `--logo`, `--success` | `#3dc5a9` | `#3dc5a9` | Logo, mascota, detalle del encabezado del panel y de formularios, punto de «Recibido», «Pagado», «Disponible» |
| Header | `--header-background` | `#fffcf3` | `#141517` | Fondo del header |
| Ofertas | `--promo` | rosa, texto bordó | `#3a2a2b`, texto rosa | Ofertas, con borde bordó de 1.5 px |
| Borde | `--border` | tinta 16 % | blanco 10 % | Tarjetas y separadores |
| Borde de campo | `--input` | tinta 48 % | blanco 34 % | Campos, selects, botones con borde |
| Relieve de tablas | `--table-edge`, `--table-groove`, `--table-shine`, `--table-shade`, `--table-lift` | tinta 26 %, tinta 20 %, blanco 95 %, tinta 5.5 % | blanco 20 %, negro 75 %, blanco 7 %, negro 22 % | Contorno, línea grabada, sombreado de fila y sombra de las tablas |
| Rojo | `--destructive` | `#d92d20` | `#f04438` | Errores, eliminar, cancelar y cerrar |
| Advertencia | `--warning` | `#915c08` | `#d99a2b` | Datos por completar, bajo margen |
| Información | `--info` | `#036eae` | `#3ba6f5` | Avisos neutros, en tránsito |
| WhatsApp | `--whatsapp` | `#027d34` | `#2ed264` | Solo los botones de WhatsApp |

Siempre:
- Amarillo solo para la acción principal: una por pantalla, por ventana o por tarjeta.
- Bordó para lo elegido y para dónde estás. En oscuro pasa a rosa oscuro, porque el bordó sobre negro es 2.1:1.
- Rosa nunca separa solo (contra el crema es 1.3:1): las tarjetas llevan borde.
- Teal en el logo, la mascota, una línea discreta de identidad en encabezados del panel y formularios, y el punto de éxito. Como texto no se lee (2:1): las etiquetas y el texto de éxito van en tinta.
- Rojo para errores, eliminar, cancelar y cerrar, siempre con ícono o texto.
- Los números van en color de texto. El color se reserva para estados.
- Gráficos con colores de la marca, en este orden: bordó, amarillo, tinta, rosa oscuro, gris.

Nunca:
- Valores sueltos en componentes (`#ffc20e`, `bg-yellow-400`, `rgb(...)`).
- Un color que no esté en esta tabla.
- Comunicar un estado solo con color: siempre con texto o ícono.
- Verde fuera de los usos del teal definidos en esta tabla y de WhatsApp.

## 2. Tipografía

Chivo para todo. Chivo Mono (`font-mono`) solo para códigos: SKU, número de orden, número de pedido.

| Rol | Clases |
| --- | --- |
| Titular del inicio | `font-heading text-4xl md:text-6xl font-extrabold tracking-tight` |
| Título de sección (tienda) | `font-heading text-2xl md:text-3xl font-bold tracking-tight` |
| Título de página (panel) | `font-heading text-2xl font-bold tracking-tight` |
| Título de tarjeta o ventana | `text-lg font-semibold` |
| Nombre de producto | `font-semibold` |
| Precio | `font-heading font-extrabold tabular-nums` |
| Métrica | `font-heading text-2xl font-extrabold tabular-nums` |
| Cuerpo | `text-sm` |
| Etiqueta, ayuda | `text-xs text-muted-foreground` |
| Mínimo | `text-2xs` (11 px), solo en mayúsculas con `tracking-wide` |

Siempre:
- Pesos 700 y 800 solo en títulos, precios y métricas.
- Cifras con `tabular-nums`.
- Montos y fechas con `app/lib/formatters.ts`: córdobas `C$1,710` (sin decimales en la tienda, con 2 en costos), dólares `$12.50`, fecha `28 abr 2026`, fecha y hora `28 abr 2026, 2:30 p. m.`.

Nunca:
- Tamaños sueltos (`text-[13px]`).
- `font-light` o `font-thin`.
- Formatear un monto o una fecha a mano en el componente.

## 3. Forma

| Qué | Valor |
| --- | --- |
| Esquinas de botones, campos y chips | 12 px (`rounded-xl`) |
| Esquinas de tarjetas, tablas y ventanas | 16 px (`rounded-2xl`) |
| Esquinas de paneles grandes de la tienda | 24 px (`rounded-3xl`) |
| Redondo completo | Solo puntos de estado, contadores y botones de ícono de la galería |
| Bordes | 1 px. 2 px solo en la opción elegida y en el botón principal |
| Sombras | Ninguna en tarjetas y campos. Tablas con relieve (sección 6). Dura (3 px) en el botón principal. Suave solo en menús y ventanas flotantes |
| Espacios | Múltiplos de 4 px. Panel: 20 px entre bloques (`gap-5`). Tienda: 24 a 32 px. Dentro de una tarjeta: 16 o 20 px |

Siempre:
- Toda tarjeta lleva borde. Blanco sobre crema no se distingue sin él (1.03:1).

## 4. Botones

| Variante | Aspecto | Para qué |
| --- | --- | --- |
| `default` | Amarillo, contorno tinta de 2 px, sombra dura bordó de 3 px | Acción principal |
| `outline` | Blanco, borde `--input`; al pasar el mouse, borde bordó | Acciones secundarias |
| `cancel` | Fondo de tarjeta, texto y borde rojos; al pasar el mouse, fondo rojo y texto de contraste | Cancelar y Cerrar, incluidas las X de cierre |
| `destructive` | Rojo suave | Eliminar, dentro de una confirmación |
| `whatsapp` | Verde WhatsApp con relieve | Escribir por WhatsApp como acción principal |
| `whatsappOutline` | Borde verde, sin relieve | WhatsApp como acción secundaria |
| `link` | Texto bordó subrayado al pasar | Acciones dentro de un texto |
| `ghost` | Sin fondo | Solo botones de ícono en barras y menús |

Tamaños: 44 px (`h-11`) en todos lados; 36 px (`size="sm"`) solo dentro de tablas.

Siempre:
- El botón dice lo que hace, con verbo: «Registrar compra», «Guardar cambios», «Agregar».
- Al presionar el botón principal, baja 2 px y la sombra pasa a 1 px.
- El botón principal siempre lleva su contorno: el amarillo contra el crema es 1.6:1.
- Las acciones de una orden de compra van juntas en un solo botón amarillo «Acciones ▾» (`RowActionsMenu` con `trigger="button"`), con «Recibir en Nicaragua» primero. En las filas de tabla sigue el menú ⋮ con borde.

Nunca:
- Dos botones amarillos en la misma ventana o tarjeta.
- Un botón amarillo dentro de una fila de tabla.
- La variante `secondary`.

## 5. Selección, chips y barra de herramientas

- Opción elegida (variante, filtro, vista, menú lateral): borde bordó de 2 px, fondo rosa y texto bordó en semibold. En oscuro, fondo `#26272a` y texto normal. Se marca con `aria-pressed`.
- Elegir vista: botones con borde marcados así. No pestañas ni grupos de botones distintos.
- Chips, solo cuatro tipos: estado (punto y texto), filtro activo (como la opción elegida, con ×), contador (amarillo) y categoría (suave).
- Barra de herramientas: tarjeta blanca con borde normal (`--border`), sin línea de color. Adentro: buscador, filtros, conteo y la acción principal a la derecha.

## 6. Tablas

- Se usa tabla siempre que se comparan registros por columnas. Tarjetas solo para productos con foto y para órdenes de compra.
- Piezas: `components/ui/table.tsx` para el aspecto y `DataTable` para buscar, ordenar y paginar.
- `DataTable` admite `layout="fixed"` para resúmenes con anchos de columna definidos; los textos largos se acotan dentro de la celda. El modo automático sigue siendo el predeterminado.
- Contenedor blanco, borde de 1 px (`--table-edge`), 16 px de esquina y sombra `shadow-table`, que la levanta del fondo.
- Dentro de una tarjeta, la tabla va con `embedded` (sin borde ni sombra) y la tarjeta pone el contorno; la orden de compra abierta lleva borde bordó al 80 % y `shadow-table`.
- Encabezado con fondo rosa, `text-xs font-semibold` en tinta, sin mayúsculas. Proyecta una sombra corta sobre la primera fila. Las columnas ordenables muestran la flecha.
- Filas de 52 px (40 px en modo compacto), `text-sm`, con relieve: cada fila se oscurece apenas hacia abajo y la línea entre filas va grabada (raya `--table-groove` con el brillo `--table-shine` debajo). Al pasar el mouse, rosa al 55 % (blanco al 4 % en oscuro).
- Columnas en este orden: código, descripción, números, estado, acciones.
- Productos de órdenes de compra: columna «Cantidad» después de Producto, separada del costo unitario y del total USD. El subtotal suma las cantidades en esa misma columna; si lo recibido difiere de lo pedido, se aclara debajo de la cantidad.
- Código con `CodeCell`: mono de 14 px, peso medio, en tinta. Producto: nombre en semibold y la variante debajo en `text-sm` gris.
- Un dato de apoyo debajo de un número (impuesto, unidades) va en `text-xs` gris.
- Números a la derecha. La moneda va en el encabezado si toda la columna es de una moneda.
- Totales en la última fila, en negrita, fijos abajo.
- Estado: punto de color y texto en tinta, a `text-sm`.
- Acciones al final, en un menú ⋮. Como mucho una acción visible por fila, con borde.
- Cabe en 1280 px sin scroll lateral. Si no cabe, las columnas secundarias se ocultan y se activan desde «Columnas».
- 25 filas por página. Abajo a la derecha: «1–25 de 230».

## 7. Formularios

- Cortos (hasta 6 campos): ventana `max-w-xl`. Largos: ventana `max-w-5xl` con secciones. Configuración: en la página.
- Diseño compartido en `components/ui/form-layout.tsx`: `FormDialogContent` con tamaño `short` o `long`, `FormLayout`, `FormBody`, `FormSection` y `FormActions`. `FormLayout mode="page"` para formularios dentro de una página; `FormPanel` para editores que guardan con callbacks. Cada formulario conserva sus campos, información, validación y acciones propias: se comparte la presentación.
- En ventanas, encabezado y pie quedan visibles; solo el cuerpo se desplaza. Encabezado y pie en blanco (`--card`), cuerpo en crema (`--background`), con los equivalentes neutros del modo oscuro. Línea fina teal en el encabezado, sin usarla como estado ni como texto.
- Secciones de formularios largos: tarjeta con borde, título `text-lg font-semibold`, ayuda `text-xs` y espacios de 20 px. Campos, etiquetas y acciones salen de los componentes compartidos, sin variantes locales de color o tamaño.
- Título con verbo y objeto: «Registrar compra». Nunca «Nuevo» ni «Formulario».
- Una columna. Dos solo para pares cortos (fecha y número, moneda y monto).
- Cada campo con `Field`: etiqueta arriba siempre visible, asterisco si es obligatorio, ayuda debajo solo si hace falta, error debajo en rojo diciendo cómo arreglarlo.
- Campos de 44 px. Montos con el símbolo adentro a la izquierda y `inputMode="decimal"`.
- Hasta 10 opciones: `Select`. Más de 10: `Combobox` con buscador.
- Pie: «Cancelar» (`cancel`, rojo) a la izquierda y la acción (`default`) a la derecha, alineados a la derecha. Las X de cierre usan la misma variante `cancel`.
- Mientras guarda, el botón se deshabilita y dice «Guardando…». Al terminar, se cierra y un aviso confirma («Compra registrada»).
- Si el servidor falla, el mensaje va arriba del formulario, sin cerrar ni perder lo escrito.
- Si hay cambios sin guardar, cerrar pregunta «¿Descartar los cambios?».
- Datos con react-hook-form y un esquema de validación. Obligatorio en formularios nuevos o reescritos.
- Excepción en el editor de tienda: el banner se edita en una ficha completa junto a la vista previa y actualiza el borrador de inmediato. Imagen, textos y botón quedan juntos; apariencia se despliega cuando hace falta. La tienda cambia solo al confirmar «Publicar cambios». Los formularios del carrito conservan su ventana centrada y, como el resto, guardan cada cambio en el borrador (cierran con «Listo»).
- Productos de órdenes: «Modelo del producto» usa autocompletado compacto, sin listado con el campo vacío. Desde 2 caracteres muestra hasta 4 coincidencias en un desplegable superpuesto, sin mover el resto del formulario; cada fila se elige completa y muestra nombre y categoría. La búsqueda tolera espacios, guiones y errores leves y exige elegir por ID. La plantilla elegida queda dentro del campo con marca de confirmación y «Cambiar», sin tarjeta adicional. Si no hay coincidencia exacta se permite crearla al final del desplegable con el nombre escrito; al guardar se selecciona sin perder cantidad ni costo. Buscar no vincula automáticamente modelos parecidos. La carga o el error de la lista nunca se presenta como ausencia de plantilla.
- Una plantilla por modelo: la creación y el cambio de nombre rechazan duplicados que difieren solo en mayúsculas, espacios o guiones; los sufijos de modelo, como Pro, se conservan. Las plantillas antiguas duplicadas no se fusionan ni pierden sus vínculos.

Nunca:
- El error de un campo en un aviso flotante.
- Una etiqueta que solo existe como texto gris dentro del campo.

## 8. Ventanas, avisos y estados

- Ventanas centradas (`Dialog`) para formularios y confirmaciones. Paneles laterales (`Sheet`) solo en la tienda: carrito y filtros en el celular.
- Confirmar solo lo que no se puede deshacer, diciendo qué se pierde: «¿Eliminar la orden LT12? Se borran sus 4 productos».
- Avisos flotantes solo para el resultado de una acción. Se van solos a los 4 segundos.
- Vacío: ícono, una línea que dice qué falta y la acción que lo llena.
- Cargando: esqueleto con la forma del contenido (`components/ui/skeletons.tsx`). Nunca solo un spinner.
- Error: qué pasó en palabras simples y un botón «Reintentar».

## 9. Íconos, movimiento e imágenes

- Íconos de HugeIcons con la propiedad `size`: 16 en botones y tablas, 20 en navegación, 24 en estados vacíos.
- Movimiento: 150 ms al pasar el mouse o presionar, 200 a 250 ms al abrir y cerrar. Sin rebotes.
- En el panel solo se mueven el botón principal, los bordes al pasar el mouse y las flechas al abrir.
- Todo movimiento respeta «reducir movimiento» del sistema.
- En la tienda las fotos van sobre el fondo liso del marco, sin círculo ni adorno detrás.
- Fotos de producto cuadradas, de 1000 × 1000 px como mínimo, fondo blanco, el producto cerca del 80 % de la foto, siempre completas (`object-contain`). La primera foto es el producto solo.
- Logo: sin recolorear ni deformar, mínimo 140 × 40 px.
- Mascota: solo en estados vacíos, error 404 y pedido confirmado.

## 10. Pantallas

Panel:
- Pensado para computadora desde 1280 px. En pantallas más chicas no se rompe, pero no se adapta.
- Encabezado: título de página y, a la derecha, la acción principal con su atajo (`<Kbd>N</Kbd>`).
- Debajo, bloques separados sobre el crema: barra de herramientas, métricas y contenido.
- Un elemento domina cada pantalla: la tabla, la lista de órdenes o el formulario.
- Inventario: vistas Compras, Stock actual, Plantillas y Combos. El vendedor solo ve Stock actual, en solo lectura y sin costos: precio de venta y el enlace a fotos y videos.
- Combos: nombre, precio del paquete y productos incluidos en Inventario (vista Combos); fotos y «Mostrar en la tienda» en la sección «Combos» del modo edición.
- Plantillas: tabla de modelos con resumen público de una línea, categoría, tipos de opción y conteo de productos vinculados/publicados. Las notas internas se consultan en la ficha. Edición en ventana centrada con información pública, opciones, ficha técnica y notas internas; vista previa pública de solo lectura al lado y acciones siempre visibles en el pie.
- Editor de tienda: navegación fija por tareas —Portada, Productos, Combos y Carrito— con una sola zona de edición activa. Barra superior con estado del borrador, deshacer, rehacer, versiones, vista previa y «Revisar cambios». Cada tarea muestra debajo de su nombre lo que queda pendiente (campos por revisar, productos o combos ocultos y sin fotos, carrito personalizado). Tamaño y tema de la vista previa en un solo menú; sin pie de página. Portada tiene un único panel de bloques/ficha a la izquierda y la tienda real aislada a la derecha; abrir un bloque reemplaza la lista por sus campos y «Volver a los bloques». Composiciones de banner preparadas (imagen a izquierda, derecha o arriba), sin posiciones libres. La vista móvil usa un ancho real de 360 px.
- Productos y Combos ocupan el área principal. Su ficha muestra fotos, visibilidad y una tarjeta de vista previa del borrador; los datos de referencia quedan en un bloque desplegable. La búsqueda y los filtros se conservan al volver al listado. Galerías con imagen principal identificada y controles de ordenar, elegir principal y quitar siempre visibles.
- Modo edición: edita un administrador a la vez y los demás ven quién está editando, sin poder forzar la entrada. El borrador vive en el servidor, se guarda con cada cambio y lo puede seguir cualquier administrador. A los 13 minutos sin actividad pregunta «¿Seguís editando?» y a los 15 se cierra solo.
- Sección «Productos» del modo edición: lista de 25 registros por página con buscador, filtros (ocultos, sin fotos, agotados, próximamente) y modo explícito «Ordenar productos» para arrastrar con mouse o teclado. Al ordenar se ven todos, sin páginas, y agrupados por categoría cuando la portada muestra una fila por categoría. En cada producto, fotos generales y por color y «Mostrar en la tienda»; nombre, descripción, categoría y precio en solo lectura con el enlace «Editar en Plantillas». «Visible» y «Oculto» describen el borrador; «Cambios sin publicar» identifica lo pendiente. En la vista previa, los productos sin publicar llevan la marca «Sin publicar»; la tienda real nunca la muestra.
- Publicación: «Revisar cambios» abre un resumen por sección de los banners, categorías, carrito, fotos, visibilidad y orden que cambiarán; permite volver a editar. Solo «Publicar cambios» aplica el borrador a la tienda.
- Versiones: cada «Publicar» guarda una versión con quién, cuándo y qué cambió; el editor muestra las últimas 5 en «Versiones». Restaurar pone esa versión en la tienda (portada, fotos, lo que se muestra y orden; no precio, stock ni plantillas) y lo que estaba publicado queda como borrador. Con cambios sin publicar, pregunta «Tenés cambios sin publicar, ¿descartarlos y restaurar?».

Tienda:
- El producto manda: la foto y el precio son lo más visible; navegación y filtros quedan en segundo plano.
- Se diseña primero para 360 px de ancho.
- Objetivos táctiles de 44 px como mínimo.
- Nunca se muestra el stock exacto: «Disponible», «Próximamente», «Agotado» o «Consultar disponibilidad».
- «Próximamente» (sin stock y con una compra en camino) se muestra sin precio. Ni «Próximamente» ni «Agotado» se pueden pedir.
- En «Agotado» y «Próximamente» la acción principal es «Avisame cuando haya» (nombre y WhatsApp). Entra al CRM como seguimiento; no se mandan mensajes automáticos.

Los dos:
- Claro por defecto. Toda pantalla se revisa en claro y en oscuro.

## 11. Textos

- Voseo en todo, también en el panel: «Elegí», «Registrá», «Escribí».
- Botones con verbo. Títulos cortos, sin subtítulo que repita el título.
- Mismas palabras en todo el proyecto: Orden de compra (no Lote), Plantilla (una por modelo), Producto, Variante, Pedido web, Venta, Catálogo, Tienda, Proveedor.
- Nada en inglés si hay palabra en español.

## 12. Accesibilidad

- Contraste de texto de 4.5:1 como mínimo; 3:1 en texto grande y en bordes de campos.
- Foco del teclado siempre visible (anillo bordó).
- Todo se puede usar con el teclado.
- Las imágenes llevan texto alternativo; los íconos de adorno, `aria-hidden`.

## 13. Lo que no va

- Degradados de adorno, vidrio, desenfoque, brillos.
- Emojis y el ícono de estrellitas.
- Tarjetas de métricas iguales con un cuadradito de color con ícono en cada una.
- Textos de marketing en el panel: «Gestioná de forma eficiente», «¡Excelente!».
- Todo centrado o todo en grilla de tarjetas iguales.

## 14. Código

- Los componentes de `app/components/ui` no se cambian para una pantalla. Si hace falta algo distinto, se agrega una variante aquí y en el componente.
- Los estilos se escriben una vez, en el componente compartido. Nada de copiar reglas de una pantalla a otra.
- Comentarios de 1 o 2 líneas, solo para explicar un porqué que no se ve en el código. La historia de un cambio va en el mensaje del commit.
- Sin código comentado, sin archivos sin usar, sin notas de trabajo en el repositorio.
- `npm run check` tiene que pasar antes de cada commit.

## 15. Antes de dar algo por terminado

- [ ] Claro y oscuro.
- [ ] Panel a 1280 y 1440 px. Tienda a 360 px.
- [ ] Navegación solo con teclado.
- [ ] Comparado con la página de muestra del panel.
- [ ] `npm run check` sin errores.

## Pendiente en el código

Lo que este documento pide y el código todavía no tiene. Cada línea se borra cuando se cumple.

- Pedidos web y Códigos de descuento: pasar sus listas a `DataTable` (hoy son filas propias dentro de una tarjeta).
- CRM: contactos en tabla en vez de tarjetas.
- Atajo de teclado de la acción principal en Pedidos web, Usuarios e Inicio.
- Reportería: el selector de periodo (`PeriodPicker`) usa pestañas animadas; pasarlo a botones con borde.
- Contadores animados (`CountUp`) en las métricas del panel: el panel solo mueve el botón principal, bordes y flechas.
- Comentarios largos: acortar a 1 o 2 líneas los bloques que quedan (unos 340, en casi todos los archivos de `app/`).

## Registro de decisiones

| Fecha | Decisión |
| --- | --- |
| 2026-09-30 | Chivo y Chivo Mono como únicas letras |
| 2026-10-05 | Paleta de botones amarillos con contorno y sombra dura. Claro por defecto; oscuro neutro, sin verde |
| 2026-10-07 | La tienda nunca muestra stock exacto. Voseo en todos los textos |
| Antes del 2026-10-10 | Cancelar y Cerrar en rojo (reemplazada el 2026-10-10) |
| 2026-10-10 | Encabezado de cada orden de compra en blanco con borde esmeralda |
| 2026-10-10 | Chivo también en todo el panel |
| 2026-10-10 | El panel usa bloques separados sobre el crema, como el catálogo; se migra módulo por módulo |
| 2026-10-10 | Formularios largos en ventana centrada, no en panel lateral |
| 2026-10-10 | El panel es para computadora desde 1280 px |
| 2026-10-10 | Opción elegida con borde esmeralda de 2 px y tinte |
| 2026-10-10 | Solo el dueño cambia una regla; quien la aplica actualiza este archivo en el mismo commit |
| 2026-10-10 | Un solo documento de diseño: este |
| 2026-10-10 | En la tienda el producto manda: foto y precio por encima de navegación y filtros |
| 2026-10-10 | Paleta de cuatro colores: crema, bordó, amarillo y rosa. El bordó reemplaza al esmeralda (rosa oscuro en modo oscuro) y el rosa al verde menta. Texto `#2a1d1d` y texto secundario `#6e5a57` |
| 2026-10-10 | El verde sale de la interfaz: queda en el logo, la mascota y el punto de éxito (teal) |
| 2026-10-10 | Cancelar y Cerrar pasan a gris con borde; el rojo queda para eliminar y errores |
| 2026-10-10 | Sombra del botón principal y del carrito en bordó, en claro y en oscuro |
| 2026-10-10 | Ofertas en rosa con texto bordó; línea del header en bordó; encabezado de tablas en rosa |
| 2026-10-10 | Tablas con relieve: contorno marcado, línea grabada entre filas, sombra bajo el encabezado y tabla levantada del fondo. Código, variante y estado a 14 px; código y encabezado en tinta |
| 2026-10-10 | Orden de compra: «Recibir» y el menú ⋮ se juntan en un solo botón amarillo «Acciones» |
| 2026-10-10 | Lo elegido con texto bordó (en oscuro, fondo `#26272a`); barra de herramientas con borde normal; fila de tabla en rosa al pasar el mouse; contorno del botón amarillo `#111111` en oscuro; ofertas con borde bordó; precios en bordó; gráficos de Reportería en bordó, sin verde |
| 2026-10-10 | Rediseño aprobado del editor de portada: estructura, tienda e inspector fijo, edición directa del borrador, deshacer/rehacer, composiciones preparadas y publicación confirmada. Excepción a los formularios de banner en ventana; el carrito sigue en ventana |
| 2026-10-10 | Una plantilla por modelo: la tienda muestra su nombre, descripción y categoría; la nota interna no se publica. Plantillas y categorías se administran en Inventario (vista Plantillas), ya no en Catálogo |
| 2026-10-10 | Rediseño aprobado de Plantillas: resúmenes públicos y columnas acotadas sin scroll lateral, opciones resumidas y productos vinculados con conteo de publicados. Ficha centrada por secciones, vista previa pública en vivo y pie de acciones fijo; notas internas fuera del listado y de la vista previa |
| 2026-10-10 | El precio de la tienda es el de venta que se pone al recibir en bodega (el del lote más viejo con stock). Nuevo estado «Próximamente», sin precio; «Próximamente» y «Agotado» no se pueden pedir |
| 2026-10-10 | Unificación aprobada de formularios: campos y botones compartidos de 44 px, amarillo para confirmar o guardar, bordó para foco y selección, cancelación neutra y componentes comunes de encabezado, secciones, cuerpo y pie fijo. Teal del logo como detalle discreto de identidad en el panel y los encabezados de formularios, con la paleta existente en claro y oscuro |
| 2026-10-10 | Corrección del dueño al probar formularios: Cancelar, Cerrar y las X de cierre vuelven a rojo mediante la variante compartida `cancel`, con texto y borde rojos, fondo de tarjeta y fondo rojo al pasar el mouse. Reemplaza la cancelación neutra anterior y respeta los colores de claro y oscuro |
| 2026-10-10 | «Avisame cuando haya» como acción principal en «Agotado» y «Próximamente»: entra al CRM como seguimiento y el equipo escribe cuando llega, sin mensajes automáticos |
| 2026-10-10 | Borrador del modo edición en el servidor, compartido entre administradores y guardado con cada cambio (deja de vivir en el navegador). Un administrador a la vez, con aviso a los 13 minutos sin actividad y cierre a los 15 |
| 2026-10-10 | El modo edición es el único lugar para preparar la vitrina: sección «Productos» con fotos, «Mostrar en la tienda» y orden en el borrador. Lo que viene de la plantilla y de bodega se ve en solo lectura |
| 2026-10-10 | Versiones de la tienda: se guardan las últimas 5 publicaciones; restaurar una deja lo publicado como borrador |
| 2026-10-10 | Se retira el Catálogo del panel: los combos pasan a Inventario (nombre, precio e incluidos) y sus fotos y visibilidad al modo edición; el vendedor ve Stock actual en solo lectura, sin costos |
| 2026-10-10 | Rediseño aprobado del modo edición por tareas para que sea ordenado y fácil: Portada, Productos, Combos y Carrito; una sola zona de edición activa, banner en ficha completa junto a vista previa, productos y combos en el área principal, galerías con controles visibles y revisión de cambios antes de publicar. Reemplaza la estructura con árbol, tienda e inspector simultáneos |
| 2026-10-10 | Modo edición más simple: estado pendiente en cada tarea, un solo menú de tamaño y tema, sin pie ni avisos repetidos, carrito guardado al borrador como lo demás y orden de productos sin páginas, por categoría |
| 2026-10-10 | Órdenes de compra: cantidades en una columna propia después de Producto, con subtotal de unidades alineado; dejan de aparecer como dato secundario debajo del total USD |
| 2026-10-10 | Corrección aprobada al agregar productos a órdenes: búsqueda con coincidencias, elección explícita de plantilla por ID, selección visible y creación con retorno inmediato al producto sin perder cantidad ni costo. Duplicados normalizados bloqueados en formulario y servidor; los modelos parecidos requieren elección del usuario |
| 2026-10-10 | Selector de modelo compacto aprobado: reemplaza las tarjetas y la ficha de selección por un campo con autocompletado superpuesto desde 2 caracteres, hasta 4 coincidencias y creación al final. La selección queda en el campo con confirmación y «Cambiar», sin ocupar espacio adicional en el formulario |
