# 13 · Arquitectura de Interfaces (UI) y Vistas por Rol

Tienes toda la razón. Hemos definido la base de datos, el backend, la seguridad y los números, pero nos falta "pintar" mentalmente qué es lo que va a ver el usuario en su pantalla. 

La UI de Gyro Store v2 se divide en **dos grandes mundos**: El Storefront (Público) y el Back-Office (Privado). Aquí detallo la lógica de qué módulos existirán y qué verá cada quien.

---

## MUNDO 1: Storefront (Público y Modo Edición)
*Esta es la cara de tu e-commerce. Los precios reales y las promociones puntuales (`is_promo`) sí se
muestran. **[v2 · doc 14] Corrección:** los descuentos automáticos por volumen (mayoreo) **ya NO** se
muestran ni se aplican a un comprador anónimo — eso quedó reservado al cotizador del vendedor o a un
cliente mayorista ya aprobado. En su lugar, el storefront público usa una **estrategia de escasez**:
mensajes tipo "registrate para obtener códigos" que empujan hacia la cuenta opcional (doc 14 §6).*

1. **Home / Landing Page:** Banners, carrusel de destacados y categorías.
2. **Modo Edición en Vivo (Estilo SharePoint/SPO):** ¡Gran idea! Si inicias sesión como `admin` y navegas por la tienda pública, verás la página igual que los clientes, pero con **botones superpuestos de "Editar" o cursores para arrastrar**. Podrás reordenar productos (`sort_order`), ocultarlos o cambiar textos directamente haciendo clic en ellos sin tener que ir al panel trasero.
3. **Catálogo (Grid):** Vista de todos los productos con filtros (precio, categoría, marca).
4. **Página de Producto (PDP):** Fotos grandes, selector de variantes, precio (con etiqueta de "Promo" si aplica) y botón "Agregar al Carrito".
4. **Página de Combos:** Visualización de paquetes especiales armados.
5. **Carrito y Checkout (WhatsApp):** El usuario ve su resumen. Al dar clic en "Comprar", el sistema guarda la pre-orden en `public_orders` y abre WhatsApp con un mensaje pre-armado y el total calculado.
6. **Formulario de Contacto / Soporte:** Para levantar tickets o dejar feedback.
7. **`/login`:** La única ruta privada aquí. Un botón de "Iniciar sesión con Microsoft" oculto a simple vista, exclusivo para que el staff de Gyro Store entre al sistema.
8. **`/mi-cuenta` (opcional) [v2 · doc 14]:** Un botón discreto de "Iniciar sesión" (distinto al de staff, con OTP por teléfono) visible para cualquier comprador — nunca obligatorio para navegar ni comprar. Adentro:
   - **Resumen:** progreso de lealtad ("2 de 3 para tu descuento").
   - **Mis pedidos:** lista con el estado simplificado de cara al cliente (`recibido → en preparación → salió/listo para retiro → entregado`).
   - **Mis códigos:** vigentes, usados, vencidos.
   - **`[PROPUESTO]` Wishlist:** si se aprueba el extra del doc 14 §14.

---

## MUNDO 2: Back-Office (Panel Administrativo)
*Aquí vive el negocio. Todos entran por la misma puerta (`/admin`), pero el menú lateral izquierdo y las pantallas cambiarán mágicamente dependiendo del ROL del usuario.*

### 🔹 Vista del Vendedor (`seller`)
*Lógica: El vendedor está para generar ventas, dar seguimiento a clientes y ver cuánto dinero ha ganado. NO debe ver costos ocultos ni los pozos de la empresa.*

*   **Dashboard Personal:** Gráfico de sus ventas de la semana vs su meta, y cuánta comisión lleva acumulada.
*   **CRM - Agenda y Clientes:** Vista de Kanban (columnas) para ver qué clientes debe contactar hoy (Follow-ups).
*   **CRM - Inbox (Bot):** Una vista tipo WhatsApp Web donde caen los chats. **[v2 · Opción A, doc 10 §2, §7]** con el número de la tienda migrado a la Cloud API, el vendedor ya no tiene ese WhatsApp en su celular — **responde todos los chats desde acá**, no solo los que el bot no pudo resolver.
*   **Módulo Ventas (Restringido):** 
    *   **Cotizador:** Buscan productos y los agregan a una venta. *OJO:* Aquí **solo ven el precio final (PVP)** y el sistema les aplica el mayoreo automáticamente. No ven la columna "Costo China" ni "Costo Real".
    *   **Mis Ventas:** Lista de sus ventas en estado "Pendiente de Aprobar" o "Aprobadas".

