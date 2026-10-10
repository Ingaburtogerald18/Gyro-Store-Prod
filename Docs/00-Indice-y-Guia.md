# 00 · Índice y guía — Gyro Store v2

> **Cómo leer este set.** Estos documentos se escribieron como **especificación, antes de que
> existiera el código**: primero se ordenó la documentación, después se programó siguiéndola. Hoy el
> código ya está construido y en producción, así que cada documento cumple uno de tres papeles —
> **spec vigente**, **referencia de lo construido**, o **registro histórico** de una decisión ya
> tomada. La tabla de más abajo dice cuál es cuál.
>
> **Regla que se mantiene:** ante una contradicción entre el código y un documento, manda el código y
> se corrige el documento en el mismo commit. Nada de docs que envejecen mientras el código avanza.

---

## Mapa de la documentación

`Estado` compara lo que dice el documento contra lo que hay hoy en `App/`:

| | Documento | Contenido | Estado |
|---|---|---|---|
| **00** | Índice y guía *(este)* | Mapa del set, decisiones de arranque, convenciones, glosario. | Vigente |
| **01** | Producto | Visión, usuarios, alcance, marca, objetivos. | Vigente |
| **02** | Arquitectura | Stack, estructura de carpetas, flujo de datos, patrones. | ✅ Construido |
| **03** | Datos y seguridad | Modelo Postgres, auth con Entra, roles, RLS deny-all. | ✅ Construido |
| **04** | Backend (API) | Contratos por dominio, middleware, validación, errores. | ✅ Construido |
| **06** | Dominios funcionales | Las 8 fases al detalle. | ⚠️ Parcial — falta Logística |
| **07** | Infraestructura y despliegue | Variables, Render, Supabase, R2, build. | ✅ Construido |
| **08** | Deuda técnica | Hallazgos del review y orden de trabajo. | 📌 Revisar — anterior a gran parte del código |
| **09** | Orden de construcción | Qué archivo crear primero, uno por uno. | 🗄️ Histórico — el repo ya está armado |
| **10** | CRM y WhatsApp | Ficha 360, agenda, inbox, Cloud API. | ⚠️ Parcial — CRM-A hecho; inbox/bot no |
| **11** | Lógica financiera | Costeo, Costo F/U, pozos, PVP, comisiones, mayoreo. | ✅ Construido |
| **12** | Especificación de módulos y arranque | Lógica por módulo, auditoría de seguridad, prompts de arranque. | 🗄️ Mixto — la spec sirve, los prompts ya se ejecutaron |
| **14** | Cuentas de comprador y lealtad | Auth del comprador (OTP), sellos, mayorista, atribución. | 📋 Plan — sin implementar |
| **15** | Cumplimiento fiscal (Nicaragua) | Plan de activación fiscal. | 📋 Plan — sin implementar |
| **17** | Comprobantes en SharePoint | Archivo de PDF por semana, outbox, Graph app-only. | ✅ Construido |
| — | `PLAN-CUENTAS-Y-ANALITICA` | Plan conjunto de cuentas + analítica de intención. | ⚠️ Parcial — analítica hecha, cuentas no |

**Leyenda:** ✅ construido y en uso · ⚠️ parcial · 📋 plan sin empezar · 🗄️ histórico (se conserva por
el *porqué*, no como instrucción) · 📌 necesita revisión

> Los documentos 🗄️ **no se borran**: guardan el razonamiento detrás de decisiones que hoy están
> cocinadas en el código. Sirven cuando alguien pregunta "¿por qué esto se hizo así?". Lo que no hay
> que hacer es leerlos como si fueran instrucciones pendientes.

---

## El cambio grande de v2: Firebase → Supabase

La v1 vivía sobre **Firebase (Auth + Firestore)**. v2 corre sobre **Supabase (Postgres + Auth)**. No
fue solo cambiar de proveedor: pasar de NoSQL a SQL relacional resolvió tres cosas que antes se
parcheaban a mano.

- **Stock y FIFO** dejaron de depender de `runTransaction` de Firestore; son transacciones de
  Postgres con bloqueo de fila (`SELECT … FOR UPDATE`).
