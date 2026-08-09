// Carga de variables de entorno — FUENTE ÚNICA para todo el backend.
// Reemplaza los `dotenv.config()` sueltos que había en config.ts, storage.ts y
// los scripts. Importar este módulo (por su side-effect) antes de leer cualquier
// process.env garantiza que las variables ya estén cargadas.
//
// Estrategia de dev local:
//   Los secretos NO viven en el repo. Se guardan fuera (p. ej. en OneDrive) y la
//   ruta se pasa por la variable de usuario de Windows GYRO_ENV_FILE, para no
//   dejar rutas personales escritas en el código. Configúrala una vez:
//     setx GYRO_ENV_FILE "C:\Users\TuUsuario\OneDrive - Gyro Store\.env"
//   y reinicia la terminal / VS Code.
//
//   Si GYRO_ENV_FILE no está definida, cae al App/.env local (portabilidad para
//   otros entornos o colaboradores).
//
// En Render (producción) no hay archivo .env: las variables se inyectan desde el
// dashboard y ya están en process.env, así que dotenv simplemente no encuentra
// archivo y no hace nada. Es el comportamiento correcto.
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localEnvFile = resolve(here, '../.env'); // App/.env

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
