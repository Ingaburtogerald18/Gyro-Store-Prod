import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { getPublicConfig } from '../services/config.js';
import { getImageResources, getBusinessInfo, getFinancialConfig } from '../services/appConfig.js';
import { listCategories } from '../services/categories.js';

const router = Router();

// Endpoint público para obtener la configuración global de la tienda
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const publicConfig = getPublicConfig();
    const [images, categories, business, financial] = await Promise.all([
      getImageResources(),
      listCategories(),
      getBusinessInfo(),
      getFinancialConfig(),
    ]);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    // `business` (editable desde el panel) pisa brandName/whatsapp/contactEmail
    // que vienen de env, y agrega ruc/address/currency.
    // `financial` pisa el exchangeRate.
    res.json({ ...publicConfig, ...business, exchangeRate: financial.exchangeRate, categories, images });
  })
);

export default router;