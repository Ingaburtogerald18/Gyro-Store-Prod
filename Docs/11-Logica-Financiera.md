# 11 · Lógica financiera y operativa — Gyro Store v2

> Toda la matemática del negocio (costeo, pozos, precios, comisiones, mayoreo) sale de mi Excel real
> (`Compras-Mayo.xlsx`, hojas Compras/Stock/Costos Fijos/Ventas/Reportería/Mayor). Acá la dejo
> documentada al detalle para que el **backend (Postgres/TS) la calcule solo**, sin que nadie pueda
> romper una fórmula por accidente como pasa en Excel. **Las cifras de las tablas son las reales de mi
> simulación**; las dejo como valores por defecto, pero **todas son editables desde el panel**
> (viven en `app_config`, ver §9).

## Reglas de oro de este dominio
1. **Todo se calcula en el servidor**, en `numeric` de Postgres (no floats — el Excel arrastra ruido
   tipo `1.75000000002`; con `numeric` eso no pasa).
2. **Se congela al aprobar la venta.** Cada venta guarda una foto de sus números (coste, comisión,
   pozos, ganancia). Cambiar un costo o un % después **no reescribe** ventas viejas. [decisión tomada]
3. **Todas las tablas de tiers y % son configurables** desde el admin. [decisión tomada]
4. **La tasa de cambio se congela por lote de compra.** Si mañana sube el dólar, el costo histórico
   de un lote ya recibido no se mueve.

---

## 1. Costeo de inventario (Compras → Stock)

Cuando registro una compra de China, por cada línea de producto:

| Paso | Fórmula | Ejemplo (IN1) |
|---|---|---|
| Pre-Total (USD) | `Cantidad × Costo China` | `5 × 4.61 = 23.05` |
| Total compra (USD) | `Pre-Total + (Cantidad × Impuesto unit)` | `23.05 + (5 × 0.2068) = 24.084` |
| Costo unitario origen (USD) | `Total / Cantidad` | `24.084 / 5 = 4.8168` |
| Costo real (USD) | `Costo unitario origen + Envío unit` | `4.8168 + 0.4041 = 5.2209` |
| **Costo real (C$)** | `Costo real (USD) × Tasa de cambio` | `5.2209 × 37 = 193.1733` |

- **`Impuesto unit`** y **`Envío unit`** son montos **por unidad en USD** que entro en la compra
  (en la simulación fueron `0.2068` y `0.4041`; varían por lote). No son porcentajes.
- **`Tasa de cambio`** (37 en la simulación) se **congela en el lote** al recibirlo.

---

## 2. Costo Fijo Unitario (Costo F/U) y los "pozos"

A cada producto se le asigna un **Costo Fijo Unitario** según una **escala escalonada por su Costo
real en C$** (no en USD — el Excel usa C$):

| Costo real (C$) | Costo F/U (C$) |
|---|---|
| < 100 | 15 |
| 100 – 200 | 25 |
| 200 – 300 | 35 |
| 300 – 500 | 55 |
| 500 – 800 | 75 |
| 800 – 1300 | 95 |
| 1300 – 2000 | 120 |
| > 2000 | 150 |

Ese Costo F/U **no es ganancia**: se reparte automáticamente en **7 pozos** (presupuestos mensuales).
Los % suman **100%**:

| Pozo | % del Costo F/U | Para qué |
|---|---|---|
| Publicidad | 25% | FB, IG, TikTok |
| Mantenimiento Web | 7% | Render, Cloudflare, Supabase |
| Útiles | 5% | bolsas, papel, teip, tarjetas |
| Garantías | 8% | dañados, regalías, perdidos |
| **Préstamos (Ficosha)** | **40%** | préstamo de la tienda |
| Suscripciones | 5% | Canva, Claude |
| Servicios básicos | 10% | servicios de la casa |
| **Total** | **100%** | |

> Ejemplo: Costo F/U = 25 → Publicidad 6.25, Mantenimiento 1.75, Útiles 1.25, Garantías 2.00,
> Préstamos 10.00, Suscripciones 1.25, Servicios 2.50. (Suma 25.)

**Semántica del pozo:** cada venta "recoge" el Costo F/U de sus unidades y lo acumula en cada pozo.
En reportes veo cuánto hay reservado por pozo (§8). Como el Costo F/U ya está dentro del costo del
producto, el gasto real no baja la ganancia hasta que **supera** lo acumulado en su pozo.

