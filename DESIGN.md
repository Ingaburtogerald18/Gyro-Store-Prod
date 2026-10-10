# Gyro Store · Reglas de diseño

Este es el único documento de diseño del proyecto. Vale para la tienda y para el panel.

- Si el código no cumple una regla, se arregla el código.
- Si una regla parece estar mal, se pregunta al dueño antes de cambiarla.
- Cuando el dueño decide algo nuevo, se cambia este archivo en el mismo commit y se anota en el registro del final.

## 1. Color

Los colores viven en `app/tailwind.css`, en el bloque de la paleta de marca. En los componentes se usa siempre el nombre del color, nunca el valor.

| Color | Nombre | Claro | Oscuro | Uso |
| --- | --- | --- | --- | --- |
| Tinta | `--ink`, `--foreground` | `#102423` | `#f4f4f2` | Texto. Contorno y sombra del botón principal |
| Crema | `--background` | `#fffcf3` | `#0e0f10` | Fondo de página |
| Blanco | `--card`, `--popover` | `#ffffff` | `#18191b` | Tarjetas, menús, ventanas |
| Suave | `--muted`, `--secondary`, `--accent` | `#eef4f1` | `#222326` | Fondos de apoyo |
| Texto secundario | `--muted-foreground` | `#4b605d` | `#a8aaad` | Etiquetas, ayudas, fechas |
| Amarillo | `--action` | `#ffc20e` | `#ffc20e` | Acción principal. Texto tinta (`#111111` en oscuro) |
| Esmeralda | `--primary-2` | `#0e7c68` | `#3dc5a9` | Selección, navegación, links, foco, éxito |
| Teal del logo | `--logo` | `#3dc5a9` | `#3dc5a9` | Logo y línea del header |
| Header | `--header-background` | `#fffcf3` | `#141517` | Fondo del header |
| Coral | `--promo` | `#f07a6a` | `#f07a6a` | Ofertas |
| Bordó | `--sticker-shadow` (oscuro), `--header-cart-shadow` | `#a8402f` | `#a8402f` | Sombra dura en oscuro y del carrito |
| Borde | `--border` | tinta 16 % | blanco 10 % | Tarjetas y separadores |
| Borde de campo | `--input` | tinta 48 % | blanco 34 % | Campos, selects, botones con borde |
| Error | `--destructive` | `#e7000b` | `#f04438` | Errores, eliminar, cancelar |
| Advertencia | `--warning` | `#915c08` | `#d99a2b` | Datos por completar, bajo margen |
| Información | `--info` | `#036eae` | `#3ba6f5` | Avisos neutros, en tránsito |
| Éxito | `--success` | = esmeralda | = esmeralda | Recibido, entregado, pagado |
| WhatsApp | `--whatsapp` | `#027d34` | `#2ed264` | Solo los botones de WhatsApp |

Siempre:
- Amarillo solo para la acción principal: una por pantalla, por ventana o por tarjeta.
- Esmeralda para lo elegido y para dónde estás.
- Coral solo cuando hay oferta, y solo como fondo con texto tinta. Como texto no se lee (2.7:1).
- Rojo solo para errores, eliminar y cancelar.
- Los números van en color de texto. El color se reserva para estados.
- Gráficos con colores de la marca, en este orden: esmeralda, amarillo, coral, teal, tinta, gris.

Nunca:
- Valores sueltos en componentes (`#ffc20e`, `bg-yellow-400`, `rgb(...)`).
- Un color que no esté en esta tabla.
- Comunicar un estado solo con color: siempre con texto o ícono.

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
| Sombras | Ninguna en tarjetas, tablas y campos. Dura (3 px) en el botón principal. Suave solo en menús y ventanas flotantes |
| Espacios | Múltiplos de 4 px. Panel: 20 px entre bloques (`gap-5`). Tienda: 24 a 32 px. Dentro de una tarjeta: 16 o 20 px |

