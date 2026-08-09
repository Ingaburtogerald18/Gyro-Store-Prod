// Estado efímero de UI compartido entre componentes (doc 09 ítem 40).
// El tema se refleja acá; aplicarlo a <html data-theme> y persistirlo en
// localStorage es trabajo del hook useTheme (ítem 41).
//
// Acá vive también el estado del CATÁLOGO PÚBLICO (búsqueda, categoría, precio,
// orden y toggles). Vive en Redux y no en un useState de la grilla porque tres
// piezas separadas leen el mismo filtro: la barra de herramientas (que muestra
// el conteo), la grilla (que renderiza) y los chips de filtros activos. Con
// estado local se desincronizaban.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'dark' | 'light';

/** Orden de la grilla del catálogo. */
export type CatalogSort = 'relevant' | 'price-asc' | 'price-desc';

// La apertura del carrito NO vive acá: es estado del propio carrito (cartSlice),
// igual que en la v1, para que haya una sola fuente de verdad.
interface UiState {
  theme: Theme;
  mobileNavOpen: boolean;
  // ── Catálogo público ──
  search: string;
  /** id de categoría, o null = todas. */
  activeCategory: string | null;
  priceMin: number | null;
  priceMax: number | null;
  sort: CatalogSort;
  onlyOnSale: boolean;
  onlyInStock: boolean;
  /** Bottom sheet de filtros avanzados (móvil). */
  filterSheetOpen: boolean;
}

const initialState: UiState = {
  theme: 'dark', // Editorial Dark por defecto (doc 05 §7)
  mobileNavOpen: false,
  search: '',
  activeCategory: null,
  priceMin: null,
  priceMax: null,
  sort: 'relevant',
  onlyOnSale: false,
  onlyInStock: false,
  filterSheetOpen: false,
};

// Un precio negativo no filtra nada útil y ensucia la etiqueta del chip activo.
const clampPrice = (value: number | null) =>
  value == null || Number.isNaN(value) ? null : Math.max(0, value);

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    themeSet(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
    mobileNavSet(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    searchSet(state, action: PayloadAction<string>) {
      state.search = action.payload;
    },
    categorySet(state, action: PayloadAction<string | null>) {
      state.activeCategory = action.payload;
    },
    priceMinSet(state, action: PayloadAction<number | null>) {
      state.priceMin = clampPrice(action.payload);
    },
    priceMaxSet(state, action: PayloadAction<number | null>) {
      state.priceMax = clampPrice(action.payload);
    },
    sortSet(state, action: PayloadAction<CatalogSort>) {
      state.sort = action.payload;
    },
    onlyOnSaleSet(state, action: PayloadAction<boolean>) {
      state.onlyOnSale = action.payload;
    },
    onlyInStockSet(state, action: PayloadAction<boolean>) {
      state.onlyInStock = action.payload;
    },
    filterSheetSet(state, action: PayloadAction<boolean>) {
      state.filterSheetOpen = action.payload;
    },
    /** Limpia los filtros AVANZADOS; deja búsqueda y categoría en pie. */
    filtersReset(state) {
      state.priceMin = null;
      state.priceMax = null;
      state.sort = 'relevant';
      state.onlyOnSale = false;
      state.onlyInStock = false;
    },
    /** "Limpiar todo" de los chips: deja el catálogo como recién cargado. */
    filtersClearedAll(state) {
      state.search = '';
      state.activeCategory = null;
      state.priceMin = null;
      state.priceMax = null;
      state.sort = 'relevant';
      state.onlyOnSale = false;
      state.onlyInStock = false;
    },
  },
  selectors: {
    selectTheme: (state) => state.theme,
    selectMobileNavOpen: (state) => state.mobileNavOpen,
    selectSearch: (state) => state.search,
    selectActiveCategory: (state) => state.activeCategory,
    selectPriceMin: (state) => state.priceMin,
    selectPriceMax: (state) => state.priceMax,
    selectSort: (state) => state.sort,
    selectOnlyOnSale: (state) => state.onlyOnSale,
    selectOnlyInStock: (state) => state.onlyInStock,
    selectFilterSheetOpen: (state) => state.filterSheetOpen,
    /** Cuántos filtros AVANZADOS hay puestos — alimenta el badge del botón móvil. */
    selectActiveFilterCount: (state) => {
      let n = 0;
      if (state.priceMin != null) n += 1;
      if (state.priceMax != null) n += 1;
      if (state.sort !== 'relevant') n += 1;
      if (state.onlyOnSale) n += 1;
      if (state.onlyInStock) n += 1;
      return n;
    },
  },
});

export const {
  themeSet,
  mobileNavSet,
  searchSet,
  categorySet,
  priceMinSet,
  priceMaxSet,
  sortSet,
  onlyOnSaleSet,
  onlyInStockSet,
  filterSheetSet,
  filtersReset,
  filtersClearedAll,
} = uiSlice.actions;

export const {
  selectTheme,
  selectMobileNavOpen,
  selectSearch,
  selectActiveCategory,
  selectPriceMin,
  selectPriceMax,
  selectSort,
  selectOnlyOnSale,
  selectOnlyInStock,
  selectFilterSheetOpen,
  selectActiveFilterCount,
} = uiSlice.selectors;

export const uiReducer = uiSlice.reducer;