**Coste final (C$) = Costo real (C$) + Costo F/U.**
Ejemplo IN1: `193.1733 + 25 = 218.1733`.

---

## 3. Precio de venta público (PVP)

El sistema **sugiere** un precio con margen bruto escalonado según el **Coste final**:

`Precio sugerido = Coste final / (1 − Margen)`

| Coste final (C$) | Margen |
|---|---|
| < 50 | ⚠️ Error (no vender tan barato) |
| ≤ 300 | 43% |
| ≤ 500 | 41% |
| ≤ 900 | 37% |
| ≤ 1500 | 33% |
| ≤ 2500 | 30% |
| > 2500 | 25% |

> Ejemplo IN1: `218.1733 / (1 − 0.43) = 382.76`.

- **Precio tentativo (manual):** puedo redondear el sugerido (ej. de `382.76` → `400`). **El precio
  tentativo es el que manda**: es el que se cobra y con el que se calcula la ganancia.
- **Ganancia unitaria (retail) = Precio tentativo − Coste final.** Ejemplo: `400 − 218.1733 = 181.83`.

---

## 4. Ventas y comisiones (por línea de producto)

Cuando el vendedor registra una venta, por cada línea el sistema calcula:

| Paso | Fórmula | Ejemplo (IN1, 1 und a C$400) |
|---|---|---|
| Importe | `Precio unitario × Cantidad` | `400` |
| Coste unitario | `Coste final` (del producto) | `218.1733` |
| **Utilidad bruta** | `(Precio unitario − Coste final) × Cantidad` | `181.8267` |
| **Salary (deducción admin 20%)** | `Utilidad bruta × 20%` | `36.3653` |
| **Utilidad neta** (base comisionable) | `Utilidad bruta − Salary` | `145.4614` |
| **Comisión vendedor** | escala sobre Utilidad neta (abajo) | `145.46 × 40% = 58.1845` |
| **Ganancia tienda** | `Utilidad neta − Comisión` | `87.2768` |

**Escala de comisión (tramo único sobre la Utilidad neta):**

| Utilidad neta (C$) | Comisión |
|---|---|
| ≤ 100 | 45% |
| ≤ 200 | 40% |
| ≤ 400 | 37% |
| ≤ 500 | 35% |
| ≤ 600 | 31% |
| ≤ 900 | 27% |
| **> 900** | **27%** (el último tramo se extiende como catch-all — decisión §10.3) |

- **Tramo único:** se busca el rango y ese % se aplica a **toda** la utilidad neta (no marginal). [decisión]
- **Por línea:** la utilidad **bruta** de la línea es `(precio − coste_final) × cantidad`, y la neta es
  esa bruta menos el Salary: `(precio − coste_final) × cantidad × (1 − salary%)`. Con ese total se
  busca el tramo. [decisión, cerrada en §10.4]
- **El Salary (20%) es un fondo de la empresa**: no es del vendedor ni cuenta como "ganancia tienda";
  se acumula aparte (§8).
- **Todo esto se congela al aprobar** la venta (foto en `order_items`).

---

## 5. Venta al por mayor (mayoreo) — reglas finales (reemplazan al Excel "Mayor")

> **[v2 · doc 14] El storefront público YA NO auto-aplica ni anuncia este descuento** a compradores
> anónimos. Este mayoreo sigue existiendo **tal cual** abajo, pero como herramienta del **cotizador
> del vendedor** (staff, doc 12 §2C) o para un cliente mayorista ya aprobado por admin (doc 14 §7) —
> nunca visible/automático para quien navega el catálogo sin cuenta. La estrategia pública ahora es de
> **escasez**: mensajes tipo "registrate para obtener códigos" en vez de mostrar el descuento. Detalle
> de por qué (los tres tipos de incentivo) en §5.2 más abajo.

El cotizador aplica un descuento automático por volumen **sobre el precio cargado del producto**
(precio base/tentativo, no el sugerido matemático). El descuento baja el precio y, con eso, baja la
utilidad y la comisión por la **misma cadena de §4** (no hay una fórmula aparte):

