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

## Fases pendientes

2. Tipos, ESLint, ErrorBoundary y errores al guardar.
3. Caché inicial de RTK, skeleton, animaciones, bundle y favicon SSR.
4. Tokens, tipografía y DESIGN.md.
5. UX de catálogo, carrito, hero y variantes.
6. WhatsApp flotante, vistos recientemente, imágenes responsivas, JSON-LD, regreso al carrito, sugerencias y accesibilidad del POS/tablet (un commit por idea).

Para continuar respetando el orden solicitado, falta recuperar el control del navegador o recibir la verificación visual de la fase 1.
