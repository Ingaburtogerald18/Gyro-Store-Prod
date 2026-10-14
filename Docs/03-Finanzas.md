# 03 · Finanzas

Toda la matemática del negocio: costeo, pozos, precios, comisiones, mayoreo y la reportería de
pozos mes a mes. Las cifras de las tablas son los **valores iniciales** de `02_seed.sql`; todas se
editan desde **Configuración → Finanzas** y viven en `app_config` (§9). El código está en
`server/modules/finance/costing.ts` (costeo), `server/modules/sales/commission.ts` (comisión y mayoreo)
y `server/modules/finance/pozo-ledger.ts` (pozos mes a mes).

## Reglas de oro

1. **Todo se calcula en el servidor**, en `numeric` de Postgres (sin errores de redondeo de punto
   flotante).
2. **Se congela al aprobar la venta.** Cada venta guarda sus números (coste, comisión, pozos,
   ganancia). Cambiar un costo o un porcentaje después no reescribe ventas viejas.
3. **Las tablas son configurables** desde el panel.
4. **La tasa de cambio se congela en cada lote** al recibirlo. Si sube el dólar, el costo de un lote ya
   recibido no se mueve.

---

## 1. Costeo de un lote

Al recibir una compra en bodega, por cada línea:

| Paso | Fórmula | Ejemplo |
|---|---|---|
| Pre-total (USD) | `Cantidad × Costo China` | `5 × 4.61 = 23.05` |
| Total compra (USD) | `Pre-total + Cantidad × Impuesto unitario` | `23.05 + 5 × 0.2068 = 24.084` |
| Costo origen (USD) | `Total / Cantidad` | `4.8168` |
| Costo real (USD) | `Costo origen + Envío unitario` | `4.8168 + 0.4041 = 5.2209` |
| **Costo real (C$)** | `Costo real USD × Tasa` | `5.2209 × 37 = 193.17` |

El impuesto y el envío son **montos por unidad en USD** que se cargan en cada compra. El impuesto es
el de importación: un costo, no el IVA de venta.

## 2. Costo F/U y los pozos

Cada lote recibe un **Costo fijo unitario** según su costo real en C$:

| Costo real (C$) | Costo F/U (C$) |
|---|---|
| hasta 100 | 15 |
| hasta 200 | 25 |
| hasta 300 | 35 |
| hasta 500 | 55 |
| hasta 800 | 75 |
| hasta 1300 | 95 |
| hasta 2000 | 120 |
| más de 2000 | 150 |

El Costo F/U **no es ganancia**: se reparte en 7 pozos, que tienen que sumar 100 %:

| Pozo | % | Para qué |
|---|---|---|
| Publicidad | 25 | Facebook, Instagram, TikTok |
| Mantenimiento web | 7 | Render, Cloudflare, Supabase |
| Útiles | 5 | Bolsas, papel, cinta, tarjetas |
| Garantías | 8 | Dañados, regalías, perdidos |
| **Préstamos** | **40** | El préstamo de la tienda |
| Suscripciones | 5 | Canva, Claude |
| Servicios básicos | 10 | Servicios de la casa |

Ejemplo con Costo F/U 25: Publicidad 6.25, Mantenimiento 1.75, Útiles 1.25, Garantías 2,
Préstamos 10, Suscripciones 1.25, Servicios 2.50.

Cada venta "recoge" el Costo F/U de sus unidades en los pozos. Como ese monto ya está dentro del
costo, un gasto no baja la ganancia hasta que **supera lo acumulado en su pozo** (§12).

**Coste final (C$) = Costo real (C$) + Costo F/U.** Ejemplo: `193.17 + 25 = 218.17`.

## 3. Precio de venta

El sistema **sugiere** un precio con un margen según el coste final:

`Precio sugerido = Coste final / (1 − Margen)`

| Coste final (C$) | Margen |
|---|---|
| hasta 300 | 43 % |
| hasta 500 | 41 % |
| hasta 900 | 37 % |
| hasta 1500 | 33 % |
| hasta 2500 | 30 % |
| más de 2500 | 25 % |

Ejemplo: `218.17 / (1 − 0.43) = 382.76`.

**Quien recibe el lote pone el precio de venta** (por ejemplo, redondea 382.76 a 400). Ese precio
queda en el lote (`purchases.suggested_price`) y **es el que muestra la tienda**: el del lote más viejo
que tiene unidades, que es el que descuenta la próxima venta. Si hay una **oferta por color** vigente
y es menor, se muestra la oferta con el precio regular tachado. Los lotes viejos sin precio usan el
del catálogo.

## 4. Ventas y comisiones

Por cada línea de una venta:

| Paso | Fórmula | Ejemplo (1 unidad a C$400) |
|---|---|---|
| Importe | `Precio × Cantidad` | 400 |
| **Utilidad bruta** | `(Precio − Coste final) × Cantidad` | 181.83 |
| **Salario** (20 %) | `Utilidad bruta × 20 %` | 36.37 |
| **Utilidad neta** | `Utilidad bruta − Salario` | 145.46 |
| **Comisión** | escala sobre la utilidad neta | `145.46 × 40 % = 58.18` |
| **Ganancia tienda** | `Utilidad neta − Comisión` | 87.28 |

Escala de comisión:

| Utilidad neta de la línea (C$) | Comisión |
|---|---|
| hasta 100 | 45 % |
| hasta 200 | 40 % |
| hasta 400 | 37 % |
| hasta 500 | 35 % |
| hasta 600 | 31 % |
| más de 600 | 27 % |

- **Tramo único**: el porcentaje del tramo se aplica a toda la utilidad neta, no por partes.
- **Por línea**: el tramo se busca con la utilidad neta **total de la línea**
  (`(precio − coste final) × cantidad × (1 − salario %)`), no por unidad.
- **El salario es un fondo de la empresa**: no es del vendedor ni cuenta como ganancia de la tienda.
- Todo se congela en `order_items` al aprobar.

## 5. Mayoreo

Herramienta del **cotizador del vendedor**. La tienda pública no lo aplica ni lo anuncia.

| Cantidad de la misma línea | Descuento |
|---|---|
| 2 o más | 2.5 % |
| 3 o más | 5 % |
| 6 o más | 10 % |
| 12 o más | 15 % y aviso «Mejor haz una cotización para obtener mejores descuentos» |

- Se aplica el tramo más alto que cumple la cantidad, sobre el precio cargado del producto.
- El precio con descuento entra a la misma cadena del §4: baja la utilidad y con ella la comisión.
- **Piso**: ningún descuento (mayoreo, código de descuento o futuro código de lealtad) puede dejar una
  venta por debajo del coste final.

## 6. Ejemplo completo

```
Compra:   5 u × $4.61 + impuesto $0.2068/u  → costo origen $4.8168/u
Envío:    + $0.4041/u                        → costo real   $5.2209/u
Tasa 37:                                     → costo real   C$193.17
Costo F/U (hasta 200): C$25 → pozos 6.25 / 1.75 / 1.25 / 2 / 10 / 1.25 / 2.50
Coste final: 193.17 + 25 = C$218.17
Sugerido (43 %): C$382.76 → precio de venta del lote: C$400
── Venta de 1 u a C$400 ──
Utilidad bruta 181.83 · Salario 36.37 · Utilidad neta 145.46
Comisión (40 %) 58.18 · Ganancia tienda 87.28
```

## 7. Inventario migrado

El inventario del Excel viejo **queda fuera** y no está en la base. Si algún día se carga, va con su
costo heredado, sin Costo F/U ni pozos.

## 8. Qué muestra la reportería

Por vendedor y en total: número de ventas, unidades, total vendido (sin delivery, que se muestra
aparte), coste, comisión, ganancia tienda, salario acumulado, lo recogido en cada pozo, gastos y
**ganancia real** (§12). Los métodos de pago se calculan solo sobre ventas facturadas.

## 9. Tablas configurables

En `app_config`, editables desde Configuración → Finanzas:

| Clave | Qué es |
|---|---|
| `exchange_rate` | Tasa por defecto (se congela en cada lote) |
| `costo_fu_tiers` | Los 8 tramos de Costo F/U |
| `pozos` | Los 7 porcentajes (el servidor valida que sumen 100) |
| `margenes` | Los 6 tramos de margen del precio sugerido |
| `salary_pct` | Porcentaje de salario (20) |
| `comision_scale` | Los tramos de comisión |
| `mayoreo` | Los 4 tramos de mayoreo |

## 10. Decisiones cerradas

1. Mayoreo: 2.5 % desde 2, 5 % desde 3, 10 % desde 6, 15 % desde 12 con aviso.
2. El descuento de mayoreo se aplica sobre el precio cargado, no sobre el sugerido.
3. La comisión usa la misma escala con o sin mayoreo; el último tramo cubre todo lo que está por encima.
4. El tramo de comisión se busca con la utilidad neta total de la línea.
5. El inventario migrado queda fuera.

## 11. Dónde vive cada dato

- **`purchases`** (el lote): `costo_china_usd`, `impuesto_unit_usd`, `envio_unit_usd`,
  `exchange_rate` (congelada), `costo_real_usd`, `costo_real_cs`, `costo_f_u`, `coste_final` y
  `suggested_price` (el precio de venta del lote).
- **`order_items`** (congelado al aprobar): `precio_unit`, `coste_final_snap`, `utilidad_bruta`,
  `salary`, `utilidad_neta`, `comision`, `ganancia_tienda` y `pozos` (jsonb con los 7 montos).
- **`expenses`**: los gastos, cada uno con su pozo.
- **`app_config`**: las tablas del §9.

---

## 12. Pozos mes a mes: herencia, desborde y ganancia real

