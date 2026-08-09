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
import { isbot } from 'isbot';
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
    const userAgent = request.headers.get('user-agent') ?? '';
    // Bots: esperar a que TODO el árbol esté listo (SEO). Navegadores: responder
    // apenas el shell está listo y transmitir el resto.
    const readyOption: 'onAllReady' | 'onShellReady' =
      isbot(userAgent) ? 'onAllReady' : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
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
