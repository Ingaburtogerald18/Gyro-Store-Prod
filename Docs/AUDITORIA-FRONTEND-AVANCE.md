# Auditoría frontend — avance por fases

Rama: `feat/frontend-audit`. Sin push ni PR.

## Fase 1 — código implementado, revisión visual pendiente

- Las fotos de las tarjetas verifican `complete` y `naturalWidth` al montar y al cambiar la URL. La búsqueda de `onLoad`/blur-up no encontró otro componente con el mismo patrón.
- Cada tarjeta tiene un único enlace al producto, con foco visible. El botón de carrito y WhatsApp conservan su interacción independiente.
- WhatsApp tiene foreground y hover propios para ambos temas. Contraste calculado desde OKLCH convertido a sRGB: claro 5,25:1; hover claro 6,71:1; oscuro 9,40:1; hover oscuro 11,41:1.
- Consentimiento compacto: mide su altura con ResizeObserver, reserva espacio al pie y desplaza la barra móvil de compra. Se oculta en rutas privadas.
- Logo del header eager; imagen del hero eager, prioridad alta y dimensiones explícitas.
- Nombres accesibles para eliminar líneas, editar/eliminar categorías, agregar desde catálogo y registrar compras en móvil. Etiquetas de cierre y menú lateral en español.
- Stock unitario: “¡Último disponible!”. Código de descuento: “¿Tenés un código?”. Error de fotos con sonner. Unificación de formas encontradas como Ingresá, Seleccioná, Creá, Modificá y Avisame.

### Validación

- `npm run build`: aprobado (cliente y servidor). Persisten avisos de sourcemaps y de imports estáticos/dinámicos ya presentes.
- `tsc --noEmit`: mantiene los 21 diagnósticos previos; comparación con HEAD, sin diagnósticos nuevos. Su corrección corresponde a fase 2.
- `git diff --check`: aprobado.
- Pruebas visuales a 1366/375 px en claro/oscuro: **pendientes**. Los servicios locales escuchan en 3000/5173, pero el control de Windows se detuvo al no poder determinar con suficiente confianza la URL del navegador. No se declara aprobada la fase ni se avanza a la siguiente.
- No se verificaron todavía en navegador el contraste de todos los controles, el foco, la ausencia de scroll horizontal ni la consola.

### Archivos de esta fase

- `App/frontend/app/components/admin/config/GeneralConfig.tsx`
- `App/frontend/app/components/admin/expenses/RegisterExpenseDialog.tsx`
- `App/frontend/app/components/admin/inventory/EditPurchaseModal.tsx`
- `App/frontend/app/components/admin/inventory/PurchaseForm.tsx`
- `App/frontend/app/components/admin/inventory/PurchasesTable.tsx`
- `App/frontend/app/components/admin/invoices/InvoiceEditor.tsx`
- `App/frontend/app/components/admin/reports/RegisterLoanPaymentDialog.tsx`
- `App/frontend/app/components/admin/users/CreateUserDialog.tsx`
- `App/frontend/app/components/cart/checkout-dialog.tsx`
- `App/frontend/app/components/catalog/ProductEditorDialog.tsx`
- `App/frontend/app/components/catalog/slide-media.tsx`
- `App/frontend/app/components/layout/storefront-analytics.tsx`
- `App/frontend/app/components/layout/storefront-shell.tsx`
- `App/frontend/app/components/product/mobile-buy-bar.tsx`
- `App/frontend/app/components/product/product-card.tsx`
- `App/frontend/app/components/store/store-header.tsx`
- `App/frontend/app/components/ui/button.tsx`
- `App/frontend/app/components/ui/dialog.tsx`
- `App/frontend/app/components/ui/sheet.tsx`
- `App/frontend/app/components/ui/sidebar.tsx`
- `App/frontend/app/lib/validators.ts`
- `App/frontend/app/routes/admin.caja.tsx`
- `App/frontend/app/routes/admin.catalogo.tsx`
- `App/frontend/app/tailwind.css`

## Línea base de rendimiento

