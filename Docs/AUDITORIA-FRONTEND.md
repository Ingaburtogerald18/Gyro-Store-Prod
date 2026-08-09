# Auditoría técnica del frontend

> **Solo análisis. No se modificó código en este pase.** Fecha: 2026-08-08.
> Alcance: `App/frontend/`, foco en `app/`.
>
> Cada afirmación de "muerto/sin usar" lleva su evidencia (el grep que la respalda) y está
> filtrada por las reglas de contexto: rutas de Remix, hooks de RTK Query, imports dinámicos
> y clases dinámicas de Tailwind. Lo **CONFIRMADO** se separa de lo **SOSPECHOSO**.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Archivos `.ts/.tsx/.css` en `app/` | **198** |
| LOC de rutas (`app/routes/`) | 5.940 en 21 archivos |
| LOC de `components/ui/` | 5.992 en 43 archivos |
| LOC de CSS | 1.982 (`style-rhea.css` 1.680 + `tailwind.css` 302) |
| **Errores de `tsc --noEmit`** | **0** (frontend y backend) |
| Warnings de lint | **N/A — no hay linter configurado** |
| Archivos huérfanos confirmados | 1 (`public/logo.png`) |
| Exports sin usar confirmados | 5 |
| Dependencias sin usar | 1 confirmada + 1 sospechosa |
| CSS muerto confirmado | **1.680 líneas (85 % del CSS total)** |
| Duplicaciones detectadas | 5 |

### Los tres hallazgos que importan

1. **`style-rhea.css` es 1.680 líneas de CSS que no aplica a nada.** 404 selectores `.cn-*`,
   cero usos en el código. Es el candidato #1 a borrar y el más barato.
2. **`EXCHANGE_RATE` hardcodeado en `lib/formatters.ts`** convive con la tasa configurable del
   panel. Seis KPIs de Inventario muestran córdobas a una tasa que nadie puede actualizar.
   **Esto es un bug de datos, no una deuda estética.**
3. **`fmtDate` duplicado y DIVERGENTE**: dos funciones con el mismo nombre y salida distinta
   (una con año, otra sin).

### Estado general

El frontend está **más sano de lo que la deuda documentada sugiere**. `tsc` pasa limpio en los
198 archivos, y dos de los hallazgos grandes del `Docs/16` ya están resueltos (ver §7). Lo que
queda es sobre todo **redundancia acumulada**, no roturas.

---

## 2. Errores sin resolver

### 2.1 Typecheck

```
cd App/frontend && npx tsc --noEmit   →  0 errores
cd App        && npx tsc --noEmit   →  0 errores
```

El comentario de `store/api/baseApi.ts:31` dice que "el typecheck del frontend nunca se había
corrido". Hoy sí corre y pasa: el último error pendiente (`GeneralConfig.tsx:209`, un `""`
contra un enum de bancos) se cerró en la sesión previa a esta auditoría.

### 2.2 Lint

**No hay linter.** No existe `eslint.config.*`, `.eslintrc*`, `prettier` ni `biome` en
`App/frontend/`, y `package.json` no tiene script `lint`. Los scripts son: `dev`, `build`,
`start`, `typecheck`.

**Consecuencia:** los 3 `eslint-disable` del código son **comentarios inertes** — no suprimen
nada porque no hay nada que suprimir.

| Archivo | Línea | Comentario | Estado |
|---|---|---|---|
| `app/hooks/useTheme.ts` | 22 | `react-hooks/exhaustive-deps` | Inerte |
| `app/components/ui/DataTable.tsx` | 40 | `@typescript-eslint/no-unused-vars` | Inerte |
| `app/components/ui/CountUp.tsx` | 41 | `react-hooks/exhaustive-deps` | Inerte |

> **Propuesta:** decidir. O se instala ESLint (y entonces esos disables recuperan sentido y
> aparecerán warnings reales que hoy nadie ve), o se borran los tres comentarios por engañosos.
> Instalarlo es lo recomendable: sin linter, errores como dependencias faltantes en `useEffect`
> solo se descubren en runtime.

### 2.3 `console.*` en producción

6 apariciones. Ninguna es depuración olvidada; todas son manejo de error. Aun así, el frontend
no tiene logger propio y en producción van a la consola del navegador.

