# 04 · Comprobantes en SharePoint

Cada venta que se **aprueba** genera un **comprobante PDF** que se archiva en una
biblioteca de SharePoint, en la carpeta de su **semana ISO** de aprobación.

Los **datos** de la venta viven en Postgres, que es la fuente de verdad. La app
**nunca lee** de SharePoint. Si SharePoint desaparece mañana, el negocio funciona
igual.

---

## 1. Por qué solo una biblioteca (y no una Lista)

La primera versión también replicaba cada venta como una fila en una Lista de
SharePoint, con quince columnas: vendedor, cliente, montos, método, estado…

Se descartó, y el motivo vale la pena recordarlo antes de que alguien proponga
volver a agregarla: **todos esos datos ya están en Postgres**, nadie iba a
consultar la Lista para decidir nada, y mantenerla costaba quince nombres
internos de columna sincronizados con el código —donde un `Teléfono` con tilde se
convierte en `Tel_x00e9_fono` y rompe todo— más un permiso de esquema (`owner`)
que el resto del sistema no necesita.

Lo que SharePoint sí aporta es lo que Postgres no hace bien: **guardar, previsualizar
y buscar documentos**.

**Postgres es el índice, SharePoint es el archivo.** El vínculo entre los dos es
`spo_outbox.comprobante_url`: para abrir el comprobante de una venta se consulta
esa columna por `order_id`.

### Por qué no adjuntos nativos de la lista

Aunque se quisiera, Microsoft Graph **no expone** los adjuntos de ítems de lista
en v1.0. Habría que caer a la API REST heredada de SharePoint: otra
autenticación, otro recurso, otro juego de permisos.

---

## 2. Cómo funciona (patrón outbox)

```
approveSale()  ──► INSERT en spo_outbox (local, barato)  ──►  return
                              │
                              │  cada 60 s, en segundo plano
                              ▼
                        spoWorker.drainSpoOutbox()
                              │
                   ┌──────────┴───────────┐
                   ▼                      ▼
        comprobante.ts (PDF)     sharepoint.ts (Graph)
                                          │
                                          ▼
                            PUT  {biblioteca}/2026-W32/comprobante-GS-PR-12.pdf
                                          │
                                          ▼
                          UPDATE spo_outbox.comprobante_url
```

**Aprobar una venta nunca se bloquea ni falla por SharePoint.** El hook solo
escribe una fila en `spo_outbox`; el trabajo real es asíncrono.

### Carpetas por semana ISO

La carpeta es la semana ISO de aprobación (`2026-W32`) — **la misma clave que
`orders.week_of`**, que agrupa los pagos de comisión. Así una carpeta de la
biblioteca y un período de pago son la misma unidad: cotejar "lo que se pagó"
contra "los comprobantes de esa semana" es abrir una carpeta.

El cálculo vive en `server/utils/isoWeek.ts`, compartido con `sales.ts`. Dos
copias del algoritmo divergirían justo en el borde de fin de año.

### Garantías

| Situación | Qué pasa |
|---|---|
| Microsoft aún **sin configurar** | El worker es un no-op. Las filas se acumulan en `pending` y se sincronizan **solas** al cargar las credenciales (backfill automático). |
| Graph caído / 429 / red | La fila queda `pending`, se reintenta el ciclo siguiente. Un 429 corta el lote y respeta el `Retry-After`. |
| Venta **re-aprobada** | `spo_outbox.order_id` es `UNIQUE` + `ON CONFLICT DO NOTHING`: una sola fila, un solo PDF. |
| El outbox falla al encolar | Se loguea y la aprobación **igual se completa**. |
| Subida OK pero falla el `UPDATE` | La fila conserva `comprobante_url`; el worker la cierra sin volver a subir. |
| Error no recuperable (403/404) | No se reintenta 12 veces: se marca `error` con el motivo en `last_error`. |

---

## 3. Configuración en Microsoft

### 3.1 App registration (Entra ID)

1. **App registrations** → la app (se reusa la del login del staff).
2. **Certificates & secrets → New client secret** → copiar el **Value** (no el
   *Secret ID*; solo se ve al crearlo).
   > Un secreto **propio**, distinto del que usa Supabase para el login: rotar
   > uno no debe tumbar al otro.
