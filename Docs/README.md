# Documentación de Gyro Store

Cinco documentos, cada uno con un tema. Describen lo que hay hoy en `App/` y lo que falta.

| Documento | Qué tiene |
|---|---|
| [01-Producto](01-Producto.md) | Qué es la tienda, para quién, qué hace cada módulo y qué queda fuera |
| [02-Arquitectura](02-Arquitectura.md) | Cómo está armado: stack, carpetas, seguridad, datos, despliegue, variables y scripts |
| [03-Finanzas](03-Finanzas.md) | Costeo, pozos, precios, comisiones, mayoreo y la reportería de pozos mes a mes |
| [04-Comprobantes-SharePoint](04-Comprobantes-SharePoint.md) | El PDF de cada venta aprobada y cómo se archiva en SharePoint |
| [05-Pendientes](05-Pendientes.md) | Lo que falta construir y la deuda técnica, con las decisiones ya tomadas |

Fuera de esta carpeta:

- **`DESIGN.md`** (raíz): el único documento de diseño, para la tienda y el panel.
- **`AGENTS.md`** (raíz): reglas para quien trabaje en el repo.
- **`App/database/README.md`**: cómo se crea y se migra la base.
- **`App/database/01_schema.sql`**: el esquema completo. Para el modelo de datos manda ese archivo.

**Regla:** si el código y un documento no coinciden, manda el código y el documento se corrige en el
mismo commit. Lo que ya está construido se describe tal como es; lo que falta va en
`05-Pendientes`.

## Glosario

- **Tienda**: la parte pública (portada, catálogo, ficha de producto, carrito). El pedido se cierra
  por WhatsApp.
- **Panel**: `/admin`, donde trabaja el personal.
- **Modo edición**: donde un administrador prepara la vitrina (banners, fotos, qué se muestra, orden)
  en un borrador y lo publica.
- **Plantilla**: el modelo de un producto (nombre, descripción, categoría, ejes de variantes). Cada
  producto del catálogo sale de una plantilla.
- **Lote**: una compra recibida en bodega (`purchases`). El stock se descuenta por lote, el más viejo
  primero (FIFO).
- **Costo F/U**: costo fijo unitario. Un monto por unidad que se reparte en los pozos.
- **Pozos**: presupuestos mensuales (Publicidad, Préstamos, Servicios…) que se llenan con cada venta.
- **Semana ISO**: `2026-W32`. Agrupa los pagos de comisión y las carpetas de comprobantes.
- **Monolito**: un solo servicio Express que sirve la API y la tienda ya compilada.
- **`service_role`**: la llave de servidor de Supabase. Ignora las RLS y vive solo en el backend.
- **RLS**: Row Level Security de Postgres. Acá está cerrada para todos: solo el servidor lee y escribe.
- **Entra ID**: el login de Microsoft del personal, con cuentas `@gyrostorenic.com`.
- **R2**: el almacenamiento de imágenes de Cloudflare.