| Archivo | Línea | Contexto | Propuesta |
|---|---|---|---|
| `app/entry.server.tsx` | 67 | Error de render SSR | **Mantener** (es el hook de error de Remix) |
| `app/routes/login.tsx` | 41 | Fallo de OAuth | Mantener; considerar `toast` además |
| `app/components/admin/config/ImagesConfig.tsx` | 95, 141 | `.catch(console.error)` en borrado de huérfanos en R2 | Silencioso para la persona: si falla la limpieza no se entera. Evaluar `toast.warning` |
| `app/components/admin/inventory/ArrivalModal.tsx` | 54 | Falla la simulación de costo | El campo queda vacío sin explicación → `toast` |
| `app/components/admin/inventory/EditArrivalModal.tsx` | 65 | Ídem | Ídem |

### 2.4 Tipos laxos

~55 apariciones de `: any` / `as any` / `as unknown as`. Se separan por naturaleza:

**Ruido de bajo riesgo (≈40):** `catch (err: any)` en bloques try/catch. Es el patrón de todo
el proyecto. Ya existe el helper `errMsg(err, fallback)` en `lib/formatters.ts:53` que tipa
esto correctamente, y **se usa solo en `contacto.tsx`**.
→ *Propuesta: migrar los `catch (err: any)` a `catch (err)` + `errMsg(err, '…')`. Esfuerzo bajo,
mecánico, elimina ~40 `any` de una.*

**Casts que tapan un problema real (5) — revisar uno por uno:**

| Archivo | Línea | Cast | Nota |
|---|---|---|---|
| `components/admin/config/FinanzasConfig.tsx` | 83, 84 | `zodResolver(...) as any`, `{} as any` | `defaultValues: {} as any` significa que el formulario arranca vacío contra un schema que exige campos. Funciona porque `reset()` llega antes de renderizar, pero es frágil |
| `components/admin/config/FinanzasConfig.tsx` | 194, 236, 278 | `control={control as any}` | El `CeilingField` recibe `Control<FinancialConfig>` pero se le pasa con cast: el tipo del sub-form no encaja |
| `components/admin/config/GeneralConfig.tsx` | 38 | `zodResolver(...) as any` | Efecto del `superRefine` de `businessInfoSchema`: `zodResolver` no infiere bien sobre `ZodEffects` |
| `components/ui/DataTable.tsx` | 466, 576 | `(row.original as any).id` | La tabla asume que toda fila tiene `id`. Debería ir en el genérico: `<T extends { id: string }>` |
| `components/ui/cells.tsx` | 53 | `items: any[]` | Prop sin tipar en un componente compartido |

### 2.5 TODO / FIXME / HACK

Solo **1 real**. El resto de coincidencias son la palabra española "TODO/TODOS".

| Archivo | Línea | Contenido |
|---|---|---|
| `app/routes/combo.$id.tsx` | 10 | `z.array(z.unknown())` — forma sin definir (TODO en `shared/schemas.ts`) |

---

## 3. Código muerto

### 3.1 CONFIRMADO

#### `app/style-rhea.css` — 1.680 líneas · **el hallazgo más grande**

**Evidencia:**
```
grep "cn-[a-z]" app/**/*.tsx  →  0 resultados
grep "cn-[a-z]" app/**/*.ts   →  0 resultados
grep -c "\.cn-" app/style-rhea.css  →  404 selectores
```

Está **cableado pero inerte**: `tailwind.css:21` lo importa y `root.tsx:63` pone
`className="style-rhea"` en `<html>`, así que la cascada existe — pero **ningún componente usa
una sola clase `.cn-*`**. Las primitivas de `components/ui/` se estilizan con `cva` + Tailwind
inline.

Se verificó además que el archivo **no define tokens ni variables CSS**: su única regla que no
es `.cn-*` es el envoltorio `.style-rhea {`. El tema real (`--color-*`, `--success`, etc.) vive
en `tailwind.css`. **Borrarlo no puede afectar el aspecto de nada.**

→ **Acción:** borrar `style-rhea.css`, la línea `@import` de `tailwind.css:21` y el
`className="style-rhea"` de `root.tsx:63`. Riesgo: bajo. Verificación: comparar capturas del
storefront y del panel antes/después.

#### Exports sin consumir

