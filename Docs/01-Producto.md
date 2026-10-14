# 01 · Producto

## En una frase

Gyro Store es la tienda en línea y el panel de operación de una tienda de accesorios tecnológicos en
Managua, Nicaragua. El catálogo público capta y convence; **el pedido se cierra por WhatsApp**. El
panel (`/admin`) opera el negocio: inventario, ventas, facturación, cuotas, reportes, clientes y
personal.

## Usuarios

**Comprador.** Busca audífonos KZ, adaptadores Bluetooth y accesorios de PC y gaming. Llega desde
redes sociales y WhatsApp, casi siempre desde el teléfono. Quiere ver rápido el catálogo, comparar
variantes y precio, y escribir por WhatsApp. **Nunca necesita cuenta para comprar.**

**Personal.** Entra al panel con su cuenta de Microsoft `@gyrostorenic.com`. Cada persona tiene uno o
más roles:

| Rol | Qué puede hacer |
|---|---|
| `global_admin` | Todo. Es el correo de `PROTECTED_ADMIN_EMAIL`; no se puede editar ni borrar |
| `admin` | Todo el panel |
| `seller` | Vender, ver Stock actual sin costos, sus facturas, pedidos web, clientes y el directorio del equipo |
| `cashier` | Emitir y anular facturas (ver Pendientes: el menú todavía no se lo muestra) |
| `logistics_admin`, `logistics_customer` | Existen en la base, pero el módulo de logística no está construido |

## La tienda

- **Portada**: la presentación (el banner principal, fijo), los destacados, filas por categoría cuando
  hay más de 8 productos, las novedades (los demás banners, sin rotar), cómo comprar y mayoreo. Se arma
  desde el modo edición.
- **Catálogo** en `/catalogo` y una página por categoría en `/categoria/<slug>`, con búsqueda, filtros
  (precio, ofertas, disponibilidad) y orden. Los filtros viven en la URL, así que un link comparte la
  misma vista; los links viejos (`/?categoria=…`, `/?q=…`) redirigen a su página nueva.
- **Navegación**: en el celular y la tableta, un solo menú (☰) con el catálogo, las categorías, por
  mayor, ayuda, mis pedidos, contacto y el tema oscuro; el buscador siempre está a la vista.
- **Ficha de producto** con galería, fotos por color, variantes y estado de stock. Nunca muestra la
  cantidad exacta. Precio de oferta por color cuando hay una activa. «Consultar por WhatsApp» es la
  acción principal y «Agregar al carrito» la secundaria; debajo, el horario de respuesta y un resumen
  de garantía y entregas. En el celular la foto va primero. La tarjeta del listado muestra las opciones
  («2 colores · Con micrófono»), el precio y el estado, sin botones: abre la ficha.
- **Combos** con precio propio y su propia ficha.
- **«Avisame cuando haya»** en productos agotados o próximos: deja el pedido de aviso en el CRM y el
  equipo escribe cuando llega.
- **Carrito y pedido**: el servidor recalcula el total, guarda el pedido web y abre WhatsApp con el
  mensaje armado. Acepta códigos de descuento. Entrega en tres modalidades: delivery en Managua
  (transporte a cotizar), Cargo Trans al resto del país (producto pagado antes del despacho, transporte
  aparte) o retiro; antes de registrar se explica cómo se paga cada una. El transporte nunca se suma
  al total de productos.
- **Mis pedidos y seguimiento**: los pedidos hechos desde ese navegador, búsqueda por número y
  teléfono, y una página de seguimiento por pedido (`/pedido/<id>`) cuyo link va en el mensaje de
  WhatsApp.
- **Contacto**: el formulario crea o actualiza el cliente en el CRM, con el punto de retiro y el
  horario de atención.
- **Ayuda** (`/ayuda`): índice y preguntas frecuentes, «Cómo comprar» y «Pagos y entregas», con los
  textos de Configuración → Atención y Negocio. «Garantía y cambios» existe solo cuando está publicada.
- **Por mayor** (`/por-mayor`): cotización por WhatsApp, sin mínimos ni precios mayoristas.

## El panel

| Módulo | Qué hace |
|---|---|
| **Reportería** (`/admin`) | Ventas, ganancia real, desglose, tendencia, más vendidos, vendedores, pérdidas, delivery, gastos por pozo, pagos de préstamo y exportación CSV |
| **Inventario** | Órdenes de compra a proveedores (factura y fotos de empaque), recepción en bodega con costeo, stock actual, movimientos y ajustes, ofertas por color, plantillas, categorías y combos |
| **Ventas** | Cotizador, registro, aprobación (congela costos y comisiones), rechazo, devoluciones y pago de comisiones |
| **Pedidos web** | Pedidos de la tienda: estados, conversión a venta y, por separado, pago del producto, costo y pago del transporte, comprobante de Cargo Trans (privado) y fecha real de recepción, desde la que corre la garantía |
| **Cuotas** | Planes de pago sobre una venta aprobada y registro de cada pago |
| **Facturación** | Facturas con correlativo `GS-PR-n`, ticket de 80 mm y anulación. El vendedor ve las suyas en «Mis Facturas» |
| **Códigos de descuento** | Códigos `GS-DC-n` por porcentaje o monto, con usos y vencimiento |
| **CRM y clientes** | Contactos, ficha 360 (pedidos, ventas y actividad de un cliente), seguimientos y avisos de stock |
| **Analítica** | Visitas, embudo, búsquedas, búsquedas sin resultado, productos más vistos, agregados al carrito y aperturas de WhatsApp (abrir no es enviar el mensaje) |
| **Personal** | Altas, roles (también para quien todavía no entró nunca), rendimiento y papelera de 30 días |
| **Configuración** | Datos del negocio y horario de atención, atención (pagos, entregas y garantía, con la página de garantía en borrador o publicada), tablas financieras e imágenes de marca |
| **Mi perfil** | Foto, nombre y datos bancarios propios |
| **Modo edición** | Borrador compartido de la vitrina: presentación y novedades, destacados, categorías, filas, fotos y visibilidad de productos y combos, orden y texto del carrito. Un administrador a la vez; se guardan las últimas 5 publicaciones |

Cada venta aprobada genera un comprobante PDF que se archiva en SharePoint
([04-Comprobantes-SharePoint](04-Comprobantes-SharePoint.md)). Toda la matemática de costos,
precios y comisiones está en [03-Finanzas](03-Finanzas.md).

## Fuera de alcance

- **Pago en línea.** El pago sigue por WhatsApp, transferencia o contra entrega. Si algún día se
  agrega, el pago sería un evento pegado al pedido, como hoy los pagos de una cuota.
- **App nativa.** La tienda es responsiva.
- **Inventario del Excel viejo**: no se cargó a la base.

Lo que está decidido pero no construido (WhatsApp en el panel, cuentas de comprador, logística,
capa fiscal) está en [05-Pendientes](05-Pendientes.md).

## Contexto que moldea el producto

- **Teléfono primero y datos caros**: páginas livianas e imágenes WebP optimizadas.
- **Se compra por WhatsApp**: la conversión real es el mensaje, no un pago en la web.
- **Córdobas y dólares**: se compra en USD y se vende en C$. La tasa se congela en cada lote.
- **Operación chica**: el panel lo tiene que poder usar una sola persona sin pasos de más.
- **Marca**: premium, técnica, nítida y confiable. Voz directa con voseo. Las reglas visuales están en
  `DESIGN.md`.
