// Fuente única de variables: importarlo antes de leer process.env. En desarrollo lee el archivo de
// GYRO_ENV_FILE (fuera del repo) o App/.env; en Render no hay archivo y no hace nada.
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localEnvFile = resolve(here, '../../.env'); // App/.env

const customEnvFile = process.env.GYRO_ENV_FILE?.trim();

if (customEnvFile) {
  if (!existsSync(customEnvFile)) {
    throw new Error(
      `GYRO_ENV_FILE apunta a un archivo que no existe:\n  ${customEnvFile}\n` +
        'Revisá la ruta (¿está sincronizado OneDrive?) o borrá la variable para usar App/.env.',
    );
  }
  loadDotenv({ path: customEnvFile });
} else if (existsSync(localEnvFile)) {
  loadDotenv({ path: localEnvFile });
} else if (process.env.NODE_ENV !== 'production') {
  // Ni GYRO_ENV_FILE ni App/.env: en dev esto casi siempre es setup incompleto.
  console.warn(
    '[env] No se encontró GYRO_ENV_FILE ni App/.env. Definí GYRO_ENV_FILE apuntando ' +
      'a tu archivo de secretos (p. ej. en OneDrive) o creá App/.env desde App/.env.example.',
  );
}