| Símbolo | Archivo | Evidencia |
|---|---|---|
| `ModuleLoader` | `components/ui/module-loader.tsx:129` | Única referencia fuera del archivo: un **comentario** en `routes/admin.tsx:313` que dice "Acá vivía un `ModuleLoader`…". Retirado en la Fase 1 (ver `Docs/08 §9`) pero el componente quedó |
| `SectionHeader` | `components/ui/stat-card.tsx:96` | 0 usos. Marcado `@deprecated` en el propio archivo |
| `useGetAdminProductQuery` | `store/api/catalogAdminApi.ts:173` | 0 usos fuera del `*Api.ts` |
| `useGetSalesExportQuery` | `store/api/reportsApi.ts:171` | 0 usos. Solo se usa la variante `useLazyGetSalesExportQuery` |
| `useGetDeliverySummaryQuery` | `store/api/reportsApi.ts:178` | 0 usos |

> Filtro aplicado: se buscó el **hook**, no el nombre del endpoint, y se excluyeron los archivos
> `*Api.ts` (donde solo aparece la declaración del export).

#### Assets

| Archivo | Evidencia |
|---|---|
| `public/logo.png` | 0 referencias en `app/`, `server/` o `database/` |

`public/gyro-emblem.png` **sí se usa**: favicon (`root.tsx:28`), slide por defecto del hero
(`server/services/landing.ts:21`) y el seed de dev.

#### Dependencias

| Paquete | Tipo | Evidencia |
|---|---|---|
| `shadcn` | `dependencies` | 0 imports. Es una **CLI**, se invoca con `npx shadcn@latest`. No debería ser dependencia de runtime |

### 3.2 SOSPECHOSO — requiere verificación humana

| Ítem | Por qué no lo declaro muerto |
|---|---|
| `react-is` (`dependencies`) | 0 imports directos, pero suele ser peer transitiva de `recharts` / `react-redux`. Puede estar declarada a propósito para fijar una versión. **Verificar con `npm ls react-is` antes de tocar** |
| `<Delta>` (`components/ui/delta.tsx`, 79 líneas) | **Sí se usa**, pero solo en `components/admin/reports/HeroMetric.tsx` (líneas 56 y 157). No es muerto; es un componente de un solo consumidor. Candidato a plegar dentro de `HeroMetric` si no se prevén más usos |

### 3.3 Herramientas que NO pude ejecutar

`npx depcheck`, `npx knip`, `npx madge --orphans` y `npx madge --circular` **no se pudieron
correr**: el sandbox de shell rechazó los comandos de forma intermitente durante toda la
auditoría. El análisis de código muerto de arriba se hizo **manualmente con grep**, aplicando
los filtros de contexto.

> **Queda pendiente** correr esas tres herramientas para: (a) confirmar la lista de deps sin
> usar, (b) detectar archivos huérfanos que el grep manual no cubrió, y (c) **detectar
> dependencias circulares, que no se analizaron en absoluto**.

---

## 4. Redundancia y unificación

### 4.1 Tabs — tres implementaciones · esfuerzo MEDIO

Confirmado que sigue vigente (ya estaba en `Docs/16 §2`).

| Implementación | Call-sites |
|---|---|
| **Pills a mano** con `motion` + `layoutId` | `routes/admin.inventario.tsx` (dos niveles anidados) |
| **`Tabs` de shadcn** | `admin.catalogo.tsx:25`, `admin.ventas.tsx:37`, `admin.cuotas.tsx:28`, `admin.crm.tsx:23`, `admin.inventario.tsx:16`, `components/admin/users/UserDetailDialog.tsx:42` |
| **`AnimatedTabs`** | `admin.usuarios.tsx:22`, `admin.configuracion.tsx:5`, `components/admin/reports/PeriodPicker.tsx:5` |

→ **Converger a `AnimatedTabs`** (ya resuelve el pill deslizante con `layoutId`). 6 call-sites a
migrar. **Ojo:** `UserDetailDialog` usa `TabsContent`, que `AnimatedTabs` no ofrece — habría que
agregarlo o dejar ese caso con shadcn.

### 4.2 `fmtDate` duplicado **y divergente** · esfuerzo BAJO

| Archivo | Línea | Formato |
|---|---|---|
| `routes/admin.crm.tsx` | 47 | `{ day:'2-digit', month:'short' }` — **sin año** |
| `components/admin/crm/Contact360Dialog.tsx` | 38 | `{ day:'2-digit', month:'short', year:'numeric' }` — **con año** |

