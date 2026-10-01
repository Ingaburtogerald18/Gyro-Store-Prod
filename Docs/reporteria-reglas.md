# Reportería: reglas de pozos, herencia y ganancia real

Reglas acordadas con el dueño el 1 oct 2026 e implementadas en
`App/server/services/pozoLedger.ts`. Los números de ejemplo salen de la base
real (agosto y septiembre 2026) y el motor los reproduce exactos.

## 1. Reglas acordadas (respuestas del dueño)

| # | Regla |
|---|---|
| R1 | Cada venta separa: costo, comisión, **fondo salario**, **pozos de costos fijos** y ganancia tienda. `costo + comisión + salario + ganancia tienda = total vendido` (los pozos ya vienen dentro del costo). |
| R2 | **Herencia:** el saldo que le sobra a un pozo al cerrar el mes pasa al mismo pozo el mes siguiente. Empieza en **agosto 2026** (julio no tiene ventas). |
| R3 | **Desborde:** si un gasto pasa el presupuesto de su pozo, el faltante sale de los **otros pozos comunes que tengan saldo, en proporción a su saldo**. Si no alcanza, **lo que falta sale de la ganancia**. |
| R4 | **Préstamos** no comparte: usa su propio presupuesto y lo que falte sale de la ganancia. No le presta a nadie ni recibe de nadie. |
| R5 | **Fondo salario** es intocable durante el mes. Lo que le sobra al cerrar **no vuelve al salario**: pasa al mes siguiente como **bolsa extra común**, de la que pueden tomar los pozos que se desborden. |
| R6 | Los pagos de préstamo se registran **como cualquier otro gasto** (pozo Préstamos). `loan_payments` se migra a `expenses`. |
| R7 | Al registrar un gasto que desborda, se **avisa antes de guardar** cuánto va a tomar y de dónde. |
| R8 | Los gastos se pueden **editar**. |
| R9 | **Total vendido** excluye el delivery en todos lados; el delivery se muestra aparte. |
| R10 | **Métodos de pago** queda solo sobre ventas facturadas, y el título lo dice (ya hecho). |

Pozos comunes (comparten entre sí): `publicidad`, `mantenimiento`, `utiles`,
`garantias`, `suscripciones`, `servicios`. Aislados: `prestamos`, `salario`.

### Detalles confirmados por el dueño

1. **Orden de cobertura de un desborde:** propio pozo (recogido + heredado) →
   bolsa extra (sobrantes de salario acumulados) → otros pozos comunes en
   proporción a su saldo → ganancia.
2. **La bolsa extra que no se usa se sigue acumulando** mes a mes.
3. **Si el salario se pasa de su fondo**, lo que falta sale de la ganancia (no de los pozos).
4. **El saldo de Préstamos también se hereda.**
5. El mes se corta en **hora de Nicaragua** (UTC−6), igual que el resto de la reportería.

## 2. Modelo de datos

### Qué se guarda y qué se calcula

| Dato | Dónde | Por qué |
|---|---|---|
| Recogido por pozo y salario | **Guardado** (ya existe): `order_items.pozos` (jsonb) y `order_items.salary`, congelados al vender. | Es el reparto de cada venta; no cambia después. |
| Gastos | **Guardado** (ya existe): `expenses` (pozo, monto_cs, created_at). Con R6 incluye los pagos de préstamo. | Fuente de verdad del gasto. |
| Herencia por pozo y mes | **Calculado.** No se guarda. | Con gastos editables (R8), cualquier snapshot guardado de un mes cerrado quedaría viejo al editar un gasto de ese mes. Son ≈8 pozos × N meses: recalcular desde agosto 2026 cuesta milisegundos. |
| Desborde: quién le prestó a quién | **Calculado** a nivel mes, no por gasto. | El reparto proporcional depende de los saldos al cierre del mes. Atribuirlo gasto por gasto haría que el resultado dependiera del orden en que se cargaron. |
| Aviso al registrar (R7) | **Calculado** en el momento, simulando el mes con el gasto nuevo. | No se guarda nada: es una vista previa. |

Si algún día el volumen lo pide, se agrega una tabla de caché
(`pozo_month_balances`) que se invalida al crear, editar o borrar un gasto de
ese mes o de uno anterior. Hoy no hace falta.

### Cálculo mensual (un pliegue mes a mes desde agosto 2026)

Para cada mes `m`, con `heredado[p]` y `extra` que vienen del mes anterior:

```
saldo[p]  = heredado[p] + recogido[m][p] − gastado[m][p]        (pozos comunes)
déficit   = Σ −saldo[p] de los pozos con saldo < 0
1. de_extra   = min(extra, déficit)                ; extra −= de_extra
2. donantes   = pozos comunes con saldo > 0, B = Σ saldo
   de_pozos   = min(B, déficit − de_extra)
   cada donante presta de_pozos × saldo[d] / B
3. de_ganancia_comunes = déficit − de_extra − de_pozos
   (cada pozo en déficit recibe de cada fuente en proporción a su déficit)
4. Préstamos:  s = heredado + recogido − gastado ; de_ganancia_prest = max(0, −s) ; hereda max(0, s)
5. Salario:    s = recogido − gastado ; de_ganancia_sal = max(0, −s) ; extra += max(0, s)  (para m+1)
6. heredado[p] para m+1 = saldo final de cada pozo (≥ 0)

Ganancia real[m] = ganancia_tienda[m] − de_ganancia_comunes − de_ganancia_prest − de_ganancia_sal
```

Esta es la **única** definición de Ganancia real. Hoy hay dos que no coinciden:
el KPI (resta préstamos) y la pestaña Gastos (resta solo el desborde consolidado).

