// En producción Express sirve también el build de Remix: un solo servicio y un solo origen.
// No se usa @remix-run/express porque exige Express 4; se adapta a mano con @remix-run/node.
import express, { type Express, type Request as ExRequest, type Response as ExResponse, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createRequestHandler,
  writeReadableStreamToWritable,
  type ServerBuild,
} from '@remix-run/node';
import { logger } from '../utils/logger';

// Express req → Web Request. Los loaders de Remix son GET; los datos con body van
// por /api (RTK), no por acciones de Remix, así que no reenviamos cuerpo.
function toWebRequest(req: ExRequest): Request {
  const origin = `${req.protocol}://${req.get('host')}`;
  const url = new URL(req.originalUrl, origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value != null) headers.set(key, value);
  }
  return new Request(url.href, { method: req.method, headers });
}

export async function serveFrontend(app: Express): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDir = resolve(here, '../../frontend/build/client');
  const serverBuild = resolve(here, '../../frontend/build/server/index.js');

  if (!existsSync(serverBuild) || !existsSync(clientDir)) {
    logger.warn(
      '[frontend] No se encontró el build de Remix (frontend/build). ' +
        'Ejecutá `npm --prefix frontend run build`. La API funciona, pero no se sirve la UI.',
    );
    return;
  }

  // Import por ruta absoluta (file:// para que funcione en Windows y Linux). Se
  // hace por variable a propósito: el build no existe en tiempo de compilación.
  const build = (await import(pathToFileURL(serverBuild).href)) as ServerBuild;
  const handleRemix = createRequestHandler(build, 'production');

  // Los assets con hash de contenido son inmutables → cache larga. El resto
  // (favicon, imágenes de /public) con cache corta.
  app.use('/assets', express.static(resolve(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(clientDir, { maxAge: '1h' }));

  // Lo que no es /api ni un asset lo resuelve Remix. En Express 5 el catch-all es un middleware sin ruta.
  app.use(async (req: ExRequest, res: ExResponse, next: NextFunction) => {
    try {
      // El nonce lo genera el middleware de CSP (ver index.ts) y lo consume
      // root.tsx para firmar sus <script> inline; ambos leen el mismo valor.
      const response = await handleRemix(toWebRequest(req), { cspNonce: res.locals.cspNonce });
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') res.append(key, value);
      });
      const setCookies = response.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookies) res.append('set-cookie', cookie);

      if (response.body) {
        await writeReadableStreamToWritable(response.body, res);
      } else {
        res.end();
      }
    } catch (err) {
      next(err);
    }
  });

  logger.info('[frontend] Sirviendo el build de Remix desde Express.');
}