Siempre:
- Toda tarjeta lleva borde. Blanco sobre crema no se distingue sin él (1.03:1).

## 4. Botones

| Variante | Aspecto | Para qué |
| --- | --- | --- |
| `default` | Amarillo, contorno tinta de 2 px, sombra dura de 3 px | Acción principal |
| `outline` | Blanco, borde `--input`; al pasar el mouse, borde esmeralda | Acciones secundarias |
| `cancel` | Rojo con borde | Cancelar y Cerrar |
| `destructive` | Rojo suave | Eliminar, dentro de una confirmación |
| `whatsapp` | Verde WhatsApp con relieve | Escribir por WhatsApp como acción principal |
| `whatsappOutline` | Borde verde, sin relieve | WhatsApp como acción secundaria |
| `link` | Texto esmeralda subrayado al pasar | Acciones dentro de un texto |
| `ghost` | Sin fondo | Solo botones de ícono en barras y menús |

Tamaños: 44 px (`h-11`) en todos lados; 36 px (`size="sm"`) solo dentro de tablas.

Siempre:
- El botón dice lo que hace, con verbo: «Registrar compra», «Guardar cambios», «Agregar».
- Al presionar el botón principal, baja 2 px y la sombra pasa a 1 px.
- El botón principal siempre lleva su contorno: el amarillo contra el crema es 1.6:1.

Nunca:
- Dos botones amarillos en la misma ventana o tarjeta.
- Un botón amarillo dentro de una fila de tabla.
- La variante `secondary`.

## 5. Selección, chips y barra de herramientas

- Opción elegida (variante, filtro, vista): borde esmeralda de 2 px, fondo con 12 % de esmeralda, texto en semibold. Se marca con `aria-pressed`.
- Elegir vista: botones con borde marcados así. No pestañas ni grupos de botones distintos.
- Chips, solo cuatro tipos: estado (punto y texto), filtro activo (tinte esmeralda y ×), contador (amarillo) y categoría (suave).
- Barra de herramientas: tarjeta blanca con borde esmeralda al 30 % y línea esmeralda de 2 px arriba. Adentro: buscador, filtros, conteo y la acción principal a la derecha.

## 6. Tablas

- Se usa tabla siempre que se comparan registros por columnas. Tarjetas solo para productos con foto y para órdenes de compra.
- Piezas: `components/ui/table.tsx` para el aspecto y `DataTable` para buscar, ordenar y paginar.
- Contenedor blanco, borde de 1 px, 16 px de esquina, sin sombra.
- Encabezado con fondo crema, `text-xs font-semibold text-muted-foreground`, sin mayúsculas. Las columnas ordenables muestran la flecha.
- Filas de 52 px (40 px en modo compacto), `text-sm`. Al pasar el mouse, esmeralda al 5 %.
- Columnas en este orden: código, descripción, números, estado, acciones.
- Código en `font-mono` gris. Producto: nombre en semibold y la variante debajo en `text-xs` gris.
- Números a la derecha. La moneda va en el encabezado si toda la columna es de una moneda.
- Totales en la última fila, en negrita, fijos abajo.
- Estado: punto de color y texto.
- Acciones al final, en un menú ⋮. Como mucho una acción visible por fila, con borde.
- Cabe en 1280 px sin scroll lateral. Si no cabe, las columnas secundarias se ocultan y se activan desde «Columnas».
- 25 filas por página. Abajo a la derecha: «1–25 de 230».

## 7. Formularios

