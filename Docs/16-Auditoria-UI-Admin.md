# 16 · Auditoría de UI del Centro de Administración

> 🗄️ **HISTÓRICO — foto de un momento.** Es una auditoría fechada, no una lista viva: describe el
> panel tal como estaba antes de la Fase 1 de optimización. Varios de sus hallazgos ya se corrigieron
> (el overlay entre módulos, el `PageHeader` unificado, la barra de progreso). Antes de tomar
> cualquier ítem como pendiente, verificá contra el código: puede llevar meses arreglado.

> Estado: **auditoría, sin cambios de código.** Levantada antes de la Fase 1 del plan de
> optimización. Todo dato de este documento se verificó contra el código, no contra supuestos.
>
> Alcance: `app/routes/admin*.tsx` y `app/components/admin/**`, con incursiones en
> `app/components/ui/**` cuando el problema vive ahí.

---

## 0. Resumen ejecutivo

El panel está en mejor estado de lo que el plan de optimización asume. Los problemas de
**consistencia** (encabezados copiados, tabs triplicados) y de **percepción de velocidad**
(overlay bloqueante) son reales y grandes. Los de **higiene de CSS** (colores crudos, componentes
huérfanos) resultaron ser mucho menores de lo previsto.

Cinco correcciones del plan, con evidencia más abajo:

| El plan asume | La realidad |
|---|---|
| `AnimatedTabs` no tiene consumidores | Tiene **3** |
| `global-progress` es huérfano | Se usa en `root.tsx` |
| `cells`, `input-group`, `breadcrumb` huérfanos | Los tres **en uso** |
| Colores crudos "restantes" (plural) | Queda **uno solo** en todo el admin |
| `admin.inventario` tiene su filtro de periodo propio | Correcto, pero ya es condicional al tab |

Lo que sí es tan grave como dice el plan: el `ModuleLoader`, la ausencia de `max-w`, los 8
encabezados copiados a mano y las tres implementaciones de tabs.

---

## 1. Encabezados de página

**`PageHeader` existe y lo usa UNA sola ruta de diez.**

| Ruta | Encabezado |
|---|---|
| `admin.caja.tsx` | ✅ `PageHeader` (línea 147) |
| `admin._index.tsx` | ❌ a mano (259) |
| `admin.ventas.tsx` | ❌ a mano (194) |
| `admin.inventario.tsx` | ❌ a mano (96) |
| `admin.facturacion.tsx` | ❌ a mano (318) |
| `admin.cuotas.tsx` | ❌ a mano (320) |
| `admin.catalogo.tsx` | ❌ a mano (138) |
| `admin.codigos-descuento.tsx` | ❌ a mano (111) |
| `admin.usuarios.tsx` | ❌ a mano (509) — además agrega `font-heading`, que las otras no tienen |
| `admin.configuracion.tsx` | ❌ sin encabezado estándar |

Los ocho copian literalmente `text-3xl font-extrabold tracking-tight text-foreground`. El propio
`PageHeader.tsx:17` usa esa misma clase, así que **migrar las rutas no cambia nada visualmente**:
es refactor puro. Eso hace la Fase 2.3 mucho más barata de lo que parece — el cambio de escala
tipográfica (a `text-2xl font-semibold`) es una decisión aparte y posterior.

Fuera del admin hay tres usos más de `text-3xl font-extrabold` (`login`, `producto.$id`,
`combo.$id`). Son del storefront: **fuera de alcance**.

---

## 2. Tabs — tres implementaciones para el mismo control

1. **Pills a mano con `motion` + `layoutId`** — `admin.inventario.tsx` (dos niveles anidados:
   `inventory-tab-pill` e `inventory-nested-pill`). ~25 líneas de JSX repetidas por nivel.
2. **`Tabs` de shadcn** (`components/ui/tabs.tsx`) — `admin.ventas`, `admin.catalogo`,
   `admin.cuotas`.
3. **`AnimatedTabs`** (`components/ui/AnimatedTabs.tsx`) — `admin.configuracion:25`,
   `admin.usuarios:46` y `components/admin/reports/PeriodPicker.tsx:5`.

**Corrección al plan:** `AnimatedTabs` **no es huérfano**. Es, de hecho, la implementación con más
consumidores directos y ya resuelve el pill deslizante con `layoutId`. La consolidación de la Fase
7.2 debería converger **hacia** `AnimatedTabs`, no borrarlo.

---

## 3. Clases de Tailwind inválidas o sospechosas

### 3.1 `border` sin utilidad de color — 13 apariciones

`border-b border` / `border-t border` / `border-t border/50` aplican `border-width` en **los cuatro
lados** con color `currentColor`. El resultado es una caja completa donde se quería un subrayado.

