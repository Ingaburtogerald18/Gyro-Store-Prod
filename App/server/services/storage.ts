import '../loadEnv.js'; // Fuente única de variables de entorno.
import { logger } from '../utils/logger.js';

// sharp is optional
let sharp: any = null;
try {
  // We will initialize sharp asynchronously
  import('sharp').then((m) => {
    sharp = m.default || m;
  }).catch(() => {
    // sharp not available
  });
} catch (e) {
  /* no sharp */
}

const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || '').trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || '').trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || '').trim();
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
const R2_ENDPOINT =
  (process.env.R2_ENDPOINT || '').trim() ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

let _client: any = null;
let _awsSdk: any = null;

export async function getClient() {
  if (_client) return { client: _client, awsSdk: _awsSdk };
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error(
      'Cloudflare R2 no está configurado: faltan R2_ENDPOINT/R2_ACCESS_KEY_ID/' +
      'R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME en el .env.'
    );
  }
  _awsSdk = await import('@aws-sdk/client-s3');
  _client = new _awsSdk.S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return { client: _client, awsSdk: _awsSdk };
}

export async function optimizeImageBuffer(buffer: Buffer, { maxDim = 1200, quality = 82 } = {}) {
  if (!sharp) return { buffer, contentType: null, ext: null };
  try {
    const out = await sharp(buffer, { animated: true })
      .rotate()
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    return { buffer: out, contentType: 'image/webp', ext: '.webp' };
  } catch (err: any) {
    logger.error('optimizeImageBuffer falló, se sube el original', { message: err.message });
    return { buffer, contentType: null, ext: null };
  }
}

export function sanitizePathSegment(value: string | undefined | null) {
  return (
    String(value || 'sin-nombre')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sin-nombre'
  );
}

export async function uploadFile(buffer: Buffer, folder: string, filename: string, contentType?: string) {
  const key = `${folder}/${filename}`;
  const { client, awsSdk } = await getClient();
  await client.send(
    new awsSdk.PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  return `${R2_PUBLIC_URL}/${encodeURI(key)}`;
}

export async function deleteFileByUrl(publicUrl?: string | null) {
  if (!publicUrl || typeof publicUrl !== 'string') return;
  const prefix = `${R2_PUBLIC_URL}/`;
  if (!R2_PUBLIC_URL || !publicUrl.startsWith(prefix)) return;
  const key = decodeURI(publicUrl.slice(prefix.length));
  try {
    const { client, awsSdk } = await getClient();
    await client.send(
      new awsSdk.DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
  } catch (err: any) {
    logger.error('Error al borrar de R2', { message: err.message });
  }
}

export async function listFiles(prefix = '') {
  const out: { key: string; size: number; url: string }[] = [];
  let ContinuationToken: string | undefined;
  const { client, awsSdk } = await getClient();
  do {
    const res = await client.send(
      new awsSdk.ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix, ContinuationToken })
    );
    for (const obj of res.Contents || []) {
      if (obj.Key) {
        out.push({
          key: obj.Key,
          size: Number(obj.Size) || 0,
          url: `${R2_PUBLIC_URL}/${encodeURI(obj.Key)}`,
        });
      }
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

export const isSharpAvailable = () => !!sharp;
