// Genera las miniaturas que faltan para las fotos subidas antes de que existieran. Sin `--apply` solo
// cuenta lo que haría. Usa las credenciales de R2 del .env (o de GYRO_ENV_FILE).
import '../server/core/load-env'; // Fuente única de variables de entorno. Debe ir primero.
import { getClient, makeThumbnail } from '../server/modules/files/storage';
import { thumbnailUrl } from '../shared/image-variants';

const apply = process.argv.includes('--apply');
const bucket = (process.env.R2_BUCKET_NAME || '').trim();

async function run() {
  const { client, awsSdk } = await getClient();

  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const page = await client.send(new awsSdk.ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const object of page.Contents ?? []) if (object.Key) keys.add(object.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const missing = [...keys].flatMap((key) => {
    const thumbKey = thumbnailUrl(key);
    return thumbKey && !keys.has(thumbKey) ? [{ key, thumbKey }] : [];
  });
  console.log(`${keys.size} archivos en R2; ${missing.length} fotos sin miniatura.`);
  if (!apply) {
    console.log('No se escribió nada. Corré de nuevo con --apply para generarlas.');
    return;
  }

  let created = 0;
  let failed = 0;
  for (const { key, thumbKey } of missing) {
    try {
      const object = await client.send(new awsSdk.GetObjectCommand({ Bucket: bucket, Key: key }));
      const thumb = await makeThumbnail(Buffer.from(await object.Body.transformToByteArray()));
      if (!thumb) throw new Error('no se pudo leer la imagen (¿está instalado sharp?)');
      await client.send(
        new awsSdk.PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp' }),
      );
      created += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ${key}: ${(err as Error).message}`);
    }
  }
  console.log(`Listo: ${created} miniaturas creadas${failed ? `, ${failed} con error` : ''}.`);
}

run().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