3. **API permissions → Microsoft Graph → Application permissions →
   `Sites.Selected`** → *Grant admin consent*.

   ⚠️ Bajo **Microsoft Graph**, no bajo la API **SharePoint**. El token se pide
   con `aud = graph.microsoft.com` y su claim `roles` solo refleja permisos de
   ese recurso; los de la API SharePoint pertenecen a otro y nunca aparecen.
   El síntoma es un `401 General exception while processing`.

4. Conceder acceso al sitio (una vez, con cuenta admin, desde Graph Explorer):
   ```http
   POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
   {
     "roles": ["write"],
     "grantedToIdentities": [{
       "application": { "id": "{AZURE_CLIENT_ID}", "displayName": "Gyro Store API" }
     }]
   }
   ```
   `write` alcanza: la app solo sube archivos. `owner` le daría permiso para
   reconfigurar o borrar la biblioteca entera.

### 3.2 La biblioteca

Crear una biblioteca de documentos dedicada a comprobantes en el sitio. La app
crea sola las carpetas `{semana}/` en su raíz.

### 3.3 Capturar los ids y probar

```bash
npm run spo:ids
```

Imprime `SPO_SITE_ID` y el `SPO_DRIVE_ID` de cada biblioteca, y —si `SPO_DRIVE_ID`
ya está en el `.env`— **hace una subida de prueba real**. Descubrir los ids no
prueba nada: el token puede leer y aun así no poder escribir.

---

## 4. Variables de entorno

Todas **opcionales**. Si falta cualquiera, SPO queda deshabilitado y la app
funciona igual (`config.spo.enabled === false`). **No** entran en la validación
fail-fast de `config.ts`.

```
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=  # 🔒 solo backend
SPO_SITE_ID=
SPO_DRIVE_ID=
SPO_SITE_URL=         # solo para `npm run spo:ids`; la app no la usa
```

Al arrancar, el log dice cuál de los dos estados está activo:

```
[spo] Espejo de ventas en SharePoint DESHABILITADO (faltan credenciales). ...
[spo] Espejo de ventas en SharePoint HABILITADO { siteId: ... }
```

---

## 5. Operación

```bash
npm run spo:status       # qué hay encolado, sincronizado o en error
npm run spo:drain        # forzar un ciclo (sin esperar los 60 s)
npm run spo:drain -- --retry  # re-encolar las filas en `error` y drenar
npm run spo:pdf          # generar el PDF de la última venta aprobada a App/tmp/
```

`spo:pdf` no toca Microsoft: sirve para revisar el layout del comprobante.

---

## 6. Archivos

| Archivo | Rol |
|---|---|
| `database/01_schema.sql` (sección `spo_outbox`) | Tabla del outbox |
| `server/config.ts` | `config.spo` (`enabled` = todo-o-nada) |
| `server/services/spoOutbox.ts` | Encolar (best-effort, nunca lanza) |
| `server/services/graphToken.ts` | Token app-only + caché |
| `server/services/sharepoint.ts` | Subir el PDF · carpeta semanal · 429/`Retry-After` |
| `server/services/comprobante.ts` | PDF con `pdf-lib` |
| `server/services/spoWorker.ts` | Drenado cada 60 s |
| `server/utils/isoWeek.ts` | Semana ISO, compartida con `sales.ts` |
| `server/services/sales.ts` | Hook en `approveSale` |

---

## 7. Límites conocidos

- **Una sola instancia.** El worker usa un `setInterval` en proceso. Con más de
  una réplica, dos procesos tomarían las mismas pendientes: subirían el mismo PDF
  dos veces (inocuo, se sobrescribe) pero gastarían el doble de llamadas. La
  corrección es `SELECT ... FOR UPDATE SKIP LOCKED` (vía RPC en Postgres, porque
  PostgREST no expone el lock) o un servicio propio de una réplica.
- **Subida simple, tope 4 MB.** `PUT .../content` alcanza de sobra para un
  comprobante de texto. Si algún día lleva fotos y pasa de ahí, Graph responde
  413 y hay que migrar a `createUploadSession`.
- **Ventas sin factura ligada.** El PDF se reconstruye desde `orders` +
  `order_items`. No hay correlativo fiscal (se usa `S-{8 chars del uuid}`),
  método de pago ni desglose de descuento/delivery. El PDF lo dice en el pie.
- **No hay reintento manual desde el panel.** Una fila en `error` se re-encola
  con `npm run spo:drain -- --retry` o con SQL.
