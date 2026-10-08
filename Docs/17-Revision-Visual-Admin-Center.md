# Revisión visual del Admin Center

Fecha: 7 de octubre de 2026.

## Alcance

Revisión del frontend, composición, identidad, accesibilidad de los controles y
adaptación a pantallas pequeñas. Se revisaron los componentes y las pantallas
principales con una sesión de administrador en localhost. No se evaluaron las
reglas, cálculos, permisos ni flujos de negocio de cada módulo. No se guardaron
formularios ni se crearon, editaron o eliminaron registros durante la revisión.

## Diagnóstico

El panel ya contaba con buenas piezas reutilizables: PageHeader, Workspace,
MetricStrip, DataTable y componentes Radix. El problema principal era la
convivencia de dos identidades. El catálogo tenía fondos crema/blanco, Chivo,
amarillo y esmeralda; el panel conservaba el preset Mist/Emerald, Geist y
controles más compactos. No hacía falta sustituir el panel completo.

La mejora consiste en compartir identidad y jerarquía, manteniendo la densidad
adecuada para una herramienta de trabajo. El panel debe facilitar lectura,
comparación y acciones repetidas. Las grandes ilustraciones, los relieves en
todas las superficies y las animaciones continuas competirían con ese objetivo.

## Revisión de la base y cambios realizados

| Parte | Problema identificado | Ajuste realizado |
|---|---|---|
| Colores claros | Tarjetas y campos del preset, distintos al catálogo | Fondo crema, tarjetas blancas, texto tinta y esmeralda profunda |
| Colores oscuros | Fondo con otro matiz respecto de la tienda | Negro neutro, superficies carbón y texto secundario gris legible |
| Acción principal | Botones verdes sin el carácter del catálogo | Amarillo con texto tinta, borde y relieve discreto de 2px |
| Selección | El color del CTA podía confundirse con el estado elegido | Esmeralda para navegación, filtros, pestañas y foco |
| Tipografía | Geist en controles y títulos, Chivo en montos | Chivo en títulos y cuerpo; monoespaciada reservada a códigos |
| Logo | Logo horizontal encajado en un cuadrado de 64px | Logo estático proporcionado; mascota sola cuando el menú se contrae |
| Menú de escritorio | Apertura por hover movía el área de trabajo | Menú abierto inicialmente y controlado por botón |
| Menú móvil | Faltaba el botón visible de apertura | Botón táctil de abrir, cerrar y cierre al elegir una ruta |
| Menú activo | Indicador animado separado del estado del componente | Un solo estado esmeralda con fondo, borde y peso de texto |
| Encabezado | Área casi vacía y poca orientación | Nombre de la sección actual, acceso al menú y controles de cuenta |
| Títulos | Peso y distribución de acciones poco consistentes | Título de 24px con peso 700; acciones pueden acomodarse en varias líneas |
| Búsqueda | Podía estrecharse hasta dejar casi invisible el placeholder | Ancho completo en móvil y expansión flexible en escritorio |
| Filtros de vista | Varias opciones podían quedar apretadas o sueltas | Opciones múltiples en dos columnas en móvil, con altura táctil |
| Controles | Alturas de 28–36px también en móvil | 44px para controles principales en móvil; 36px normales en escritorio |
| Tablas compartidas | Herramientas pequeñas y tarjetas móviles con sombra excesiva | Acciones táctiles, búsqueda más cómoda y tarjetas móviles más sobrias |
| Pestañas animadas | Texto blanco fijo y animación sin preferencia de movimiento | Texto según token del tema, estado anunciado y movimiento reducido |
| Tarjetas de métricas | Movimiento al pasar el mouse incluso sin acción | Realce por borde, sin salto por hover, entrada corta y opcional |
| Importe principal | El total de Reportería salía del ancho a 320px | Tamaño y padding adaptados al móvil, sin ocultar el importe |
| Diálogos | Formularios largos podían superar el alto de pantalla | Alto máximo de pantalla y desplazamiento vertical interno |
| Cerrar y selector de fecha | Radix reemplazaba data-slot y omitía estilos táctiles | Marcador estable de Button; se comprobó altura de 44px en el portal |

## Criterio visual que queda establecido

1. **Amarillo:** ejecutar la acción principal: registrar, guardar o confirmar.
   No se usa para texto informativo sobre blanco ni para cada opción seleccionada.
2. **Esmeralda:** navegación, selección, enlaces y anillos de foco. Se usa una
   versión profunda en claro y una más luminosa en oscuro.
3. **Rojo:** error o acción destructiva. Cerrar y Cancelar son controles neutrales
   para distinguirlos de eliminar registros o descartar trabajo.
4. **Neutros:** valores principales, texto y superficies. Los tonos semánticos de
   datos y gráficos existentes se conservan; se revisarán al evaluar cada módulo.
5. **Relieve:** discreto en el CTA. Las tablas, tarjetas, filtros y controles de
   selección no necesitan llevar el relieve del botón de compra.
6. **Tipografía:** títulos de sección de 24px, texto habitual de 14px, campos de
   búsqueda de 16px en móvil y metadatos secundarios de 12px cuando sea posible.
   El mínimo existente de 11px queda reservado a datos realmente secundarios.
7. **Forma:** controles con radio aproximado de 12px; superficies de trabajo más
   amplias. Las píldoras se mantienen para estados, sin convertir cada elemento
   de la pantalla en una burbuja.
8. **Animación:** transiciones breves de color, apertura y estado; sin desplazar
   filas o tarjetas al pasar el cursor. Respetar reducción de movimiento.

