# 15 · Cumplimiento fiscal — Nicaragua (plan de activación)

> Este documento es mi **checklist de todo lo que tengo que hacer el día que inscriba el negocio**
> ante la DGI y la Alcaldía, y de **cómo hay que adaptar el código** para que la facturación cumpla
> la ley nicaragüense. Hoy **no lo ejecuto**: lo dejo plasmado mientras la investigación está fresca.
>
> ⚠️ **No es asesoría legal.** Los montos, tasas y reglas de aquí son orientación de arranque y
> **cambian**. Antes de construir la capa fiscal o inscribirme, **confirmo cada punto con un contador
> nicaragüense y con la DGI**. Hay un reglamento de **2024/2025 sobre sistemas informáticos de
> facturación** que quedó pendiente de leer a fondo (ver §7) — ese lo verifico sí o sí.

---

## 0. Estado actual (por qué esto está congelado)

- **NO estamos operando.** La mercadería aún no llega a Nicaragua.
- **NO estamos inscritos** ante DGI ni Alcaldía.
- Trabajamos **en anonimato / pre-inscripción**: construyendo la app, sin emitir facturas ni vender.
- **El código NO lleva capa fiscal todavía** — y está bien así. Lo único que hoy se llama "impuesto"
  en el sistema (`impuesto_unit_usd` en `purchases`) es el **impuesto de importación de China** = un
  **costo**, NO el IVA de venta. Son cosas distintas; no confundirlas.

**Disparador de activación:** este documento se ejecuta **cuando decida inscribir el negocio**
(típicamente al llegar la mercadería y empezar a vender). No antes.

---

## 1. Decisión que manda sobre todo: el régimen

Todo el resto (¿cobro IVA?, ¿qué campos lleva la factura?, ¿qué declaro cada mes?) depende de bajo
qué **régimen** me inscriba. Son dos:

### A) Régimen de Cuota Fija (lo más probable al arrancar)
Para pequeños contribuyentes. Califico si:
- **Ingresos ≤ C$100,000/mes**, **y**
- **Inventario con costo ≤ C$500,000**.
- Si ingreso **< C$10,000/mes** → inscrito pero **exento de pago mensual**.

Efecto clave: la cuota fija **consolida IR + IVA en una cuota mensual fija**. Es decir:
- **NO le cobro IVA (15%) por separado** al cliente.
- **NO desgloso IVA** en la factura.
- **NO hago declaración mensual de IVA.**
- La facturación es más simple (recibo/factura con RUC y correlativo, total en córdobas).

> ⚠️ **Duda crítica a resolver con contador:** Gyro **importa de China para revender**. Algunos giros
> de importación/comercio la DGI los empuja a **Régimen General** aunque las cifras sean chicas.
> **Confirmar si un importador puede estar en cuota fija** antes de asumir que sí.

### B) Régimen General (si supero los límites o me obligan)
- **IVA 15%** sobre ventas gravadas + **declaración mensual de IVA**.
- **Anticipo IR mensual** (1% de ingresos brutos) + **IR anual**.
- **Facturas con numeración autorizada por DGI**, IVA desglosado, retenciones cuando aplique.
- Posible obligación de **sistema de facturación autorizado / electrónico** (ver §7).

---

## 2. Pasos de inscripción (ejecutar el día D)

| # | Paso | Dónde | Notas |
|---|---|---|---|
| 1 | Definir el **régimen** (cuota fija vs general) | Con contador | Decide todo lo demás. Resolver la duda del importador (§1). |
| 2 | Sacar el **RUC** | DGI (Administración de Rentas más cercana) | Persona natural: basado en cédula. Llevar cédula original + copia y comprobante de domicilio fiscal (recibo de luz/agua/tel/internet). |
| 3 | Inscribir en el régimen elegido | DGI | Formulario de cuota fija descargable del portal DGI, o alta en régimen general. |
| 4 | **Matrícula municipal** | Alcaldía de Managua (ALMA) | Licencia anual del negocio. |
| 5 | Alta de **IMI** (Impuesto Municipal sobre Ingresos) | Alcaldía | **1% mensual** sobre ingresos brutos, declarado a la alcaldía (aparte de la DGI). |
| 6 | Si régimen general: **autorizar numeración/sistema de facturación** | DGI | Ver §7 — el software no es libre, la DGI regula la numeración y qué imprime. |
| 7 | Abrir cuenta bancaria del negocio + orden contable | Banco / contador | Para separar finanzas y respaldar declaraciones. |

---

## 3. Obligaciones recurrentes (según régimen)

| Obligación | Cuota Fija | Régimen General |
|---|---|---|
| Cuota mensual DGI | Cuota fija según tramo de ingreso | — |
| Declaración mensual de **IVA** | No aplica | **Sí** (IVA 15% cobrado − IVA acreditable) |
| **Anticipo IR** mensual | No (va en la cuota) | **Sí** (1% ingresos brutos) |
| **IR anual** | No (consolidado) | **Sí** |
| **IMI** municipal (1% ventas) | **Sí** | **Sí** |
| Matrícula municipal (anual) | **Sí** | **Sí** |
| Retenciones en la fuente | Generalmente no | Según operaciones (2% bienes, etc.) |
| Libros/respaldo de facturas | Básico | Formal (contabilidad completa) |

---

## 4. Impacto en el código — la capa fiscal

