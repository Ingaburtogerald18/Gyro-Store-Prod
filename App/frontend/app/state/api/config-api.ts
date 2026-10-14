// Fachada: la config pública es un endpoint de `sessionApi`; esto la reexporta con su nombre.
export { configApi, useGetConfigQuery } from './session-api';
export type { StoreCategory, StoreConfig } from './session-api';