El token --primary del panel sigue representando esmeralda porque muchas piezas
existentes lo usan para éxito, selección y gráficos. El amarillo de los botones
principales usa --admin-action. Cambiar todo --primary a amarillo habría cambiado
también el significado visual de estados y datos. Las vistas .store-preview
quedan fuera de los overrides de controles del panel.

## Revisión visual por familia de pantallas

Estas son prioridades para la revisión individual. No son fallos confirmados de
sus cálculos ni instrucciones de modificar la lógica de los módulos.

| Pantalla | Base observada | Próxima revisión de frontend |
|---|---|---|
| Reportería | Buen protagonista numérico y jerarquía de métricas | Reducir repetición entre títulos, descripciones y leyendas; priorizar gráficos en móvil |
| Inventario | Buena franja de métricas, filtro y agrupación por lote | Diseñar tarjetas móviles específicas; priorizar producto, cantidad y estado antes del detalle de costos |
| Ventas | Barra de filtros y estados clara; tarjetas mediante DataTable | Orden y densidad de datos del detalle; consistencia de acciones y estados vacíos |
| Pedidos web | Contenedor y filtros integrados al sistema | Resumen escaneable por pedido y jerarquía del detalle sin acumular botones |
| Cuotas | Estructura de listado consistente | Destacar importe, estado y fecha con una jerarquía visual compacta |
| Catálogo administrativo | Pestañas de artículos, categorías, templates y combos | Unificar nombres en español, tamaño de fotos y acciones de tarjetas; hacer visibles las herramientas sin depender de hover |
| Facturación | Controles y tablas comparten la base | Orden visual del formulario y panel de vista previa; separar claramente pantalla de edición y ticket impreso |
| Códigos de descuento | Sección propia con filtros y registros | Claridad de tarjeta/listado: código, vigencia y estado; evitar exceso de badges |
| CRM y clientes | Título y superficie consistentes | Jerarquía de información del contacto y distribución de paneles de detalle |
| Analítica | Pantalla de métricas de la tienda | Etiquetas más naturales en español y gráficos legibles en móvil sin depender de tooltips |
| Personal | Tarjetas y acciones de equipo | Proporción del avatar, rol, datos secundarios y acciones; uniformidad entre tarjetas y detalles |
| Configuración | Formularios por pestaña y secciones | Evitar padding acumulado; revisar ancho y agrupación de campos y persistencia visual de la acción de guardar |
| Mi perfil | Datos personales y bancarios organizados | Agrupación, ayudas breves y tamaño uniforme de campos; evitar leer formularios como una lista interminable |
| Mis facturas | Ruta exclusiva de vendedor | Falta comprobación visual con sesión de vendedor; no se alteraron los permisos para verla |

## Prioridades que conviene mantener para la siguiente etapa

### 1. Presentación móvil de datos densos

Que una tabla no desborde la página no significa que ya sea cómoda en el teléfono.
Inventario todavía conserva una tabla ancha con desplazamiento horizontal. Su
próxima revisión debe decidir qué información va en la tarjeta y qué queda en el
detalle. No conviene trasladar ocho columnas a ocho filas por registro.

### 2. Formularios con varias columnas

Se comprobó apertura y cierre del formulario de compra sin enviar datos. Los
campos numéricos contiguos todavía pueden tener etiquetas con distintas alturas
en móvil. Se debe revisar la agrupación cuando se trabaje ese módulo, con campos
apilados o anchos adecuados según la tarea.

### 3. Consistencia del lenguaje

Conviven términos como Templates, storefront, Gestión de Catálogo y títulos más
cortos en el menú. Definir nombres y ayudas en español sencillo, con títulos que
coincidan entre navegación y pantalla. Evitar títulos duplicados innecesarios.

### 4. Estados de la interfaz

Mantener mensaje claro de vacío, contexto y una acción pertinente. Diferenciar
sin datos, sin resultados de filtro y error de conexión. La mascota puede aparecer
en un vacío o bienvenida; no conviene ponerla junto a cada fila ni en animación
continua mientras el personal trabaja.

### 5. Gráficos y colores de datos

La marca no obliga a pintar cada serie únicamente con amarillo, rojo y verde.
Los gráficos necesitan distinguir series y estados con etiquetas y leyendas.
Revisar contraste de textos pequeños, semántica consistente y lectura sin hover
al abordar Reportería y Analítica. No se modificaron fórmulas ni series de datos.

## Comprobación

- Sesión real de administrador y navegación entre las pantallas principales.
- Escritorio de 1440 × 960; Inventario comprobado en claro y oscuro.
- Pantallas principales recorridas a 390px y 320px sin desbordamiento de página
  en la comprobación de su estado principal. Esto no incluye todas sus pestañas,
  errores, detalles, formularios ni combinaciones de datos.
- Menú móvil: apertura, cierre y cierre al navegar comprobados.
- Formulario de compra: abierto, medido y cerrado sin enviar; campos, selector de
  fecha y cierre con área táctil de 44px; desplazamiento vertical disponible.
- TypeScript sin errores. ESLint de componentes modificados sin errores; quedan
  tres advertencias existentes de any en DataTable.
- 23 pruebas existentes del frontend aprobadas. Build de producción aprobado;
  se mantienen los avisos ya conocidos de sourcemaps de componentes Radix.

## Resultado

La base del Admin Center comparte ahora la identidad del catálogo. El siguiente
paso es la revisión individual de los módulos, empezando por Inventario: concentra
tabla, filtros, métricas, formularios y el caso móvil más denso. Esa revisión debe
definir la composición específica y, en una etapa separada, la lógica con Claude Code.