| Cantidad (misma línea) | Descuento | Precio mayoreo |
|---|---|---|
| ≥ 2 | 2.5% | `Precio × 0.975` |
| ≥ 3 | 5% | `Precio × 0.95` |
| ≥ 6 | 10% | `Precio × 0.90` |
| ≥ 12 | 15% | `Precio × 0.85` + alerta |

- Se aplica el **tramo más alto** que cumpla la cantidad.
- A partir de **≥ 12** el servidor devuelve `warning: "Cotización sugerida"` y el frontend muestra
  *"Mejor haz una cotización para obtener mejores descuentos"* (para descuentos mayores con autorización).
- **Base de la ganancia:** el precio con descuento entra a la cadena normal de §4 contra el **Coste
  final** (utilidad bruta → −20% salary → utilidad neta → comisión). [decisión §10.3]

> ⚠️ **A verificar al codear:** esto **cambia** respecto al Excel viejo (la hoja "Mayor" restaba solo
> el *Costo real*, sacrificando los pozos). Con la cadena normal, en productos de margen fino y
> descuento máximo (15%) el precio podría acercarse al Coste final → validar que la utilidad no quede
> negativa (piso = no vender bajo Coste final).

### 5.1 Los tres tipos de incentivo (no son lo mismo) [v2 · doc 14 §6]

| Tipo | Qué es | ¿Dónde vive la regla? |
|---|---|---|
| **(a) Volumen / mayoreo** | La tabla de arriba (§5) | Cotizador del vendedor / cliente mayorista aprobado — **no** es un código, es una regla de precio |
| **(b) Lealtad** | Código único por cada 3 compras **entregadas**, atado a una cuenta | `discount_codes` (`kind='loyalty'`), doc 14 §5 |
| **(c) Promoción / campaña** | Código público por canal, con tope y vencimiento | `discount_codes` (`kind='campaign'`), doc 14 §10 |

### 5.2 Economía del código de lealtad [v2 · doc 14 §5]
Igual que el mayoreo, el código de lealtad **entra a la misma cadena de §4** contra el Coste final —
no hay una fórmula aparte para él. La regla dura: **el valor del código nunca puede dejar la venta con
utilidad negativa.** Tiene que caber dentro de los tiers de margen del §3, igual que el piso que ya
aplico al mayoreo (arriba). Al definir el valor/porcentaje del código de lealtad (vive en `app_config`,
§9), se valida contra esta misma regla antes de activarlo.

### 5.3 Códigos de campaña — no tocan la cadena de comisión igual
Un código de campaña (`TIKTOK10`, `IG10`...) es de **captación**, no de venta recurrente: se valida en
servidor igual que cualquier código (existe, no venció, no superó el tope de usos), y el descuento que
aplique entra a la misma cadena del §4 (baja precio → baja utilidad → baja comisión), igual que el
mayoreo. La diferencia con lealtad/mayoreo es de **negocio** (a quién se le da y por qué — doc 14 §10),
no de matemática.

---

## 6. Ejemplo completo de punta a punta (IN1)

```
Compra:  5 und × $4.61 + impuesto $0.2068/u  → costo origen $4.8168/u
Envío:   +$0.4041/u                          → costo real  $5.2209/u
Tasa 37: × 37                                → Costo real   C$193.17
Costo F/U (tier 100–200): C$25 → pozos: Pub 6.25 / Mant 1.75 / Út 1.25 / Gar 2 / Prés 10 / Susc 1.25 / Serv 2.5
Coste final: 193.17 + 25       = C$218.17
PVP sugerido (margen 43%):     = C$382.76   → precio tentativo redondeado = C$400
── Venta de 1 und a C$400 ──
Utilidad bruta:  400 − 218.17  = C$181.83
Salary (20%):                  = C$36.37   (fondo empresa)
Utilidad neta:                 = C$145.46
Comisión (tramo ≤200 → 40%):   = C$58.18   (vendedor)
Ganancia tienda:               = C$87.28
```

---

## 7. Inventario migrado (Excel viejo) — FUERA DE ALCANCE por ahora

`migrated_inventory` **queda fuera del alcance de v2 por el momento** (decisión §10.5). No se le
aplican Costo F/U ni pozos: si algún día se vende, va con su **costo puro heredado** del Excel. No lo
implemento hasta que lo decida explícitamente.

---

