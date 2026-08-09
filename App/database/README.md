# Base de datos

Esquema de Gyro Store v2 sobre Supabase/Postgres. **Dos archivos, en orden.**

## 🟢 Producción: qué correr en el SQL Editor (Supabase nueva)

Para una base **nueva** (el caso de producción), desde el **SQL Editor** del
dashboard de Supabase, corré **estos dos, en este orden**:

1. **`01_schema.sql`** — todo el esquema.
2. **`02_seed.sql`** — datos de arranque.

Eso deja la base en su estado final. No hay nada más que correr.

**El orden importa.** El seed inserta en `accounts`, y la sección de Caja del
esquema le agrega columnas a esa tabla: sembrar antes dejaría filas con la forma
vieja. No hay runner automático ni tabla de control; el orden lo lleva quien aplica.

> ⚠️ **`01_schema.sql` es solo para bases NUEVAS.** No es idempotente —los
> `create table` son pelados a propósito— así que sobre una base con datos falla,
> y si algún statement llegara a pasar, recrearía tablas vacías sobre información
> real. Una base ya migrada no se vuelve a aplicar.

> ⚠️ Antes de correr `02_seed.sql` en producción, **revisá los valores
> financieros** (pozos, márgenes, comisión, tasa de cambio): son la configuración
> real del negocio, no ejemplos.

## Contenido del directorio

| Archivo | Qué es |
|---|---|
| `01_schema.sql` | **Todo el esquema.** Enums, secuencias, tablas con sus índices, el bucket de Storage con sus políticas, RLS deny-all, triggers de `updated_at`, los RPCs de reportería y canje, y la vista `sales_export_view`. |
| `02_seed.sql` | **Datos de arranque.** Categorías, las 8 plantillas heredadas de v1, cuentas de caja/banco y la configuración financiera. |

Solo SQL. El seed de desarrollo (productos de prueba y slides del hero) es un
script y vive con los demás: `scripts/seed-catalog.dev.mts` → `npm run seed:dev`.

## Historia del esquema

`01_schema.sql` es la **consolidación** de un baseline más once migraciones
incrementales que se le fueron aplicando y que hoy quedan **plegadas** en un solo
archivo:

- Los antiguos `0004`–`0011` (`security_invoker` en la vista de export, el embudo
  de analítica, Caja extendida, `search_path` en las funciones `security
  definer`, `invoices.seller_uid`, `pending_role_grants`, `spo_outbox` y
  `catalog_items.spo_link`) se **concatenaron** en el orden en que se ejecutaron,
  sin reescribir el SQL. Cada bloque conserva su cabecera original explicando qué
  cambia y por qué; leído de arriba abajo, el archivo cuenta la evolución.
- `0012`–`0014` se **plegaron dentro del esquema** y sus archivos sueltos se
  eliminaron por redundantes: en una base nueva su efecto ya está en
  `01_schema.sql`, y volver a correrlos fallaría (`add column icon` sobre una
  columna que ya existe, `drop table products` sobre una tabla que nunca se creó).
  Lo que hacían:
  - **0012 — baja de tablas muertas.** Se quitaron `products`,
    `whatsapp_conversations`, `whatsapp_messages`, `logistics_shipments`,
    `logistics_events` y `feedback`, más los enums `conversation_status`,
    `message_direction` y `feedback_type`. `products` era **vestigial** (su columna
    `stock` no la leía ni la escribía nadie; el stock real vive en `purchases`, el
    ledger FIFO); las otras cinco eran **features que nunca se construyeron**. No
    confundir con los roles `logistics_admin`/`logistics_customer`, que siguen vivos.
  - **0013 / 0014 — categorías.** `categories` ganó la columna `icon` (emoji corto
    para el storefront); `sort_order` se agregó y se volvió a quitar, así que la
    forma final solo suma `icon`.

`01_schema.sql` ya nace con todo esto: **32 tablas**, y aplicar `01_schema.sql` +
`02_seed.sql` deja el estado final. Todas las tablas tienen al menos un acceso
desde `App/server`, salvo `expenses` (ver abajo).

### `expenses`: leída pero nunca escrita

Se deja a propósito. Nada inserta en ella —los gastos reales se registran como
egresos en `account_movements`, en el módulo de Caja— pero el RPC
`get_expenses_by_pozo` sí la lee, y ese informe llega hasta la pantalla de
reportes (`useGetExpensesByPozoQuery`). O sea que el corte "gasto por pozo"
muestra ceros y los seguirá mostrando.

Borrarla rompería el informe, así que es una feature a medio construir, no
código muerto. Cerrarla es una decisión de producto: o se le da un camino de
escritura, o se recablea el RPC sobre `account_movements` y ahí sí se da de baja
la tabla.

## Cambios futuros (cuando producción ya esté viva)

`01_schema.sql` es el baseline y **no se edita ni se re-aplica** una vez que la
base tiene datos. Todo cambio posterior va en un **archivo incremental nuevo**,
numérico y correlativo, que se corre a mano en el SQL Editor sobre la base viva:

```
App/database/
├── 01_schema.sql
├── 02_seed.sql
└── migrations/
    └── 0015_lo_que_sea.sql   ← nuevos cambios acá, uno por archivo
```

Es decir: creá la carpeta `migrations/` el día que haya el primer cambio y poné
ahí cada incremental (idempotente, con `if not exists` / `if exists`). Lo que ya
se ejecutó contra una base real no se reescribe; el baseline queda como registro
del punto de partida.

## Seed de desarrollo

```bash
cd App && npm run seed:dev -- --confirm
```

Inserta productos de prueba y los slides del hero para ver el storefront con
contenido. UUIDs fijos + upsert, así que es re-ejecutable sin duplicar.

Pide `--confirm` a propósito: publica productos con `published: true`, o sea que
lo que siembre **aparece en la tienda**. El script imprime a qué proyecto de
Supabase va a escribir antes de hacerlo, y se niega a correr con
`NODE_ENV=production`.

Sus imágenes quedaron vacías a propósito: hay que subir los assets a Storage y
poner ahí la URL pública.

## Seguridad (RLS)

**Todas las tablas de `public` están en deny-all**, sin políticas. Nadie accede
directo desde el cliente; solo el backend con la `service_role` lee y escribe.

El esquema lo aplica en un bucle sobre `pg_tables`, así que una tabla nueva que
se olvide de activarlo queda protegida igual en una instalación limpia. Las
tablas que se agregaron después del baseline original lo activan a mano (ese
bucle solo cubrió lo que existía en su momento).

La única excepción son las políticas sobre `storage.objects`: el bucket
`public-assets` sirve las fotos del catálogo público, así que su lectura es
abierta y la escritura queda restringida a usuarios autenticados.

## Dos correlativos legales

Ambos salen de secuencias de Postgres y **ninguno se reinicia ni se reusa**:

- `invoices.invoice_code` → `GS-PR-1`, `GS-PR-2`, … (columna generada sobre `invoice_number`)
- `discount_codes.code` → `GS-DC-1`, `GS-DC-2`, …

Un número descartado queda quemado. Es lo correcto para algo que ya pudo haberse
impreso o repartido, y es la razón por la que anular una factura la deja en
estado `void` en vez de borrarla.
