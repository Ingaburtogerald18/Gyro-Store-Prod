# Ajustes del Admin Center

## Identidad compartida con el catálogo

La referencia visual es el catálogo público. Chivo es la familia base de toda
la aplicación y Chivo Mono resuelve tanto `font-spec` como `font-mono`.
Se retiró la carga de Geist y las reglas duplicadas del relieve de botones del panel.

Los botones principales comparten amarillo, texto tinta, borde de 2px, sombra
de 3px y estados de interacción. Los controles comparten radios y tamaños de
la primitiva `Button`. Los enlaces y la selección usan esmeralda; Cancelar y
cerrar conservan la variante roja acordada. El menú de acciones de las filas
también usa `Button`.

Se compararon los estilos calculados de los componentes reales en un navegador
aislado: claro/oscuro a 1100px y 390px, en reposo, hover, pulsación y foco.
Fuentes, colores, bordes, radios, alturas y sombras coincidieron entre las dos
áreas en las cuatro combinaciones. Esta comprobación cubre controles compartidos;
no reemplaza la revisión de todas las pantallas con datos reales.

Rama: `codex/admin-ui-polish`.

## Implementado

- Header con ubicación actual, botón de navegación, búsqueda de módulos y acceso a la tienda.
- Menú de usuario con rol, perfil, tema, preferencias y ayuda de teclado.
- Favoritos y módulos recientes, filtrados por los permisos existentes.
- Navegación explícita, sin expansión por hover, con estado guardado en el navegador.
- Densidad compartida entre tablas y preferencias del usuario.
- Una vista personal por tabla con `tableId`: columnas, orden y búsqueda cuando la tabla puede controlarla. Se aplica explícitamente; no restaura búsquedas al cargar.
- Etiquetas para búsqueda y orden activos. Los filtros externos siguen en el módulo que los administra.
- Controles separados, encabezados adaptables, selección accesible en tablas de escritorio y apertura de filas por teclado.
- Paleta y marca de Claude combinadas con controles espaciados y transiciones que respetan movimiento reducido.
- Botones de cancelación y cierre rojos mediante la variante compartida `cancel`, incluyendo las X de Dialog y Sheet y los nuevos formularios de inventario.
- Avisos de ventas con estados de carga, error y vacío específicos.

## Integración con inventario

Se integraron los ocho commits de `Yolanda-Gerald` hasta `d5f80d3` y una copia verificada de sus 18 archivos de trabajo pendientes. El worktree original de Claude se conserva. La lógica de órdenes de compra se incorporó con sus APIs, esquemas y migración 0024; esa migración no se ejecutó. Los cambios funcionales de tablas siguen concentrados en `DataTable.tsx`, y sus propiedades existentes se conservan.

La búsqueda del inventario actual se recibe sin callback de edición. En ese caso la vista guarda únicamente orden y columnas. El filtro del módulo se muestra como texto, sin un botón de limpieza que no tendría efecto.

Las alertas de inventario, CRM y otros procesos necesitan fuentes de datos y reglas propias. La campana sigue consultando ventas. La búsqueda nueva encuentra módulos, no registros de negocio.

## Validación

- TypeScript: sin errores.
- ESLint: sin errores; persisten advertencias de `any` del código existente.
- Build de cliente y servidor: correcto, con avisos de sourcemaps de las primitivas UI.
- 27 pruebas de frontend y 25 de backend, incluyendo navegación por rol, preferencias, carrito, checkout y transacciones de pedidos en PostgreSQL local de pruebas.
- Revisión visual autenticada: pendiente en `http://localhost:5174/admin/inventario`.

Por pedido del usuario, la interfaz integrada también se aplicó al worktree activo de Claude (`Yolanda-Gerald`), servido en 5173. Se verificó que todos los archivos del frontend coinciden con la integración probada. Sus nuevos cambios de base de datos se conservaron sin modificarlos. El trabajo de interfaz continuará en este worktree; la copia de la rama `codex/admin-ui-polish` sigue disponible en el checkout principal. No se copiaron secretos al repositorio.

## Órdenes desplegables en compras

Implementadas en el worktree activo de Claude:

- Las órdenes y lotes comienzan cerrados. Cada cabecera muestra número, proveedor, fecha, estado, productos, unidades y total.
- Se pueden abrir varias órdenes a la vez, expandir todas o contraer todas. Una búsqueda abre los grupos coincidentes; limpiar la búsqueda vuelve a cerrarlos.
- La búsqueda incluye el número de orden y el proveedor. El resumen conserva el total completo de la orden; la tabla y el pie muestran el subtotal filtrado.
- El menú de acciones y Recibir están separados del botón que despliega los productos.
- Por pedido del usuario, la cabecera desplegable usa el mismo amarillo `--action` de Registrar compra. Sus textos y foco son oscuros en ambos temas. La barra de acciones y los productos conservan las superficies del catálogo. Tipografía, separadores y filas alternadas suaves dan jerarquía; las columnas mantienen el mismo ancho entre órdenes. En pantallas estrechas, la tabla se desplaza horizontalmente con ratón o teclado.
- Los controles conservan foco visible y respetan la preferencia de movimiento reducido. Las acciones de inventario siguen usando los formularios existentes.

Validación: TypeScript, compilación de cliente y servidor y 29 pruebas de frontend correctos, incluidas apertura independiente y render inicial cerrado o abierto por búsqueda. ESLint de los componentes modificados pasa; el resto conserva 57 advertencias existentes. La compilación conserva los avisos de sourcemaps de las primitivas UI. La revisión visual en Brave quedó pendiente porque el controlador detectó actividad del usuario e impidió cambiar de pestaña.