## 8. Qué muestra la reportería (calculado con SQL)

Por vendedor y en total, sin intervención manual:
- **# ventas, unidades, total vendido, coste total, comisión total, ganancia tienda total.**
- **Salary acumulado** (fondo empresa, el 20% de todas las utilidades brutas).
- **Pozos recogidos:** cuánto hay acumulado en cada uno de los 7 pozos (Publicidad, Mantenimiento,
  Útiles, Garantías, Préstamos, Suscripciones, Servicios).

> En la simulación: 107 ventas, vendido C$120,540, coste C$78,748, comisión C$11,480, **ganancia
> tienda C$21,953**, y C$7,180 recogidos en pozos. Esos números salen todos de las fórmulas de arriba.

---

## 9. Tablas configurables (viven en `app_config`)

Todo esto lo edito desde el admin, sin tocar código:
1. **Tasa de cambio por defecto** (se congela por lote al recibir).
2. **Escala de Costo F/U** (los 8 tramos de Costo real C$ → monto).
3. **% de los 7 pozos** (deben sumar 100%; el sistema valida).
4. **Escala de márgenes del PVP** (los 6 tramos de Coste final → %).
5. **% de Salary** (hoy 20%).
6. **Escala de comisión** (los tramos de Utilidad neta → %).
7. **Descuentos de mayoreo** (los 4 tramos de cantidad → %: ≥2, ≥3, ≥6, ≥12).

> Regla del servidor: al guardar los % de pozos, validar que sumen 100%. Al calcular una venta,
> **guardar qué versión de la config se usó** (o directamente los valores resultantes) para el snapshot.

---

## 10. Decisiones cerradas (Reglas finales de negocio)
Las dudas que el Excel no cerraba ya fueron resueltas y quedan estipuladas así:
1. **Mayoreo:** 
   - `>= 2 unidades` del mismo producto = **2.5%** de descuento.
   - `>= 3 unidades` = **5%** de descuento.
   - `>= 6 unidades` = **10%** de descuento.
   - `>= 12 unidades` = **15%** de descuento. El sistema muestra una alerta al vendedor: *"Mejor haz una cotización para obtener mejores descuentos"*.
2. **Base del descuento de mayoreo:** Aplica directamente sobre el precio base o tentativo cargado en el producto (no sobre el sugerido matemático).
3. **Comisiones en Mayoreo y >900 C$:** Se utiliza la misma tabla escalonada base, ya que el mayoreo al reducir el precio, automáticamente reduce la Utilidad Neta (sobre la que se calcula la comisión). La tabla escalonada sube libremente para utilidades de >900 C$.
4. **Cantidad > 1 en comisión:** El tramo de la tabla escalonada se busca sobre la utilidad neta **total de la línea** (`utilidad_neta = (precio − coste_final) × cantidad × (1 − salary%)`), NO por unidad suelta. Ojo con la forma de la fórmula: el Salary es un **porcentaje de la utilidad bruta de la línea** (§4), no un monto en C$ que se reste al precio unitario.
5. **Inventario migrado:** Queda fuera del alcance por ahora. No se le aplican pozos ni costos fijos, se venderá con su costo puro heredado del Excel.

---

## 11. Dónde vive en el modelo de datos (ver doc 03)
- **`purchases`:** `costo_china_usd`, `impuesto_unit_usd`, `envio_unit_usd`, `exchange_rate` (congelada),
  🧮 `costo_real_usd`, 🧮 `costo_real_cs`, 🧮 `costo_f_u`, 🧮 `coste_final` (estas dos últimas, migración
  0007 — el Costo F/U y el coste final del §2 se calculan y persisten al recibir el lote, en la misma
  fila de `purchases`; no en `products`, porque el FIFO real corre sobre `purchases`).
- **`catalog_items`:** 🧮 `precio_sugerido`, `precio_tentativo` (el precio real de venta) — se completan
  cuando el catálogo admin (doc 09 ítem 54) vincula una compra recibida a un ítem publicable.
- **`order_items` (snapshot al aprobar):** `precio_unit`, `coste_final_snap`, `utilidad_bruta`,
  `salary`, `utilidad_neta`, `comision`, `ganancia_tienda`, `pozos` (jsonb con los 7 montos).
- **`app_config`:** las 7 tablas configurables del §9.