Reglas acordadas con el dueño el 1 de octubre de 2026. Las aplica `getPozoLedger` en
`server/modules/finance/pozo-ledger.ts`.

| # | Regla |
|---|---|
| R1 | Cada venta separa costo, comisión, salario, pozos y ganancia tienda: `costo + comisión + salario + ganancia tienda = total vendido` (los pozos ya están dentro del costo) |
| R2 | **Herencia**: lo que le sobra a un pozo al cerrar el mes pasa al mismo pozo el mes siguiente. Empieza en agosto de 2026 |
| R3 | **Desborde**: si un gasto pasa el presupuesto de su pozo, el faltante sale de la bolsa extra, después de los otros pozos comunes con saldo (en proporción a su saldo) y, si no alcanza, de la ganancia |
| R4 | **Préstamos** no comparte: lo que le falte sale de la ganancia. No presta ni recibe. Su saldo también se hereda |
| R5 | **Salario** no se toca durante el mes. Lo que sobra al cierre pasa al mes siguiente como **bolsa extra** común. Si el salario se pasa, lo que falta sale de la ganancia |
| R6 | Los pagos de préstamo se registran como cualquier gasto, en el pozo Préstamos |
| R7 | Al registrar o editar un gasto que desborda, se avisa antes de guardar cuánto toma y de dónde |
| R8 | Los gastos se pueden editar |
| R9 | El total vendido excluye el delivery en todos lados |
| R10 | Los métodos de pago se calculan solo sobre ventas facturadas |

Pozos comunes (comparten entre sí): publicidad, mantenimiento, útiles, garantías, suscripciones y
servicios. Aislados: préstamos y salario. La bolsa extra que no se usa se sigue acumulando. El mes se
corta en hora de Nicaragua (UTC−6).

**Qué se guarda y qué se calcula.** Lo recogido por pozo y el salario se guardan en cada venta
(`order_items`). Los gastos se guardan en `expenses`. La herencia y el desborde **se calculan** cada
vez, desde agosto de 2026: como los gastos se pueden editar, un saldo guardado de un mes cerrado
quedaría viejo. Son unos 8 pozos por mes y se recalcula en milisegundos. Si algún día pesa, se agrega
una tabla de caché que se invalide al tocar un gasto.

**Cálculo de cada mes** (con `heredado[p]` y `extra` del mes anterior):

```
saldo[p] = heredado[p] + recogido[p] − gastado[p]          (pozos comunes)
déficit  = suma de los saldos negativos
1. de la bolsa extra:  min(extra, déficit)
2. de otros pozos:     los que tienen saldo prestan en proporción a su saldo
3. de la ganancia:     lo que todavía falte
4. Préstamos: s = heredado + recogido − gastado; si s < 0 sale de la ganancia; hereda max(0, s)
5. Salario:   s = recogido − gastado;           si s < 0 sale de la ganancia; extra += max(0, s)
6. heredado del mes siguiente = saldo final de cada pozo (≥ 0)

Ganancia real = ganancia tienda − lo que salió de la ganancia (comunes + préstamos + salario)
```

Es la **única** definición de ganancia real del sistema.

| Pieza | Endpoint |
|---|---|
| Libro del mes (una fila por pozo: recogido, heredado, gastado, tomado de cada fuente, prestado, saldo final) | `GET /api/reports/expenses/overflow?startDate=…` |
| KPI de ganancia real | `GET /api/reports/kpis` |
| Aviso antes de guardar un gasto (R7) | `POST /api/reports/expenses/preview` (no escribe) |
| Editar un gasto (R8) | `PATCH /api/reports/expenses/:id` |

Con datos reales, agosto de 2026 da una ganancia real de **C$1,954.30** (ganancia tienda C$13,426.92
menos C$11,472.62 del préstamo que no cubrió su pozo).

## 13. Pendiente: pasar los pagos de préstamo a gastos

La regla R6 pide que los pagos de préstamo estén en `expenses`. Hoy hay **un** pago en la tabla vieja
`loan_payments` (C$13,588.62, 30 de agosto de 2026) y el motor lo lee de ahí sin contarlo dos veces.

La migración `App/database/migrations/0018_loan_payments_a_gastos.sql` **no se corrió**: espera el OK
del dueño. Qué hace:

- Crea un gasto del pozo Préstamos con la **fecha del pago**, a las 12:00 de Nicaragua para que no
  cambie de mes.
- Copia monto, tasa y autor, y marca la descripción con `[loan_payment:<id>]` para no repetirlo.
- Va en una transacción con chequeo de totales: si no cuadra, no hace nada.
- **No borra** `loan_payments`.

Orden:

1. Correr la migración en el SQL Editor.
2. Verificar que agosto siga en ganancia real C$1,954.30.
3. Quitar la lectura de `loan_payments` del código (`reports.ts`, `pozo-ledger.ts`) y las rutas
   `/api/reports/loan-payments`.
4. Borrar la tabla.