- Cortos (hasta 6 campos): ventana `max-w-xl`. Largos: ventana `max-w-5xl` con secciones. Configuración: en la página.
- Título con verbo y objeto: «Registrar compra». Nunca «Nuevo» ni «Formulario».
- Una columna. Dos solo para pares cortos (fecha y número, moneda y monto).
- Cada campo con `Field`: etiqueta arriba siempre visible, asterisco si es obligatorio, ayuda debajo solo si hace falta, error debajo en rojo diciendo cómo arreglarlo.
- Campos de 44 px. Montos con el símbolo adentro a la izquierda y `inputMode="decimal"`.
- Hasta 10 opciones: `Select`. Más de 10: `Combobox` con buscador.
- Pie: «Cancelar» (`cancel`) a la izquierda y la acción (`default`) a la derecha, alineados a la derecha.
- Mientras guarda, el botón se deshabilita y dice «Guardando…». Al terminar, se cierra y un aviso confirma («Compra registrada»).
- Si el servidor falla, el mensaje va arriba del formulario, sin cerrar ni perder lo escrito.
- Si hay cambios sin guardar, cerrar pregunta «¿Descartar los cambios?».
- Datos con react-hook-form y un esquema de validación. Obligatorio en formularios nuevos o reescritos.

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
- Fotos de producto cuadradas, de 1000 × 1000 px como mínimo, fondo blanco, el producto cerca del 80 % de la foto, siempre completas (`object-contain`). La primera foto es el producto solo.
- Logo: sin recolorear ni deformar, mínimo 140 × 40 px.
- Mascota: solo en estados vacíos, error 404 y pedido confirmado.

## 10. Pantallas

Panel:
- Pensado para computadora desde 1280 px. En pantallas más chicas no se rompe, pero no se adapta.
- Encabezado: título de página y, a la derecha, la acción principal con su atajo (`<Kbd>N</Kbd>`).
- Debajo, bloques separados sobre el crema: barra de herramientas, métricas y contenido.
- Un elemento domina cada pantalla: la tabla, la lista de órdenes o el formulario.

Tienda:
- Se diseña primero para 360 px de ancho.
- Objetivos táctiles de 44 px como mínimo.
- Nunca se muestra el stock exacto: «Disponible», «Agotado» o «Consultar disponibilidad».

Los dos:
- Claro por defecto. Toda pantalla se revisa en claro y en oscuro.

## 11. Textos

- Voseo en todo, también en el panel: «Elegí», «Registrá», «Escribí».
- Botones con verbo. Títulos cortos, sin subtítulo que repita el título.
- Mismas palabras en todo el proyecto: Orden de compra (no Lote), Producto, Variante, Pedido web, Venta, Catálogo, Tienda, Proveedor.
- Nada en inglés si hay palabra en español.

## 12. Accesibilidad

- Contraste de texto de 4.5:1 como mínimo; 3:1 en texto grande y en bordes de campos.
- Foco del teclado siempre visible (anillo esmeralda).
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
- Atajo de teclado de la acción principal en Pedidos web, Usuarios, Catálogo e Inicio.
- Comentarios largos: acortar a 1 o 2 líneas los bloques que quedan (unos 340, en casi todos los archivos de `app/`).

## Registro de decisiones

| Fecha | Decisión |
| --- | --- |
| 2026-09-30 | Chivo y Chivo Mono como únicas letras |
| 2026-10-05 | Paleta de botones amarillos con contorno y sombra dura. Claro por defecto; oscuro neutro, sin verde |
| 2026-10-07 | La tienda nunca muestra stock exacto. Voseo en todos los textos |
| Antes del 2026-10-10 | Cancelar y Cerrar en rojo |
| 2026-10-10 | Encabezado de cada orden de compra en blanco con borde esmeralda |
| 2026-10-10 | Chivo también en todo el panel |
| 2026-10-10 | El panel usa bloques separados sobre el crema, como el catálogo; se migra módulo por módulo |
| 2026-10-10 | Formularios largos en ventana centrada, no en panel lateral |
| 2026-10-10 | El panel es para computadora desde 1280 px |
| 2026-10-10 | Opción elegida con borde esmeralda de 2 px y tinte |
| 2026-10-10 | Solo el dueño cambia una regla; quien la aplica actualiza este archivo en el mismo commit |
| 2026-10-10 | Un solo documento de diseño: este |