Build previo a esta auditoría: 2,651,842 bytes de assets de cliente; 2,387,448 bytes de JavaScript (sin gzip). El detalle por archivo y gzip está guardado localmente en `App/tmp/frontend-audit/build-before.json` (ignorado por Git). La comparación final corresponde a fase 3.

## Cambios anteriores del tema

Se conservaron fuera del commit de esta fase: `root.tsx`, `useTheme.ts`, `module-loader.tsx`, `uiSlice.ts` y el archivo nuevo `lib/theme.ts`. Copia de respaldo local en `App/tmp/frontend-audit/`.

## Estado al cierre (30 sep 2026)

Commits de la rama, en orden:

| Commit | Fase | Qué |
|---|---|---|
| `a03eaae` | 1 | Imágenes borrosas, foco y enlace único en tarjetas, contraste de WhatsApp, banner de consentimiento, logo/hero eager, aria-labels, voseo. |
| `308a38e` | 1 | `fetchpriority` en minúsculas (React 18 avisaba en consola). |
| `d5f2c89` | 2 | `tsc` en 0 errores (eran 21), ESLint + jsx-a11y con script `lint` (0 errores), ErrorBoundary en root y en cada ruta del panel, toast al fallar el guardado del modo edición. |
| `4387eb8` | 3 | Skeleton cuadrado (evita salto de layout) y una sola animación de entrada en la grilla. |
| `489b9b7` | 4 | Variante activa visible en oscuro, CTA "Avisame" en tarjetas agotadas, flechas del carrusel ocultas si no hay nada que deslizar, descripción del hero completa en móvil. |
| `69977e0` | 5 | 133 colores crudos y los hex de gráficos del panel pasan a tokens. |
| `f979011` | 5 | Token `text-2xs` y 113 tamaños sueltos reemplazados por la escala. |
| (este) | 5 | DESIGN.md al día con el código. |

### Verificación de la fase 1 (pendiente en el primer commit)

Hecha en el navegador a 1366 y 375 px: 0 imágenes con `blur-lg` tras la carga completa, un
solo enlace por tarjeta, texto del botón de WhatsApp oscuro sobre verde claro en tema oscuro,
banner de consentimiento de 45 px que reserva su alto, sin scroll horizontal.

### Descartado a propósito

- **Sembrar RTK con los datos del loader.** `baseApi` usa `refetchOnMountOrArgChange: true`
  a propósito (arregla un bug de hidratación en producción con el adaptador Express↔Fetch,
  ver el comentario en `baseApi.ts`). Sembrar la caché no evita ese refetch y tocar el flag
  reabre el bug. Son 3 pedidos públicos cacheados; no compensa el riesgo.
- **Subset latino de Geist.** Cada `@font-face` ya declara `unicode-range`: el navegador no
  descarga cirílico ni vietnamita. Solo ocupan espacio en `build/`.
- **Favicon en el SSR.** `favicon[.]ico.tsx` responde 204 a propósito para que no aparezca un
  ícono fijo que después cambia por el configurado en el panel.
- **Recharts en diferido.** `HeroMetric`, arriba del dashboard, ya lo usa: el chunk se
  necesita en el primer render de todos modos.
- **Quitar el toast al agregar al carrito.** Es consistente en las 4 pantallas y lo anuncia
  el lector de pantalla; el drawer abierto no.

### Pendiente

- **Responsive del panel (caja/ventas/facturación) a 768 y 375 px.** No se pudo revisar
  visualmente porque requiere sesión en el panel.
- **Imagen del hero con fondo blanco** sobre tarjeta oscura: es un asset; conviene subir una
  versión con fondo transparente u oscuro desde el panel.
- **94 warnings de ESLint** (70 `any`, 22 variables sin usar, 2 dependencias de hooks).
- **Cambios del tema sin commitear** del dueño (`root.tsx`, `useTheme.ts`, `uiSlice.ts`,
  `module-loader.tsx`, `lib/theme.ts`): quedaron fuera de todos los commits.
- Ideas de la auditoría sin implementar: `srcset` desde R2, JSON-LD de Product, vistos
  recientemente, WhatsApp flotante en móvil, sugerencias en búsqueda vacía, atajos en el POS.
