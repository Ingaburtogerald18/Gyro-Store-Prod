import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getPublicConfig } from './public-config';
import { getImageResources, getBusinessInfo, getFinancialConfig, getStorePolicies } from './app-config';
import { listCategories } from '../catalog/categories';
import { toPublicPolicies } from '../../../shared/schemas';

const router = Router();

// Endpoint público para obtener la configuración global de la tienda
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const publicConfig = getPublicConfig();
    const [images, categories, business, financial, policies] = await Promise.all([
      getImageResources(),
      listCategories(),
      getBusinessInfo(),
      getFinancialConfig(),
      getStorePolicies(),
    ]);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    // Lo editado en el panel (`business`, `financial`) pisa lo que viene del entorno. De las políticas
    // sale solo lo publicado: un borrador nunca llega a la respuesta pública ni a su caché.
    res.json({
      ...publicConfig,
      ...business,
      exchangeRate: financial.exchangeRate,
      categories,
      images,
      policies: toPublicPolicies(policies),
    });
  })
);

export default router;