### 🔹 Vista del Cajero (`cashier`)
*Lógica: Su trabajo es recibir dinero y emitir tickets. No toman decisiones comerciales.*

*   **Dashboard Caja:** Resumen del efectivo/transferencias recibidas en su turno.
*   **Módulo Facturación:** Lista de ventas que ya fueron **Aprobadas** por el admin y están esperando pago. Tienen un botón "Imprimir Ticket" que genera el ticket de 80mm y cambia el estado a pagado.

### 🔹 Vista de Pagos y Cuotas (`admin` / `seller` / `cashier`)
*Lógica: Gestión de los pagos a plazos (Installments) de los clientes.*

*   **Módulo de Cuotas:** 
    *   **Crear Plan:** Permite dividir una venta en varios pagos (Ej. Pago 1, Pago 2, Pago 3).
    *   **Registro de Abonos:** Una pantalla donde el cajero o vendedor registra cuándo el cliente vino a pagar una cuota, reduciendo su saldo pendiente.

### 🔹 Vista de Logística (`logistics_admin`)
*Lógica: Su mundo son las cajas que vienen de China.*

*   **Módulo Logística:** Un mapa o línea de tiempo (timeline) donde ven qué lotes de compra vienen en barco, en aduana, etc., para informar tiempos de llegada.

### 🔹 Vista del Administrador (`admin` / `global_admin`)
*Lógica: Los dueños del negocio. Ven los "Rayos X" de toda la empresa y configuran todo el sistema.*

*   **📊 Módulo de Reportes y Telemetría:** 
    *   **Dashboard Financiero:** Ingresos, ganancias netas (Salary), y cuánto hay acumulado en los 7 pozos de costos.
    *   **Monitor de Tráfico:** Un panel que lee tu módulo de telemetría para mostrarte las **visitas** del sitio y un ranking de las **búsquedas** (qué están escribiendo los clientes en el buscador del Storefront, ideal para saber qué productos demandan).
*   **👥 Módulo de Gestión de Usuarios:** Para dar de alta a nuevos vendedores/cajeros, asignarles roles, o darlos de baja (soft-delete).
*   **⚙️ Módulo de Configuración Global:** 
    *   **Reglas de Negocio:** Aquí editas los porcentajes de los 7 pozos, tramos de cuota fija, y mayoreo.
    *   **Configuración Visual (Media):** Aquí es donde subes y gestionas las fotos del sistema (los Banners principales del Home, logos, imágenes por defecto).
*   **🛍️ Módulo de Catálogo (Back-Office vs SPO):** 
    *   *Respondiendo a tu pregunta:* **Necesitamos ambos**. El modo de edición en vivo (SPO) en el Storefront es perfecto para reordenar productos, ocultarlos rápidamente o cambiar un texto de forma visual. Pero para hacer el **trabajo pesado** (crear un producto desde cero, subir 10 fotos en alta calidad, definir variantes de colores, plantillas y asignar SKUs), hacerlo flotando sobre el Home es incómodo. Por eso, el trabajo duro de creación se hace en este Módulo de Catálogo del Back-Office, y los retoques visuales diarios se hacen con el modo SPO en el Storefront.
*   **📦 Módulo Inventario (La Bodega):** Lista cruda del stock. Incluye el botón **"Ingresar Lote de Compra"** (costeo desde China).
*   **💰 Módulo Ventas (Full):**
    *   **Aprobaciones:** Ven las ventas de los vendedores. Desglose completo (Precio - Costo real - Costo Fijo = Utilidad Bruta). Al "Aprobar", se congela la matemática.
    *   **Pago de Comisiones:** Agrupa comisiones por vendedor para marcar sus pagos semanales.
*   **💬 Módulo CRM (Full):** Acceso total a todas las conversaciones de WhatsApp y analíticas de seguimiento.
*   **👤 Panel de Clientes / Intención `[v2 · doc 14 §9]`:** Lista de contactos ordenada por "a quién llamar hoy" (no por fecha de registro). Muestra qué buscó, última visita, frecuencia, y señales de intención (buscó 3+ veces sin comprar, varias visitas en la semana). Alimenta la agenda de seguimientos.
*   **🎟️ Gestión de Campañas y Códigos `[v2 · doc 14 §10]`:** Crear/editar códigos de campaña por canal (tope, vencimiento), y la pantalla para registrar la validación manual de screenshot antes de entregar un código por WhatsApp.
