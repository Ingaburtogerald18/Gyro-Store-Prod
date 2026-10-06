# Pruebas de la limpieza inicial

## Cambios

- El dashboard de analítica consume `GET /api/analytics/admin/dashboard`.
  Los cuatro reportes comparten un conjunto de eventos paginado, con orden por
  fecha e ID. Se calcula el conteo total en la primera página; los rangos que
  exceden 100.000 eventos devuelven un error en lugar de totales incompletos.
- Los contratos de analítica se comparten entre servidor y cliente.
- Las búsquedas del catálogo registran telemetría después de 700 ms sin teclear,
  a partir de tres caracteres. Se mantienen los controles de consentimiento y
  exclusión de personal del cliente de telemetría.
- El carrito usa reducers sin efectos secundarios. Su persistencia se activa
  después de hidratar React y cada instancia de la aplicación tiene su store.
- Se eliminaron módulos, importaciones, variables y propiedades sin uso. Se
  centralizó la normalización de búsquedas y se evitó resolver la categoría
  seleccionada una vez por producto.
- El editor de facturas se carga bajo demanda tanto al crear como al editar.
- Las migraciones incrementales quedaron en `App/database/migrations/`, sin
  aplicar SQL ni modificar el contenido de la migración 0018.

## Comprobaciones automáticas

Desde `App`:

```powershell
npm run typecheck
npm test
npx --no-install tsc --noEmit --noUnusedLocals --noUnusedParameters
```

Desde `App/frontend`:

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

Las pruebas cubren paginación con límites de respuesta menores a los solicitados,
rangos vacíos, límites excedidos, errores de API, agregados de analítica, combos,
cantidades, aislamiento de stores, cierre de sesión y almacenamiento corrupto.
El comando de pruebas del frontend utiliza el cargador `tsx` instalado en `App`;
requiere tener instaladas las dependencias de ambos proyectos.

## Pruebas manuales

Inicia el backend con `npm run dev` desde `App`, y el frontend con `npm run dev`
desde `App/frontend`, en terminales separadas. Abre la dirección que indique Vite.

1. Agrega un producto al carrito, cambia la cantidad y recarga. Debe conservarse.
2. Agrega un combo y un producto suelto. Deben mantenerse como líneas distintas.
   Elimina una línea, recarga y comprueba que no reaparezca. Vacía el carrito y
   repite la comprobación.
3. Inicia y cierra sesión. El carrito debe conservarse y los datos privados deben
   dejar de mostrarse. Comprueba también que el editor de la tienda se cierre.
4. En una sesión anónima, acepta analítica y busca una palabra de al menos tres
   caracteres. Tras dejar de teclear, espera el envío del lote (hasta cinco
   segundos). En Red de DevTools, comprueba el evento `search` enviado a
   `/api/analytics`, con el término normalizado y el número de resultados.
5. Busca un término sin resultados. Comprueba que aparece en analítica con
   `zeroResults`. Con consentimiento rechazado o sesión de personal no debe
   emitirse esa búsqueda.
6. En el panel de analítica comprueba totales y tablas. La carga debe solicitar
   `/api/analytics/admin/dashboard`, en lugar de las cuatro lecturas individuales.
7. Abre la creación y la edición de una factura. El formulario debe cargar en
   ambos casos, incluida la precarga de sus líneas al editar.
8. Revisa la consola al recargar con un carrito guardado: comprueba que no haya
   errores de hidratación y que el logo y favicon sigan cargando.

Las comprobaciones automáticas no sustituyen la prueba con la API y la base de
datos reales. Para revisar SSR, utiliza también un entorno de pruebas que sirva
el build de producción.

## Trabajo pendiente

Quedan advertencias por `any`, revisión por responsabilidades de los servicios
de ventas e informes y medición de rendimiento en navegador. La política global
de revalidación de RTK Query se conserva hasta verificar hidratación y frescura
de datos en producción. La compilación también puede emitir advertencias de
sourcemaps de los componentes UI.
