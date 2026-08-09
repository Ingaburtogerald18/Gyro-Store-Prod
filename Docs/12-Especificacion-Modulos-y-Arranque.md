# 12 · Especificación de Módulos, Seguridad y Arranque (Gyro Store v2)

> 🗄️ **MIXTO.** La especificación de módulos y la auditoría de seguridad del diseño **siguen
> vigentes**. La sección de arranque —los prompts para generar el Hito 0— ya se ejecutó: ese
> andamiaje existe desde hace tiempo en `App/server/`. Leé los prompts como registro de qué se pidió,
> no como algo por hacer.

Con las reglas de mayoreo (2.5%, 5%, 10%, 15% + advertencia en >12) y la decisión de ignorar el inventario migrado por ahora, **la lógica matemática está 100% cerrada**. 

Este documento consolida la lógica técnica de cada módulo, realiza una auditoría de seguridad y te proporciona el "Paso a Paso" exacto (junto con el Prompt) para que arranques a programar con tu IA local.

---

## 1. Auditoría de Seguridad (Security Review)

Revisando el diseño actual (`02-Arquitectura`, `03-Datos`, `04-Backend`), el sistema es extremadamente robusto. Aquí listamos los posibles ataques que sufren los sistemas comunes y te explico cómo **NUESTRO SISTEMA YA ESTÁ PROTEGIDO (CUBIERTO)** contra ellos:

*   **Ataque Potencial 1: Manipulación de Precios en el Cliente.** (Ej. un usuario altera el carrito en su navegador para enviar un precio de 0.01$). 
    *   *ESTADO: CUBIERTO ✅.* El frontend solo envía los `id` de productos y la cantidad. **El servidor recalcula el total consultando la base de datos** (`catalog_items`). Es imposible inyectar precios falsos.
*   **Ataque Potencial 2: Empleados leyendo márgenes de ganancia.**
    *   *ESTADO: CUBIERTO ✅.* El rol `seller` consume un DTO (Data Transfer Object) limpio mediante `publicItems`. Solo ven el `precio_tentativo`. El servidor nunca les envía la data de costos a sus computadoras.
*   **Ataque Potencial 3: Hackers accediendo a la Base de Datos pública.**
    *   *ESTADO: CUBIERTO ✅.* En muchas apps, la base de datos queda abierta. Nosotros usamos **Postgres RLS en Deny-All** (Cerramos la puerta con candado). NADIE en internet puede leer la base de datos directamente. El único que tiene la llave maestra (`service_role`) es nuestro servidor Express. Es el nivel máximo de seguridad.
*   **Ataque Potencial 4: Mensajes falsos inyectados en el Webhook de Meta (CRM).**
    *   *ESTADO: CUBIERTO ✅.* Como Facebook nos envía mensajes a una URL pública, programaremos un middleware en Express que tome una clave secreta (App Secret de Meta) y verifique matemáticamente (`SHA-256 HMAC`) la firma de cada mensaje. Si la firma no es de Facebook, el servidor lo bloquea inmediatamente.

**[v2] Cuentas de comprador (doc 14) — nueva superficie de ataque.** Esto **templa** el veredicto de
abajo: agregar login de comprador no es gratis en seguridad, y hay que decirlo con honestidad, no
solo celebrar lo que ya está cubierto.

*   **Ataque Potencial 5: OTP-bombing / abuso del endpoint de login.**
    *   *ESTADO: MITIGADO, no "imposible".* Alguien puede pedir OTPs en loop contra un teléfono ajeno (molestia/costo) o contra el mío (factura de SMS/WhatsApp). *Mitigación:* rate-limit **agresivo**, más estricto que el `apiLimiter` general, por teléfono e IP en `POST /api/account/otp` (doc 03 §A.8).
*   **Ataque Potencial 6: Enumeración de cuentas.**
    *   *ESTADO: MITIGADO.* Si el endpoint de login respondiera distinto según si el teléfono tiene cuenta o no, cualquiera podría mapear mi base de clientes probando números. *Mitigación:* respuestas **genéricas siempre** ("si el número existe, te enviamos un código"), nunca confirmar existencia.
*   **Ataque Potencial 7: Escalada de privilegios comprador → staff.**
    *   *ESTADO: CUBIERTO ✅ por diseño.* `requireCustomer` resuelve el JWT del comprador a un **contacto**, nunca a un `AppRole`. No existe ningún endpoint que acepte ambos tipos de JWT indistintamente — son dos middlewares separados desde el diseño, no una validación adicional sobre el mismo camino (doc 03 §A.8).
*   **Ataque Potencial 8: Fuga de PII (datos personales) del comprador.**
    *   *ESTADO: MITIGADO, requiere disciplina continua.* Ahora hay más dato personal atado a una identidad autenticada (antes eran leads sueltos). *Mitigación:* **mínimo dato necesario** — teléfono obligatorio, correo opcional, nada que no tenga un uso claro documentado en el doc 14. Soy el custodio de ese dato, no un activo a explotar.

**Veredicto de Seguridad (actualizado):** el núcleo (catálogo, ventas, costos, webhook de Meta) sigue
**100% protegido**. Las cuentas de comprador agregan superficie **nueva y real**, mitigada por diseño
(rate-limit, respuestas genéricas, separación estricta de middlewares) — no la escondo detrás de un
"blindaje total"; la trato como lo que es: un riesgo nuevo, gestionado.

---

## 2. Especificación Técnica de Módulos (Core)

Para unificar la lógica, aquí definimos los endpoints críticos, sus acciones y restricciones:

### A. Módulo de Configuración (`/api/config`)
*   **Responsabilidad:** Mantener todas las reglas financieras dinámicas (Pozos, Cuotas Fijas, Márgenes, Mayoreo).
*   **Endpoints:**
    *   `GET /api/config`: Retorna todas las tablas (Pozos, Tiers, Mayoreo). *Público (para el cotizador) o restringido (para edición).*
    *   `PUT /api/config`: Actualiza los valores. *Restricción:* Solo `global_admin` y `admin`. Valida mediante Zod que la suma de los pozos sea exactamente 100%.

### B. Módulo de Inventario / Compras (`/api/inventory`)
*   **Responsabilidad:** Ingreso de lotes desde China y costeo inicial.
*   **Endpoints:**
    *   `POST /api/inventory/purchases`: Crea un lote. *Acción:* Recibe USD (costo China, envío). Calcula el Costo Real C$ congelando la tasa de cambio actual, le suma el Costo F/U según el Tier correspondiente, e inserta en `purchases`. *Restricción:* Solo `admin`.

### C. Módulo de Ventas y Comisiones (`/api/sales`)
*   **Responsabilidad:** Motor transaccional del sistema.
*   **Endpoints:**
    *   `POST /api/sales`: (Vendedor). Registra venta y reserva stock. *Lógica:* Bloquea la fila en DB (`SELECT FOR UPDATE`). 
    *   `POST /api/sales/:id/approve`: (Admin). Confirma venta. *Acción Crítica:* Congela los cálculos financieros (toma el precio, descuenta el Coste Final, calcula Utilidad Bruta, descuenta el 20% de Salary, y calcula la Comisión en base a la Utilidad Neta). Guarda estos datos fijos en `order_items`.
    *   **Regla Mayoreo Integrada:** Si `cantidad >= 2` (del mismo producto), el servidor aplica 2.5% off. `>= 3` (5%), `>= 6` (10%), `>= 12` (15%). El sistema retorna un flag `warning: "Cotización sugerida"` si es `>=12` para que el frontend muestre la alerta.

### D. Módulo de Cuentas de Comprador (`/api/account`) [v2 · doc 14]
*   **Responsabilidad:** Auth de comprador (OTP por teléfono) y auto-servicio (mis pedidos, mis códigos de lealtad). Audiencia **separada** de los módulos A-C, que son de staff.
*   **Endpoints:**
    *   `POST /api/account/otp`: Público, rate-limit agresivo. Solicita el código OTP. Respuesta **genérica** siempre (no confirma si el teléfono tiene cuenta).
    *   `POST /api/account/verify`: Público. Valida el OTP, entrega sesión de comprador.
    *   `GET /api/account/me` · `/orders` · `/codes`: `requireCustomer`. Nunca `requireRole` — son middlewares que no se cruzan.
*   **Restricción dura:** ningún endpoint de este módulo resuelve `AppRole`; ningún endpoint de los módulos A-C acepta un JWT de comprador.

---

## 3. Guía Paso a Paso para Iniciar (Hito 0)

Como ya tienes tu cuenta de Supabase creada, este es el orden exacto en el que debes proceder:

**PASO 1: Setup en Supabase (Dashboard)**
1. Ve a **Authentication > Providers** y habilita *Microsoft Azure (Entra ID)*. Necesitarás el Tenant ID y el Client Secret de tu portal de Azure.
2. Ve a **Project Settings > API** y copia tu `Project URL`, `anon_key` (para el frontend) y tu **`service_role_key`** (secreta, solo para el `.env` del backend).

**PASO 2: Inicializar el Repositorio Local**
1. Crea una carpeta limpia: `mkdir gyro-store-v2 && cd gyro-store-v2`.
2. Ejecuta `npm init -y`.
3. Instala TypeScript y dependencias básicas del servidor Express.
4. Configura el archivo `tsconfig.json` asegurando `"module": "ESNext"` y `"moduleResolution": "node"`.

**PASO 3: Ejecutar el Prompt Inicial con tu IA Local**
Usa el siguiente prompt exacto con tu modelo local para que escriba el código fundacional.

---

> [!TIP]
> ## Prompt para tu IA Local (Cópialo y Pégalo)
> 
> "Actúa como un Desarrollador Backend Senior experto en Node.js, Express, TypeScript, Zod y Supabase. 
> 
> Estamos construyendo Gyro Store v2. La arquitectura exige que el frontend NUNCA toque la base de datos (Postgres). Todo pasa por Express, el cual se autentica usando la `service_role` de Supabase. La seguridad se maneja validando el JWT de Supabase Auth (Azure Entra) en nuestro middleware.
> 
> **Objetivo de esta iteración (Hito 0 - Fundación):**
> Necesito que generes el andamiaje completo del servidor Express con TypeScript y módulos ESM. No incluyas lógica de negocio aún, solo la base estructural.
> 
> **Requerimientos de Código:**
> 1. Crea la estructura de carpetas: `server/routes`, `server/middleware`, `server/utils`, `server/services`.
> 2. Crea `server/config.ts` usando `dotenv` para cargar: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`.
> 3. Crea `server/supabase.ts` que inicialice el cliente de Supabase usando la `service_role_key` e ignorando el JWT del lado del cliente. Exporta la instancia de `db`.
> 4. Crea el middleware central `server/utils/asyncHandler.ts`.
> 5. Crea el middleware `server/middleware/errorHandler.ts` que atrape errores de `Zod` y devuelva un `400 Bad Request` limpio.
> 6. Configura Express en `server/index.ts` usando `helmet`, `cors`, `express.json()`.
> 7. Crea un endpoint básico `GET /api/health` que responda `{"status": "ok"}`.
> 
> Por favor, dame el código completo de cada archivo necesario para que yo pueda correr `npm run dev` y ver el servidor funcionando en el puerto 3000."
