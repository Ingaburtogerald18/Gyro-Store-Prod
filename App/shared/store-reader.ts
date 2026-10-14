import type { CatalogDetail, CatalogProduct, Combo, LandingConfig } from './schemas';

// Lecturas públicas de la tienda. En producción Express se las pasa a los loaders de Remix en el
// mismo proceso; en dev el frontend las arma pidiendo /api. Fallan con error; null es «no existe».
export interface StoreReader<Config = unknown> {
  catalog(): Promise<CatalogProduct[]>;
  product(id: string): Promise<CatalogDetail | null>;
  combos(): Promise<Combo[]>;
  combo(id: string): Promise<Combo | null>;
  config(): Promise<Config>;
  landing(): Promise<LandingConfig>;
}
