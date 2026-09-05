// Resource route para /favicon.ico. No pinta nada: solo absorbe la petición.
//
// El navegador pide /favicon.ico solo, sin que nadie lo enlace, apenas abre el
// sitio. Como `public/` está vacío, esa petición llegaba al handler de Remix,
// que no encuentra ruta y escupe un `ErrorResponseImpl 404` con stack trace
// completo en la consola del dev server — ruido puro que tapa los errores de
// verdad.
//
// No se sirve un .ico estático a propósito: el favicon real es dinámico (sale de
// la config del admin, ver DynamicFavicon en root.tsx). Un archivo fijo acá se
// mostraría primero y después cambiaría solo. 204 = "no hay contenido", el
// navegador se queda con el <link rel="icon"> que inyecta DynamicFavicon.
//
// Sin `default export`: eso es lo que la convierte en resource route.
export function loader() {
  return new Response(null, {
    status: 204,
    // Cachear evita que el navegador repita el pedido en cada navegación dura.
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
