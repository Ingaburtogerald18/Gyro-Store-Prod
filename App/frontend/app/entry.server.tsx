// Entry de SSR estándar más el nonce de la CSP: los scripts inline de streaming los emite este
// entry y sin nonce la CSP los bloqueaba.
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
  // El nonce llega por loadContext desde serve-frontend.ts. En dev no hay Express y no se emite.
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
