// Entry de SSR de Remix — versión estándar de streaming para Node, con una sola
// adición sobre el default: propaga el NONCE de la CSP.
//
// Por qué existe (no lo teníamos): el server Express sirve el SSR bajo una CSP
// con `script-src 'self' 'nonce-…'` (ver server/index.ts). `<Scripts nonce>` en
// root.tsx firma los scripts de hidratación, PERO los scripts inline de
// streaming que Remix inyecta al final del body —
// `window.__remixContext.streamController.enqueue/close` — los emite este entry
// vía `renderToPipeableStream`, y sin pasarle el nonce quedaban sin firmar → la
// CSP los bloqueaba. `<RemixServer nonce>` + la opción `nonce` del stream se los
// aplica.
import { PassThrough } from 'node:stream';
import type { AppLoadContext, EntryContext } from '@remix-run/node';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { renderToPipeableStream } from 'react-dom/server';

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  loadContext: AppLoadContext,
) {
  // El nonce lo inyecta serveFrontend.ts como loadContext; el mismo valor viaja
  // en la cabecera CSP (helmet) y acá a los scripts. En dev no hay Express: será
  // undefined y simplemente no se emite el atributo.
  const nonce = (loadContext as { cspNonce?: string } | undefined)?.cspNonce || undefined;

  return new Promise((resolve, reject) => {
    let shellRendered = false;

    // Usamos `onAllReady` SIEMPRE (antes: `onShellReady` para navegadores).
    // Motivo: en producción el monolito sirve el SSR a través del adaptador manual
    // Express↔Fetch de server/serveFrontend.ts, que NO entrega de forma fiable la
    // "cola" que Remix transmite después del shell. Con `v3_singleFetch` esa cola
    // incluye el cierre del stream de datos del loader
    // (`window.__remixContext.streamController.close()`); si se pierde, el cliente
    // se queda esperando ese cierre y la HIDRATACIÓN NUNCA COMPLETA — los botones y
    // menús quedan muertos, sin ningún error en consola (un stream colgado no
    // lanza). `onAllReady` renderiza el documento COMPLETO —incluido ese close—
    // antes de responder, así el adaptador lo entrega entero. Perdemos el streaming
    // progresivo, pero los loaders acá son rápidos y la hidratación correcta es lo
    // que importa. (Con `remix-serve` nativo no pasaba; es específico del adaptador.)
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // El shell ya se envió: registrar sin romper el stream en curso.
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
