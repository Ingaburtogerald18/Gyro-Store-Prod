# 01 · Producto — Gyro Store

> Base: el `PRODUCT.md` del repo v1 `[CONFIRMADO]` —absorbido acá, ya no existe como archivo
> aparte— más lo aprendido operando la tienda. Acá se define **qué** se construye y **para quién**,
> antes de cualquier decisión técnica. El stack (Supabase, Entra, etc.) no cambia nada de este
> documento: el producto es el mismo, mejor construido.

---

## 1. En una frase

Gyro Store es el **storefront + back-office** de mi tienda de accesorios tecnológicos en Managua,
Nicaragua. El catálogo público capta y convence; el **cierre final ocurre por WhatsApp**. El
back-office (`/admin`) opera el negocio completo: inventario, ventas, facturación, reportes,
usuarios y logística. [CONFIRMADO]

---

## 2. Usuarios

### 2.1 Comprador (storefront) — mayoría móvil
- Busca audio y accesorios tech: audífonos KZ in-ear, adaptadores Bluetooth, accesorios PC/gaming. [CONFIRMADO]
- Llega mayormente desde **redes sociales y WhatsApp**. Navega de noche, en el teléfono, con una mano. [CONFIRMADO]
- **Quiere:** escanear el catálogo rápido, comparar variantes y precio, y cerrar por WhatsApp.
- **No quiere:** registrarse, llenar formularios, esperar. Fricción cero hasta el chat.
- **Importante para v2:** el comprador **nunca necesita loguearse** para comprar — el catálogo sigue
  100% público y el cierre sigue por WhatsApp. Pero ahora el login es **opcional**: un comprador
  frecuente o mayorista puede crear una cuenta para ganar lealtad y auto-servicio. Ver doc 14. [v2]

### 2.2 Comprador registrado / cliente frecuente / mayorista — opcional [v2]
- El mismo comprador de 2.1, que decidió crear una cuenta (OTP por teléfono, doc 14 §4) porque le
  conviene: ve su progreso de lealtad, sus pedidos, sus códigos, y si es mayorista, su precio aprobado.
- **No es un usuario distinto ni un segundo storefront** — es el mismo catálogo público, con una capa
  extra de auto-servicio para el que se registró. Nunca ve nada que el comprador anónimo no pueda ver
  del catálogo; ve *más* de lo suyo (pedidos, códigos), no menos del catálogo.
- **Quiere:** que le recuerden lo que compró, saber cuándo llega su próximo descuento, no tener que
  preguntar por WhatsApp "¿en qué va mi pedido?".
- Detalle completo del dominio: **doc 14**.

### 2.3 Admin / vendedor (back-office)
- Gestiona catálogo, inventario, ventas, facturación, logística y usuarios desde `/admin`. [CONFIRMADO]
- Entra con su cuenta **`@gyrostorenic.com` de Microsoft** (mi tenant). Perfiles internos con
  distintos permisos (ver doc 03 · roles). [v2]
- **Quiere:** control operativo real (costos, utilidades, comisiones, KPIs) sin depender de
  planillas sueltas.

---

## 3. Propósito y definición de éxito

El storefront tiene que **verse premium y de confianza** para justificar precios y convertir. Como
el cierre es por WhatsApp, la web es **catálogo + captación**, no un carrito de pago. [CONFIRMADO]

**Éxito medible:**
- Catálogo navegable y creíble que **genere pedidos de WhatsApp**. [CONFIRMADO]
- El back-office reemplaza las planillas: inventario, ventas y reportes viven en el sistema.
- Tiempo de carga y usabilidad móvil de primer nivel (la mayoría del tráfico es móvil).

**[MEJORA] KPIs de producto que quiero instrumentar en v2** (hoy no los mido): tasa de clic
"catálogo → WhatsApp", productos más vistos, búsquedas sin resultado, abandono en PDP. Con Postgres
esto lo saco directo con SQL sobre `analytics_events`, sin cachear nada raro. [v2]