La facturación **aún no está construida** (es del Hito 3, `invoice.ts` no existe). La regla de diseño:
**construir la factura configurable por régimen desde el día uno**, para arrancar en cuota fija
(`ivaRate = 0`) y, si mañana paso a general, solo cambiar config sin reescribir.

### 4.1 `app_config` — bloque fiscal nuevo
- `razonSocial`, `ruc`, `direccionFiscal`, `municipio`
- `regimenFiscal`: `'cuota_fija' | 'general'`
- `ivaRate`: `0` en cuota fija · `0.15` en general
- Autorización DGI (para general/autorizado): `serie`, `rangoAutorizado`, `numeroResolucion`, `fechaResolucion`

### 4.2 Tabla `invoices` — campos fiscales nuevos
Hoy solo tiene `invoice_number` (sequence — buena base), `status`, `method`, `delivery_fee`, `total`.
Falta:
- `subtotal`, `descuento`, `base_gravable`, `iva_rate`, `iva_monto`, `total`
- `moneda` + `tipo_cambio` (BCN oficial) — precios se manejan en USD, pero **el documento fiscal
  debe reflejar córdobas**. Reusar el congelado de tipo de cambio que ya existe en el sistema.
- `cliente_nombre`, `cliente_ruc_cedula`, `condicion_pago` (`contado`/`credito`)
- `serie` + `correlativo` + guarda **anti-salto / anti-duplicado** sobre el sequence
- `regimen_snapshot` — congelar con qué régimen se emitió

### 4.3 Reportes
Totales mensuales listos para un clic por declaración:
- **IMI (1%)** e **IR anticipo (1%)** sobre ingresos brutos del mes
- **IVA cobrado** (solo si régimen general)

### 4.4 Ticket 80mm
Imprimir los campos que exige la ley según el régimen (RUC emisor, correlativo, total en córdobas;
en general además IVA desglosado y numeración autorizada + leyendas).

---

## 5. Plan por fases (no construir todo de golpe)

- **Fase A — arranque (cuota fija):** capa de impuestos **configurable con `ivaRate = 0`**.
  Factura/recibo con RUC, correlativo y total en córdobas. Mínimo y suficiente para cuota fija.
- **Fase B — cuando toque general o factura electrónica:** activar IVA 15%, metadatos de
  autorización DGI, y la integración con el **sistema/proveedor certificado** que exija la DGI.

---

## 6. Checklist accionable (el día que inscriba)

- [ ] Contador confirma **régimen** (resolver duda del importador).
- [ ] Sacar **RUC** en DGI (cédula + comprobante de domicilio).
- [ ] Inscribir en el régimen.
- [ ] **Matrícula municipal** + alta de **IMI** en la Alcaldía.
- [ ] Si general: **autorizar numeración/sistema de facturación** ante DGI.
- [ ] Setear el **bloque fiscal en `app_config`** (RUC, razón social, régimen, `ivaRate`).
- [ ] Construir/activar **Fase A** de la capa fiscal (migración `00XX_fiscal.sql` + `invoice.ts`).
- [ ] Verificar el **reglamento 2024/2025 de sistemas de facturación** (§7) y ajustar si obliga.
- [ ] Probar emisión de factura/ticket con datos reales.

---

## 7. Pendiente de verificar (importante, no asumir)

1. **¿Importador puede ser cuota fija?** (§1) — la duda que decide todo.
2. **Reglamento 2024/2025 de programas/sistemas informáticos de facturación** — hubo actualización
   reciente (alertas de firmas contables de nov-2024 y abr-2025) que no leí a fondo. Puede exigir
   **autorización del software, control de correlativo y/o transmisión a la DGI**. Confirmar alcance
   y a quién aplica **antes** de construir la Fase B.
3. **¿Factura electrónica obligatoria?** para mi régimen — determina si el sistema debe integrarse
   con la DGI o un proveedor certificado (build mucho mayor que un PDF/ticket).
4. **Tramos y monto de la cuota fija** vigentes al momento de inscribir.
5. **Tipo de cambio oficial BCN** — usar el publicado, no uno inventado, en el documento fiscal.

---

## 8. Fuentes consultadas (jul-2026, verificar vigencia)

- DGI Nicaragua — Cuota Fija, requisitos de inscripción: <https://www.dgi.gob.ni/FAQ/requisitos_de_inscripcion.htm>
- Régimen especial simplificado de cuota fija — Consortium Legal: <https://consortiumlegal.com/2023/10/04/regimen-especial-simplificado-de-cuota-fija-en-nicaragua/>
- Cuota fija en Nicaragua — Dele Peso a sus Pesos: <https://delepesoasuspesos.com/negocios/17570-cuota-fija-en-nicaragua>
- Qué es el régimen de cuota fija — GCH Accounting Firm: <https://www.serviciocontablenicaragua.com/que-es-el-regimen-de-cuota-fija-en-nicaragua/>
- Disposición Técnica 09-2007, sistemas de facturación computarizados — Justia Nicaragua: <https://nicaragua.justia.com/nacionales/disposiciones-tecnicas/requisitos-para-uso-de-sistemas-de-facturacion-computarizadas-jul-16-2007/gdoc>

---

_Documento de activación futura. No modifica el código actual. Se ejecuta al inscribir el negocio
(ver §0, disparador). Regla de oro del doc 00: si el código fiscal y este doc divergen, actualizar
este doc en el mismo commit._