### Dónde está

| Pieza | Dónde |
|---|---|
| Motor | `getPozoLedger(month, adjust?)` en `App/server/services/pozoLedger.ts` |
| Libro del mes | `GET /api/reports/expenses/overflow?startDate=…` → `MonthLedger` (una fila por pozo con `recogido, heredado, gastado, disponible, tomadoExtra, tomadoPozos, tomadoGanancia, prestado, saldoFinal`, más `extraInicio, extraUsado, extraSiguiente, sobranteSalario, gananciaTienda, deGanancia, gananciaReal`) |
| KPI | `GET /api/reports/kpis` usa el motor para un mes calendario de la tienda completa: `ganancia_real`, `gastos_de_ganancia`, `prestamos_de_ganancia` |
| Aviso al registrar o editar (R7) | `POST /api/reports/expenses/preview`: calcula el mes sin y con el gasto y devuelve de dónde sale cada córdoba. No escribe nada |
| Editar (R8) | `PATCH /api/reports/expenses/:id` |

Lo consumen la pestaña Gastos, el donut de ingresos, el KPI "Ganancia neta" y
el detalle "Rentabilidad y ganancia real".

## 3. Simulación con datos reales (solo lectura)

Gasto del pozo Préstamos de agosto = el pago migrado de `loan_payments`
(C$13,588.62, fecha 30 ago).

**Agosto 2026** (bolsa extra al inicio: 0)

| Pozo | Recogido | Heredado | Gastado | De bolsa extra | De otros pozos | De ganancia | Prestó | Saldo final |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Publicidad | 1,322.50 | 0.00 | 1,845.56 | 0.00 | 523.06 | 0.00 | 0.00 | 0.00 |
| Mantenimiento | 370.30 | 0.00 | 0.00 | — | — | — | 361.63 | 8.67 |
| Útiles | 264.50 | 0.00 | 0.00 | — | — | — | 258.31 | 6.19 |
| Garantías | 423.20 | 0.00 | 0.00 | — | — | — | 413.30 | 9.90 |
| Suscripciones | 264.50 | 0.00 | 1,291.30 | 0.00 | 1,026.80 | 0.00 | 0.00 | 0.00 |
| Servicios | 529.00 | 0.00 | 0.00 | — | — | — | 516.62 | 12.38 |
| Préstamos | 2,116.00 | 0.00 | 13,588.62 | — | — | 11,472.62 | — | 0.00 |
| Salario | 5,760.37 | — | 5,000.00 | — | — | 0.00 | — | 760.37 → bolsa extra de septiembre |

Ganancia tienda 13,426.92. Ganancia real **hoy**: KPI 1,954.30, pestaña Gastos 13,426.92. **Nueva: 1,954.30.**

**Septiembre 2026** (bolsa extra al inicio: 760.37, no se usa)

| Pozo | Recogido | Heredado | Gastado | Saldo final |
|---|---:|---:|---:|---:|
| Publicidad | 3,023.75 | 0.00 | 1,847.40 | 1,176.35 |
| Mantenimiento | 846.65 | 8.67 | 38.85 | 816.47 |
| Útiles | 604.75 | 6.19 | 0.00 | 610.94 |
| Garantías | 967.60 | 9.90 | 0.00 | 977.50 |
| Suscripciones | 604.75 | 0.00 | 551.30 | 53.45 |
| Servicios | 1,209.50 | 12.38 | 0.00 | 1,221.88 |
| Préstamos | 4,838.00 | 0.00 | 0.00 | 4,838.00 |
| Salario | 12,735.19 | — | 10,000.00 | 2,735.19 → bolsa extra de octubre |

Ningún pozo se desborda. Ganancia real hoy y nueva: **29,746.43**.
Octubre arrancaría con C$3,495.56 de bolsa extra (760.37 + 2,735.19), si se confirma el supuesto 2.

## 4. Migración `loan_payments` → `expenses` (NO correr sin aprobación)

Archivo: `App/database/0018_loan_payments_a_gastos.sql`. **No se corrió.** Hasta
que se corra, el motor y el historial de gastos leen los pagos de
`loan_payments` como gastos de Préstamos; los ya migrados no se cuentan dos veces.

**Qué movería hoy:** una fila.

| id | monto_cs | fecha | nota | creada |
|---|---:|---|---|---|
| 90f47fd2-… | 13,588.62 | 2026-08-30 | Pago de Prestamos Ficohsa | 7 sep 2026 (local) |

Decisiones del script:

- El gasto toma como fecha **`fecha` del pago (30 ago)**, no la fecha en que se
  cargó (7 sep). Se guarda a las 12:00 de Nicaragua para que no cambie de mes por zona horaria.
- `pozo = 'prestamos'`, `category = 'Pago de préstamo'`, `description = nota`.
  Se copian `monto_usd`, `exchange_rate` y `created_by`.
- **Idempotente:** marca cada fila migrada con `[loan_payment:<id>]` en la
  descripción y no inserta dos veces.
- Todo en **una transacción** con chequeo de totales: si la suma migrada no
  coincide con la suma de `loan_payments`, hace rollback.
- **No borra `loan_payments`.** Se borra en un paso aparte, cuando el código ya
  no la lea (rutas `/loan-payments`, `getFinancialKPIs`).

Orden de despliegue: (1) código nuevo que lee préstamos desde `expenses` (hecho;
también los lee de `loan_payments` mientras no se migren), (2) correr la
migración, (3) verificar que agosto siga en Ganancia real C$1,954.30, (4) retirar
`loan_payments` y sus rutas GET.