**[MEJORA] KPIs del dominio de cuentas y lealtad** (doc 14): tasa de registro (visitas → cuentas
creadas), tasa de recompra (compradores registrados que vuelven a comprar), atribución por canal
(qué canal — `contact_origin` + UTM — trae compradores reales, no solo clics). [v2]

---

## 4. Alcance

### 4.1 Dentro de alcance (v2)
- **Storefront:** home, categorías, PDP, combos, carrito local → mensaje de WhatsApp. [CONFIRMADO]
- **Back-office (8 dominios):** catálogo/edición, inventario, ventas, facturación, reportes,
  usuarios, logística, polish. [CONFIRMADO] (detalle en doc 06)
- **Auth del staff con Microsoft Entra ID.** [v2] (antes era multi-proveedor Google/Email/Microsoft)
- **Mini-CRM de seguimientos** para captar leads de redes. La forma exacta del CRM está **abierta**
  (quiero hacer algo más interesante que lo de v1); lo defino aparte. [v2 · decisión abierta]
- **Cuentas de comprador opcionales + lealtad** — capa de auto-servicio y retención (tarjeta de
  sellos, cliente mayorista, panel de intención). Nunca un requisito para comprar. Detalle completo:
  **doc 14**. [v2]

### 4.2 Fuera de alcance (v2, explícito)
- **Pasarela de pago embebida.** El pago sigue por WhatsApp. (BAC Credomatic/PowerTranz y Compra
  Click quedan como exploración futura, *no* en este rebuild salvo que lo decida. El diseño del doc 14
  deja la puerta abierta — la orden es el objeto central, un pago sería solo un evento pegado a ella —
  pero no se implementa acá.) [PROPUESTO]
- App móvil nativa. La web responsiva cubre el caso móvil.

---

## 5. Personalidad de marca

Premium, tech, nítido, confiable. Voz directa en español nicaragüense, sin relleno. [CONFIRMADO]

**Referencias de producto:** Apple Store (calma, aire, foco en producto), Nike/StockX (jerarquía
fuerte, precio protagonista, densidad controlada), Sonos/Nothing (oscuro editorial, monocromo con
un acento). [CONFIRMADO]

**Anti-referencias:** plantilla de e-commerce genérica — pills con gradiente arcoíris, gradient-text
decorativo, sombras difusas, botones con degradado como acción principal, hit-areas chicas, filtros
escondidos. Ni look SaaS-cream ni neón permanente. [CONFIRMADO]

**Identidad visual:** mascota Gyro (personaje amigable, pelo en punta, lentes de sol). Colores, letras y
reglas de diseño en `DESIGN.md`.

> **Nota de v2:** implemento este diseño con **shadcn/ui**, pero pintando cada componente con mis
> tokens. La librería me da la accesibilidad y el comportamiento; el look sigue siendo 100% mío. [v2]

---

## 6. Principios de producto (los mantengo en v2)

1. **El producto manda** — la foto y el precio son el héroe; el chrome (nav, filtros) se calla.
2. **Un solo acento con propósito** — esmeralda solo para acción/selección/estado.
3. **Tokens semánticos siempre** — cero colores crudos; dark↔light es un flip.
4. **Jerarquía por peso y espacio**, no por color ni cajas anidadas.
5. **Táctil y accesible** — hit-areas ≥44px, foco visible, contraste AA, motion con propósito.

[CONFIRMADO — de `PRODUCT.md`]

---

## 7. Restricciones de contexto (Nicaragua) que moldean el producto

- **Móvil primero y datos caros** → peso de página bajo, imágenes optimizadas (ver doc 07).
- **Pago cultural por WhatsApp** → la conversión real es el mensaje, no un "add to cart" de pago.
- **Moneda C$ y tipo de cambio** parametrizables (`CURRENCY`, `EXCHANGE_RATE`). [CONFIRMADO]
- **Operación pequeña / un operador** → el back-office lo tiene que poder usar una persona sin
  fricción; nada de flujos empresariales pesados.
