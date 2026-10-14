import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getPublicConfig } from './public-config';
import { getImageResources, getBusinessInfo, getFinancialConfig } from './app-config';
import { listCategories } from '../catalog/categories';

const router = Router();

// Endpoint público para obtener la configuración global de la tienda
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const publicConfig = getPublicConfig();
    const [images, categories, business, financial] = await Promise.all([
      getImageResources(),
      listCategories(),
      getBusinessInfo(),
      getFinancialConfig(),
    ]);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    // Lo editado en el panel (`business`, `financial`) pisa lo que viene del entorno.
    res.json({ ...publicConfig, ...business, exchangeRate: financial.exchangeRate, categories, images });
  })
);

export default router;