| Archivo | Línea |
|---|---|
| `components/ui/stat-card.tsx` | 88 (`SectionHeader`) |
| `components/ui/DataTable.tsx` | 231, 290 |
| `routes/admin.tsx` | 417 (topbar) |
| `routes/admin.usuarios.tsx` | 585 |
| `routes/admin.cuotas.tsx` | 217 |
| `components/cart/cart-drawer.tsx` | 66, 178 |
| `components/cart/checkout-dialog.tsx` | 321 |
| `components/store/store-header.tsx` | 60 |

Las cuatro últimas son del storefront (fuera de alcance, pero es el mismo defecto).

### 3.2 Clases inexistentes

- `stat-card.tsx:37` — **`hover:border/80`**. No existe. Tailwind no genera nada: el hover de borde
  que se creía tener nunca funcionó.

### 3.3 Colores crudos que rompen el tema claro

- `stat-card.tsx:66` — `hover:border-white/10`
- `stat-card.tsx:101` — `BASE_STAT = "bg-muted/30 border hover:border-white/10"` — afecta a **todas**
  las StatCards del panel.

### 3.4 Sombras hardcodeadas en negro

- `DataTable.tsx:290` — `shadow-[0_-5px_20px_rgba(0,0,0,0.25)]` en el `<tfoot>`.
- `FilterSelect.tsx:62` — `shadow-[0_0_6px_rgba(245,158,11,0.7)]` (ámbar hardcodeado; el token
  `--warning` existe).

### 3.5 `color-scheme` fijo

`tailwind.css:116` — `html { color-scheme: dark }` mientras existe un tema claro completo. Afecta
scrollbars, `<select>` nativos y autofill: en tema claro el navegador sigue pintando controles
oscuros.

---

## 4. Colores crudos de paleta

**Solo uno en todo el admin:**

- `routes/admin.facturacion.tsx:330` — `text-amber-500` (debería ser `text-warning`).

`text-white` / `bg-white` / `text-black` aparecen en:

- `components/admin/invoices/Ticket.tsx` — **justificado**: es un ticket térmico que se imprime en
  papel blanco. No debe seguir el tema. Documentarlo, no cambiarlo.
- `TicketPrintModal.tsx:101` — `bg-white` en el contenedor del preview. Mismo motivo.
- `CurrentInventoryTable.tsx:248` — `text-white` sobre `bg-destructive`. Debe ser
  `text-destructive-foreground`.
- `NotificationsBell.tsx:187` — `text-white` sobre `bg-destructive`. Mismo caso.
- `routes/login.tsx`, `components/catalog/hero.tsx` — storefront, fuera de alcance.

---

## 5. Componentes "huérfanos" — el plan se equivoca en los cinco

| Componente | Consumidores reales |
|---|---|
| `AnimatedTabs` | `admin.configuracion`, `admin.usuarios`, `PeriodPicker` |
| `global-progress` | `root.tsx:83` (`<GlobalProgress />`) |
| `cells` (`CodeCell`, `MoneyCell`) | `CurrentInventoryTable`, `PurchasesTable` |
| `input-group` | `components/ui/command.tsx:19` |
| `breadcrumb` | `admin.tsx:18` |

**Ninguno es huérfano.** Para la Fase 1.2 esto es información útil: `GlobalProgress` ya está montado
en el root — hay que revisar qué hace hoy antes de reescribirlo, no asumir que no existe.

El único que sí queda sin uso tras los cambios recientes es **`ModuleLoader`**, y solo si la Fase 1
lo retira; `BrandLoader` (del mismo archivo) se usa en `admin.tsx:51`, `admin.usuarios:75` y
`admin.configuracion:33`.

---

## 6. Peso de las rutas

```
980  admin.usuarios.tsx        ← muy por encima del umbral
785  admin.configuracion.tsx   ←
624  admin._index.tsx          ←
492  admin.tsx                 ← shell, aceptable pero mejorable
474  admin.facturacion.tsx     ←
398  admin.cuotas.tsx
362  admin.codigos-descuento.tsx
307  admin.catalogo.tsx
264  admin.ventas.tsx          ← buen ejemplo: es un shell que compone
264  admin.caja.tsx
217  admin.inventario.tsx      ← buen ejemplo
─────
5167 total
```

Cinco rutas superan las 400 líneas. `admin.ventas` y `admin.inventario` son el modelo a seguir:
delegan en `components/admin/<modulo>/`.

---

## 7. Anti-patrones detectados

### 7.1 Overlay bloqueante en cada navegación — **el más costoso**

