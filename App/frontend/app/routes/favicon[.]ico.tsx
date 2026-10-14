// Absorbe el pedido automático de /favicon.ico con 204: sin esto Remix llenaba la consola de 404.
// No se sirve un .ico fijo porque el favicon real es dinámico (DynamicFavicon en root.tsx).
export function loader() {
  return new Response(null, {
    status: 204,
    // Cachear evita que el navegador repita el pedido en cada navegación dura.
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
