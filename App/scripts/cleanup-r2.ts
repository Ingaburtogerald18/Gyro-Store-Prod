import '../server/loadEnv.js'; // Fuente única de variables de entorno. Debe ir primero.
import { listFiles, deleteFileByUrl } from '../server/services/storage.js';
import { getImageResources } from '../server/services/appConfig.js';

async function run() {
  console.log("Fetching currently used images from DB...");
  const config = await getImageResources();
  const usedUrls = [
    config.logoStatic,
    config.logoAnimated,
    config.favicon,
    config.posLogo
  ].filter(Boolean);
  
  console.log("Used URLs:", usedUrls);
  
  console.log("Fetching all files from R2 (config/)...");
  const files = await listFiles('config/');
  console.log(`Found ${files.length} files in R2.`);
  
  let deletedCount = 0;
  for (const file of files) {
    if (!usedUrls.includes(file.url)) {
      console.log(`Deleting orphaned file: ${file.url}`);
      await deleteFileByUrl(file.url);
      deletedCount++;
    }
  }
  
  console.log(`Cleanup complete. Deleted ${deletedCount} orphaned files.`);
}

run();