`admin.tsx`: `ModuleLoader` se monta en cada cambio de `location.pathname`, con mínimo de 450 ms y
tope de 6 s. Se paga el mínimo **siempre**, incluso con backend a 80 ms.

Dato a favor de la Fase 1: el overlay vive **dentro** de `SidebarInset` (línea 392), así que nunca
tapó el sidebar. El impacto es real pero acotado al área de contenido.

### 7.2 Sin ancho máximo

`admin.tsx:485` — `className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-8"`. Sin `max-w` ni
`mx-auto`. En 2560 px las tablas se estiran a ~2400 px.

### 7.3 Doble capa de animación por tarjeta

`StatCard` (`stat-card.tsx:120-140`) monta un `motion.div` con `whileHover={{ y: -3 }}` y **adentro**
un `SpotlightCard variant="highlight"`, que a su vez trae
`hover:shadow-2xl hover:-translate-y-1 transition-all duration-300` (línea 37). Dos sistemas de
elevación compitiendo en el mismo elemento, ambos moviendo el layout.

### 7.4 Dependencia inestable en `useEffect`

`admin._index.tsx:231` — `}, [reduce, kpis])`. `kpis` es el objeto de RTK Query: cambia de
referencia en cada refetch aunque los datos sean idénticos, reiniciando la animación de las barras
de pozos sin motivo. Debe depender de un primitivo estable.

### 7.5 `exhaustive-deps` silenciado

`admin.ventas.tsx:187` — único caso en rutas. Confirmar si es real o se puede resolver.

### 7.6 `catch (err: any)` — 17 apariciones

`admin.usuarios` (6), `admin.configuracion` (5), `admin.catalogo` (3), `admin.caja` (2),
`admin.codigos-descuento` (1). Existe `errMsg()` en `lib/formatters.ts` que ya normaliza el error
de RTK Query; estos `any` son anteriores a él.

### 7.7 `STATUS_META` duplicado

`admin.ventas.tsx:52` y `PurchasesTable.tsx:37` definen mapas de estado paralelos. Candidatos a
`lib/status.ts` (Fase 7.2).

### 7.8 Tabla encajonada en `Card`

`admin.ventas.tsx` — `<Card><CardContent className="pt-6"><QueryState><DataTable/>`. Sumado a
`DataTable`, que ya trae `rounded-card border bg-card shadow-lg` y `max-h-[75vh] overflow-auto`
(línea 133): doble borde, doble scroll, sombra propia.

### 7.9 Emoji en la UI del producto

`PurchasesTable.tsx` — las opciones del filtro de tránsito usan 🟢/🟠/🔴. El plan §9 prohíbe emojis.
Sustituir por puntos de color con los tokens `success`/`warning`/`destructive`.

*(Este es mío, de la sesión pasada. Lo anoto igual: la regla es la regla.)*

---

## 8. Lo que ya está bien (no tocar)

Para que la optimización no rompa aciertos:

- **Comentarios que explican el porqué.** `DataTable.tsx`, `admin.tsx` y `animated-icons/` explican
  decisiones y bugs evitados, no lo que el código ya dice. Es la mejor cualidad del repo.
- **`meta.align` en `DataTable`** ya resuelve alineación de números con `tabular-nums`.
- **Tokens semánticos** (`success`, `warning`, `info`, `tone-*`) existen y están calibrados para
  contraste en ambos temas.
- **`useReducedMotion()`** está aplicado con disciplina en todo `components/ui/`.
- **El % de los pozos sobre el total repartido** (no sobre el máximo) es la lectura correcta.
- **`AnimatedIcon`** con upgrade perezoso: los iconos son SVG plano hasta la primera interacción.

---

## 9. Orden recomendado, con la evidencia de esta auditoría

1. **Fase 1** (velocidad percibida) — sin cambios respecto al plan. Máximo impacto.
2. **Fase 2.3** (`PageHeader`) — más barata de lo previsto: es refactor sin cambio visual.
3. **Fase 7.1** (bugs de CSS) — **adelantarla**. Son ~15 líneas y `hover:border/80` +
   `hover:border-white/10` afectan a todas las StatCards. Corregirlas antes de la Fase 3 evita
   rediseñar sobre una base rota.
4. **Fase 2** (shell y `max-w`).
5. **Fase 3** (jerarquía y deltas) — la única que toca backend.
6. Resto según el plan.

**Recomendación explícita:** mover 7.1 antes de la Fase 3.

---

## 10. Mediciones base

Pendientes: bundle (`npm run analyze`, script aún no existe) y Lighthouse en `/admin` y
`/admin/ventas`. Se completan al abrir la Fase 6, que es donde el plan las ubica.