- **Los reportes** salen con SQL (vistas y *materialized views*) en vez de cachear la colección
  entera en memoria para no reventar los límites de lectura.
- **El rol del usuario** se resuelve con una lectura barata a `profiles`, no con custom claims.

La data que existía en Firestore no se migró: eran pruebas para armar reportería.

## Decisiones de arranque

Cerradas antes de escribir código, y todas siguen en pie:

| Tema | Decisión | Por qué |
|---|---|---|
| **Base de datos** | Supabase (Postgres) | SQL da transacciones y agregados nativos; menos parches. |
| **Capa de seguridad** | El servidor manda: todo pasa por Express con la `service_role`; RLS en **deny-all** como segunda barrera. | Protege costos y utilidades aunque se filtre la `anon key`. |
| **Autenticación** | Solo **Microsoft Entra ID** con cuentas `@gyrostorenic.com` (vía Supabase Azure). | Una sola fuente de identidad; altas y bajas centralizadas en Microsoft 365. |
| **Imágenes** | **Cloudflare R2** (+ Sharp + nombre por hash). | Ya funcionaba y no tiene costo de egress. |
| **Backend** | **TypeScript + ESM**, unificado con el front. | Una sola cultura de tipos entre front y back. |
| **Ambientes** | Dos proyectos Supabase: dev y prod. | Probar migraciones sin ensuciar la data real. |
| **UI** | **shadcn/ui** sobre los tokens de `DESIGN.md`. | Componentes sin estilo impuesto: el look lo define `DESIGN.md`. |
| **CRM** | CRM nativo + **WhatsApp Cloud API**, sin n8n. | Lo más barato para arrancar; plan por fases en el doc 10. |
| **Cuentas de comprador** | Opcionales, nunca requisito para comprar. | Sube retención sin tocar la fricción cero del checkout por WhatsApp. |

## Convención de marcadores

El set se escribió sin tener todo el código viejo a la vista, así que cada afirmación no trivial
lleva una marca de confianza:

| Marca | Significado |
|---|---|
| `[CONFIRMADO]` | Verificado contra un archivo real del proyecto viejo. |
| `[PROPUESTO]` | Reconstrucción de intención: inferido del dominio, no del código. |
| `[MEJORA]` | No existía en el sistema viejo; mejora deliberada del rebuild. |
| `[v2]` | Cambio nuevo de esta versión respecto a la v1. |

---

## Documentos fuera de este set

- **`DESIGN.md`** (raíz del repo) — el único documento de diseño, para la tienda y el panel.
- **`App/database/01_schema.sql`** — el esquema completo, con la cabecera de cada bloque explicando el
  porqué de cada cambio. Para el modelo de datos real manda ese archivo, no el doc 03.

---

## Glosario

- **Storefront** — la parte pública: home, categorías, ficha de producto (PDP), carrito → WhatsApp.
- **Back-office / Admin** — el portal `/admin`: inventario, ventas, facturación, caja, reportes,
  personal.
- **PDP** — *Product Detail Page*, la ficha de producto (`producto.$id`).
- **Monolito híbrido** — un solo servicio Express que sirve la API *y* el frontend Remix buildeado.
- **`service_role`** — la llave de servidor de Supabase con privilegios totales; **ignora las RLS**.
  Solo vive en el servidor, nunca en el navegador.
- **RLS** — *Row Level Security* de Postgres. Acá está en **deny-all** como segunda barrera: aunque
  se filtrara la `anon key`, nadie lee ni escribe directo contra la base.
- **Entra ID** — Microsoft Entra ID (antes Azure AD), el proveedor de identidad del staff.
- **R2** — Cloudflare R2, almacenamiento de imágenes compatible con S3.
- **Checkout WhatsApp** — el pedido se cierra por chat; la web es catálogo y captación.
- **Semana ISO** — `2026-W32`. Unidad de agrupación del negocio: `orders.week_of` junta los pagos de
  comisión, y las carpetas de comprobantes en SharePoint usan la misma clave.
