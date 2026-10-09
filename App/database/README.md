# Base de datos

Esquema de Gyro Store sobre Supabase/Postgres.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `01_schema.sql` | **Todo el esquema, en su estado final**, ordenado por módulo (Personal, Catálogo, Clientes, Compras, Ventas, Tienda web, Stock, Descuentos, Finanzas, Sistema, Reportes, Seguridad). Cada tabla está completa en un solo `create table`. |
| `02_seed.sql` | Datos de arranque: categorías, las 8 plantillas heredadas de v1 y la configuración financiera. |
| `migrations/0025_ordenar_base.sql` | Lleva la base de producción al mismo estado que `01_schema.sql`. |
| `historial/` | El esquema anterior y las migraciones 0015–0024, solo como registro. **No se corren.** |

## Base de producción (la que ya tiene datos)

Correr **solo** `migrations/0025_ordenar_base.sql` en el SQL Editor de Supabase,
con el OK del dueño. No hace falta correr antes 0019–0024: la 0025 trae lo que
falte de cada una.

- Va en una sola transacción: si algo falla, la base queda como estaba.
- Se puede correr más de una vez sin repetir nada.
- No cambia precios, costos, cantidades, ventas ni pedidos.
- Termina con una verificación. Si devuelve una sola fila **"Todo en orden"**,
  la base quedó igual a `01_schema.sql`. Si no, lista qué falta o qué sobra.

Lo que ordena:

1. Completa lo que falte de las migraciones 0016–0024.
2. Archiva Caja y Bancos (`accounts`, `account_movements`, `cash_closures`) en el
   esquema `archivo`, con sus datos. Para devolver una tabla:
   `alter table archivo.accounts set schema public;`
3. Borra `get_sales_trend` y `get_expenses_by_pozo`, que nadie llama.
4. Agrega índices para reportes y búsquedas y quita cuatro repetidos.
5. Cierra la base a la llave pública (ver Seguridad).

## Base nueva (desde cero)

1. `01_schema.sql`
2. `02_seed.sql`

`01_schema.sql` no es idempotente a propósito: sobre una base con datos falla de
entrada en vez de mezclar estados. Nunca correrlo sobre producción.

`02_seed.sql` sí se puede re-correr: no duplica categorías ni plantillas y no pisa
la configuración que ya se ajustó desde el panel.

## Cambios futuros

1. Un archivo nuevo en `migrations/` con el número siguiente (`0026_…`), que se
   pueda correr dos veces sin romper (`if not exists`, `create or replace`).
2. El mismo cambio en `01_schema.sql`, en su módulo, para que una base nueva
   nazca igual.
3. Si la migración crea una tabla o función, cerrarla como en la sección 13 de
   `01_schema.sql` (RLS y permisos solo para `service_role`).

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