No es solo duplicación: **el mismo nombre da salidas distintas** en dos pantallas del mismo
módulo. Una fecha de 2025 y una de 2026 se ven idénticas en la agenda del CRM.

→ Un único `formatShortDate(iso, { withYear? })` en `lib/formatters.ts`, que hoy tiene 13
exports y **ningún formateador de fecha**.

### 4.3 Markup de tarjeta duplicado literalmente · esfuerzo BAJO

`components/catalog/SortableCatalogGrid.tsx:129-146` y `components/catalog/CombosPanel.tsx:127-145`
contienen el bloque **imagen + badge Público/Oculto carácter por carácter idéntico** (~18 líneas):
mismo `aspect-square`, mismo fallback `Image01Icon`, mismas clases del `Badge`.

→ Extraer `<CatalogCardMedia image={} alt={} published={} />` a `components/catalog/`.

### 4.4 `EXCHANGE_RATE` hardcodeado · esfuerzo BAJO · **impacto ALTO**

`lib/formatters.ts:49` → `export const EXCHANGE_RATE = 36.6241;`
`lib/formatters.ts:76` → `cordobasFromUsd()` la usa.

Consumido por **6 KPIs** de `components/admin/inventory/InventoryKpis.tsx` (líneas 53, 54, 55,
70, 71, 72).

Mientras tanto la tasa real es **configurable**: viene en `/api/config` como `exchangeRate`,
se siembra de `EXCHANGE_RATE=37` del env, y es editable desde el panel (doc 11 §9).

→ **Los KPIs de Inventario convierten a córdobas con una tasa distinta a la del resto del
sistema, y nadie puede corregirla desde la UI.** `cordobasFromUsd` debe recibir la tasa como
parámetro (o pasar a hook que lea `useGetConfigQuery`).

### 4.5 `QueryState.fetching` aplicado en 1 de ~12 pantallas · esfuerzo BAJO

`Docs/08 §9` lo daba como pendiente. **Confirmado: sigue así.** Única aparición:
`routes/admin.ventas.tsx:437`.

El prop existe y está bien documentado en `QueryState.tsx:31`: en un refetch atenúa el contenido
en vez de reemplazarlo por un esqueleto. Sin él, cada refetch vacía la tabla que la persona
estaba leyendo.

→ Extender a inventario, facturación, cuotas, caja, CRM, códigos.

---

## 5. Recorrido carpeta por carpeta

### `app/routes/` — 21 archivos · 5.940 líneas

Todas son **puntos de entrada de Remix**: ninguna se marca como huérfana por no tener
importadores.

**Rutas > 250 líneas (candidatas a partir en `components/<módulo>/`):**

| Ruta | Líneas | Nota |
|---|---|---|
| `admin.caja.tsx` | **731** | La más grande del proyecto. Contiene 5 `catch (err:any)`, 6 `cell:(info:any)` y varios diálogos inline. **Prioridad 1 para partir** |
| `admin.ventas.tsx` | 506 | Ya extrae `SaleEditor` (lazy) |
| `admin.tsx` | 485 | Layout + sidebar + topbar. Es un shell, su tamaño es más defendible |
| `admin.facturacion.tsx` | 478 | Ya extrae `InvoiceEditor` (lazy) |
| `admin.cuotas.tsx` | 400 | Sin extracciones |
| `admin.codigos-descuento.tsx` | 362 | Sin extracciones |
| `admin.catalogo.tsx` | 340 | Ya extrae 3 paneles (lazy) |
| `producto.$id.tsx` | 311 | Storefront |
| `admin.crm.tsx` | 290 | Contiene el `fmtDate` duplicado (§4.2) |
| `admin._index.tsx` | 281 | Dashboard; extrae `SalesTrendChart` (lazy) |

`admin.configuracion.tsx` (43 líneas) es el **modelo a seguir**: orquestador delgado que solo
elige qué pestaña montar.

### `app/components/ui/` — 43 archivos · 5.992 líneas

Mezcla primitivas de shadcn con componentes propios. Los dos más grandes son propios:

| Archivo | Líneas | Estado |
|---|---|---|
| `sidebar.tsx` | 710 | Primitiva shadcn. En uso (`admin.tsx`) |
| `DataTable.tsx` | 659 | Propio. En uso. Contiene 2 `as any` (§2.4) y 1 `eslint-disable` inerte |
| `stat-card.tsx` | 215 | En uso, **pero exporta `SectionHeader` muerto** (§3.1) |
| `module-loader.tsx` | 148 | `BrandLoader` en uso (7 call-sites); **`ModuleLoader` muerto** (§3.1) |
| `delta.tsx` | 79 | Un solo consumidor (§3.2) |
| `AnimatedTabs.tsx` | 56 | 3 consumidores. **Es el destino de la consolidación de tabs**, no un huérfano |

**Confirmado en uso** (el `Docs/16` ya había corregido la suposición contraria):
`global-progress.tsx` (`root.tsx`), `cells.tsx`, `input-group.tsx`, `breadcrumb.tsx`.

### `app/components/admin/` — 7 subcarpetas

| Subcarpeta | Observación |
|---|---|
| `config/` | **Recién consolidada**: las 4 pestañas comparten `useConfigSection.ts`. Quedan 6 `as any` (§2.4) |
| `crm/` | `Contact360Dialog.tsx` tiene el `fmtDate` divergente (§4.2) |
| `inventory/` | `InventoryKpis.tsx` es el consumidor del `EXCHANGE_RATE` hardcodeado (§4.4). `ArrivalModal`/`EditArrivalModal` tragan errores con `console.error` (§2.3) |
| `invoices/` | `InvoiceEditor` cargado lazy desde `admin.facturacion` |
| `reports/` | `HeroMetric` es el único consumidor de `<Delta>` |
| `sales/` | `SaleEditor` cargado lazy |
| `users/` | Recién reorganizado (secciones Datos/Administración) |

### `app/components/catalog/` — 14 archivos

Contiene la duplicación de markup de §4.3. Tres componentes se cargan **lazy** desde
`admin.catalogo.tsx` — no marcarlos como huérfanos: `ProductEditorDialog`, `TemplatesPanel`,
`CombosPanel`.

### `app/store/api/` — 15 archivos

`configApi.ts` (8 líneas) es una **fachada legítima**, no un duplicado: re-exporta
`useGetConfigQuery` de `sessionApi` para los call-sites que importan `~/store/api/configApi`.
Está documentado en su cabecera. **Mantener.**

3 hooks sin consumir (§3.1). El resto se consume vía hooks generados.

### `app/lib/` · `app/hooks/` · `app/types/`

- `lib/formatters.ts` — 13 exports. Le falta el formateador de fechas (§4.2) y contiene el
  `EXCHANGE_RATE` problemático (§4.4).
- `hooks/` — `useTheme`, `useMediaQuery`, `useAnyQueryPending`, `useCategoryLabel`. Todos en uso.

### Raíz de `app/`

| Archivo | Estado |
|---|---|
| `root.tsx` | Entrada. Aplica `className="style-rhea"` (a quitar con §3.1) |
| `entry.server.tsx` | Entrada de SSR |
| `tailwind.css` | 302 líneas. **El tema real vive acá.** Mantener |
| `style-rhea.css` | 1.680 líneas. **Muerto** (§3.1) |
| `env.d.ts` | Tipa `window.ENV` y el flag `v3_singleFetch` |

---

## 6. Acciones priorizadas

| # | Acción | Severidad | Esfuerzo | Riesgo | ¿Automatizable? |
|---|---|---|---|---|---|
| 1 | **Parametrizar `EXCHANGE_RATE`** (§4.4) | **Alta** | Bajo | Medio | No — requiere criterio |
| 2 | **Borrar `style-rhea.css`** + import + className (§3.1) | Media | Bajo | Bajo | Sí, con verificación visual |
| 3 | **Unificar `fmtDate`** (§4.2) | Media | Bajo | Bajo | No — hay que decidir si lleva año |
| 4 | Extender `QueryState.fetching` (§4.5) | Media | Bajo | Bajo | Sí |
| 5 | Borrar `ModuleLoader`, `SectionHeader`, 3 hooks, `logo.png` (§3.1) | Baja | Bajo | Bajo | Sí |
| 6 | `catch (err:any)` → `errMsg()` (§2.4) | Baja | Bajo | Bajo | Sí, mecánico |
| 7 | Extraer `CatalogCardMedia` (§4.3) | Baja | Bajo | Bajo | Sí |
| 8 | Decidir sobre ESLint (§2.2) | Media | Medio | Bajo | No — es una decisión |
| 9 | Partir `admin.caja.tsx` (731 líneas) (§5) | Media | **Alto** | Medio | No |
| 10 | Consolidar tabs en `AnimatedTabs` (§4.1) | Baja | Medio | Medio | No — falta `TabsContent` |
| 11 | Quitar `shadcn` de `dependencies` (§3.1) | Baja | Bajo | Bajo | Sí |
| 12 | Correr `depcheck`/`knip`/`madge` (§3.3) | Media | Bajo | Nulo | Sí |

