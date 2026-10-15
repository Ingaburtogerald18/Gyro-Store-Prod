# Base de datos

Esquema de Gyro Store sobre Supabase/Postgres.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `01_schema.sql` | **Todo el esquema, en su estado final**, ordenado por módulo (Personal, Catálogo, Clientes, Compras, Ventas, Tienda web, Stock, Descuentos, Finanzas, Sistema, Reportes, Seguridad). Cada tabla está completa en un solo `create table`. |
| `02_seed.sql` | Datos de arranque: categorías, las 8 plantillas iniciales y la configuración financiera. |
| `migrations/` | Lo que **falta correr** en producción: `0018_loan_payments_a_gastos.sql`, `0032_entregas_y_pagos_de_pedidos.sql`, `0033_texto_de_categorias_y_marca.sql` y `0034_vincular_lotes_viejos.sql`. |
| `historial/` | El esquema anterior y las migraciones ya aplicadas (0015–0031, salvo la 0018). Solo como registro: **no se corren**. |

## Base de producción (la que ya tiene datos)

Producción está igual a `01_schema.sql` salvo lo que agregan las migraciones
pendientes de abajo: la 0025 la ordenó y la 0026–0031 se corrieron después en el
SQL Editor de Supabase.

Quedan cuatro pendientes:

- **`migrations/0032_entregas_y_pagos_de_pedidos.sql`**: entrega en Managua, por
  Cargo Trans o retiro; pagos, transporte y recepción de los pedidos web; y los
  eventos `add_to_cart` y `whatsapp_open`. Solo agrega valores y columnas
  opcionales, así que **se corre antes de publicar el código** que la usa: el
  código anterior sigue andando con la base migrada, pero el nuevo no puede
  registrar pedidos de Managua o Cargo Trans sin ella.
- **`migrations/0033_texto_de_categorias_y_marca.sql`**: el texto propio de cada
  categoría (`categories.description`) y la marca de cada plantilla
  (`templates.brand`), las dos vacías por defecto. Como la 0032, solo agrega
  columnas y **se corre antes de publicar el código**: el código nuevo las pide al
  leer el catálogo y las categorías, y sin ellas la tienda no carga.
- **`migrations/0018_loan_payments_a_gastos.sql`**: pasa los pagos de préstamo a
  `expenses` como gastos del pozo Préstamos. Necesita el OK del dueño. Mientras no
  corra, la app lee los pagos de las dos tablas y no los cuenta dos veces. Los
  pasos están en `Docs/03-Finanzas.md` §13.
- **`migrations/0034_vincular_lotes_viejos.sql`**: vincula a su plantilla y
  variante los lotes viejos (LT1–LT3) que la tienda no ve, leyendo el nombre del
  lote. Solo cambia datos y no toca `product_name`, del que dependen las ventas y
  devoluciones. Necesita el OK del dueño. Al final lista lo que quedó sin
  vincular; se completa en Plantillas y se vuelve a correr.

Caja y Bancos (`accounts`, `account_movements`, `cash_closures`) quedaron
archivados en el esquema `archivo`, con sus datos. Para devolver una tabla:
`alter table archivo.accounts set schema public;`

## Base nueva (desde cero)

1. `01_schema.sql`
2. `02_seed.sql`

`01_schema.sql` no es idempotente a propósito: sobre una base con datos falla de
entrada en vez de mezclar estados. Nunca correrlo sobre producción.

`02_seed.sql` sí se puede re-correr: no duplica categorías ni plantillas y no pisa
la configuración que ya se ajustó desde el panel.

## Cambios futuros

1. Un archivo nuevo en `migrations/` con el número siguiente (`0033_…`), que se
   pueda correr dos veces sin romper (`if not exists`, `create or replace`).
2. El mismo cambio en `01_schema.sql`, en su módulo, para que una base nueva
   nazca igual.
3. Si la migración crea una tabla o función, cerrarla como en la sección 13 de
   `01_schema.sql` (RLS y permisos solo para `service_role`).
4. Cuando ya se corrió en producción, pasa a `historial/migrations/`.

Lo que ya se corrió contra producción no se reescribe.

## Seguridad

- **Tablas:** RLS activo y sin políticas en todas. Solo el servidor, con la
  `service_role`, lee y escribe.
- **Funciones:** solo `service_role` las puede llamar. La llave pública (`anon`)
  viaja en el navegador para el login del personal. Las funciones de reportes son
  `security definer` (saltean RLS), así que sin este cierre cualquiera con esa
  llave podía pedir el libro de ventas con costos y clientes.
- **Storage:** la app sube las fotos a R2. El bucket viejo `public-assets` queda
  solo de lectura, para que sigan funcionando las fotos que ya están ahí.

## Dos correlativos legales

Salen de secuencias de Postgres y **ninguno se reinicia ni se reusa**:

- `invoices.invoice_code` → `GS-PR-1`, `GS-PR-2`, …
- `discount_codes.code` → `GS-DC-1`, `GS-DC-2`, …

Un número descartado queda quemado. Por eso anular una factura la deja en estado
`void` en vez de borrarla.

## Seed de desarrollo

```bash
cd App && npm run seed:dev -- --confirm
```

Inserta productos de prueba y los slides del hero. Publica productos, así que lo
que siembre **aparece en la tienda**; se niega a correr con `NODE_ENV=production`.
