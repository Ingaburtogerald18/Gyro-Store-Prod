// Fachada del "config API": la configuración pública del negocio (marca,
// categorías, moneda, etc.) vive como un endpoint más de `sessionApi` sobre el
// baseApi compartido. Este módulo solo re-exporta esa cara para los call-sites
// que piden explícitamente `~/state/api/config-api` (rutas admin, module-loader).
// Así no duplicamos endpoints ni el store; es la misma instancia inyectada.
export { configApi, useGetConfigQuery } from './session-api';
export type { StoreCategory, StoreConfig } from './session-api';