**Empezar por 1.** Es el único que produce datos incorrectos hoy; el resto es higiene.

---

## 7. Estado de la deuda ya documentada

Verificación contra `Docs/16-Auditoria-UI-Admin.md` y `Docs/08-Deuda-tecnica.md §9`:

| Ítem documentado | Estado hoy | Evidencia |
|---|---|---|
| `PageHeader` usado por 1 de 10 rutas | ✅ **RESUELTO** | Ahora lo usan **14 archivos** de `routes/` |
| `border-b border` sin color · 13 apariciones | ✅ **RESUELTO** | `grep "border-[btlr] border[\" ]"` → **0 resultados** |
| Overlay `ModuleLoader` en cada navegación | ✅ **RESUELTO** | Retirado de `admin.tsx`; queda la barra `GlobalProgress` |
| …pero el componente sigue en el repo | ❌ **PENDIENTE** | Sigue exportado y sin usar (§3.1) |
| Ausencia de `max-w` en el contenido | ✅ **RESUELTO** | `admin.tsx` aplica `max-w-[1600px]` |
| Tabs triplicados | ❌ **PENDIENTE** | Confirmado, sin cambios (§4.1) |
| `QueryState.fetching` solo en `admin.ventas` | ❌ **PENDIENTE** | Confirmado: 1 sola aparición (§4.5) |
| `CountUp` en KPIs secundarios | ⏸️ **DIFERIDO** a la Fase 3 (decisión ya tomada en doc 08) |
| Emojis 🟢/🟠/🔴 en `PurchasesTable` | ✅ **RESUELTO** | 0 emojis; usa `lib/transit.ts` con bandas de color por token |

**Doc 16 quedó desactualizado en 5 de sus 9 ítems.** Conviene anotarlo ahí para que nadie lo
lea como lista de pendientes.

---

## 8. Riesgos y falsos positivos considerados

Lo que **NO** hay que tocar, y por qué:

- **`app/routes/*.tsx`** — Remix los auto-descubre por convención de nombre. No tienen
  importadores y eso es correcto. Ídem `root.tsx` y `entry.server.tsx`.
- **Los 6 componentes cargados con `lazy()`** — `ProductEditorDialog`, `TemplatesPanel`,
  `CombosPanel` (desde `admin.catalogo`), `SalesTrendChart` (desde `admin._index`), `SaleEditor`
  (desde `admin.ventas`), `InvoiceEditor` (desde `admin.facturacion`). Su import es un **string**
  dentro de `import()`: una búsqueda por nombre de símbolo no los encuentra.
- **`configApi.ts`** — parece un duplicado de `sessionApi` y no lo es: es una fachada de
  re-export documentada, sobre la misma instancia de `baseApi`.
- **`AnimatedTabs`** — auditorías previas lo dieron por huérfano. Tiene 3 consumidores y es el
  destino recomendado de la consolidación.
- **Iconos de `@hugeicons`** — son *data*, se pasan como prop a `<HugeIcon icon={X}/>`. Un icono
  importado y usado solo como valor no es "sin usar".
- **Clases de Tailwind** — el proyecto genera clases por variantes (`cva`) e interpolación. No
  se declaró ninguna clase muerta salvo las `.cn-*`, donde la evidencia es total: 404 selectores
  con **cero** apariciones en `.ts`/`.tsx`.
- **`react-is`** — sin imports directos, pero probablemente peer transitiva. Marcado como
  sospechoso, no confirmado.

### Limitación de esta auditoría

`depcheck`, `knip` y `madge` **no se ejecutaron** (§3.3). En consecuencia:

- La lista de dependencias sin usar puede estar incompleta.
- **No se analizaron dependencias circulares.** Es el único apartado del encargo sin cubrir.
- Los archivos huérfanos se buscaron por grep manual, que es menos exhaustivo que un
  analizador del grafo de imports.
