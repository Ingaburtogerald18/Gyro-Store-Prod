// Estado de UI compartido: el tema (lo aplica useTheme) y los filtros del catálogo, que leen tres
// piezas a la vez (conteo, grilla y chips).
import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_THEME, type Theme } from '~/lib/theme';
import type { CatalogFilters, CatalogSort } from '~/lib/catalog-query';

export type { Theme } from '~/lib/theme';
export type { CatalogSort } from '~/lib/catalog-query';

// La apertura del carrito vive en cartSlice.
interface UiState {
  theme: Theme;
  mobileNavOpen: boolean;
  // ── Catálogo público ── Reflejo de la URL de la home (lib/catalog-query): manda la URL.
  search: string;
  /** slug de categoría, o null = todas. */
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
  theme: DEFAULT_THEME,
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
    /** Todos los filtros de una vez, leídos de la URL (un parámetro ausente = valor por defecto). */
    catalogFiltersApplied(state, action: PayloadAction<CatalogFilters>) {
      const f = action.payload;
      state.search = f.search;
      state.activeCategory = f.category;
      state.priceMin = clampPrice(f.priceMin);
      state.priceMax = clampPrice(f.priceMax);
      state.sort = f.sort;
      state.onlyOnSale = f.onlyOnSale;
      state.onlyInStock = f.onlyInStock;
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
  catalogFiltersApplied,
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

type UiRoot = { ui: UiState };

/** Los filtros del catálogo como un objeto estable (cambia solo si cambia algo). */
export const selectCatalogFilters = createSelector(
  [
    (s: UiRoot) => s.ui.search,
    (s: UiRoot) => s.ui.activeCategory,
    (s: UiRoot) => s.ui.priceMin,
    (s: UiRoot) => s.ui.priceMax,
    (s: UiRoot) => s.ui.sort,
    (s: UiRoot) => s.ui.onlyOnSale,
    (s: UiRoot) => s.ui.onlyInStock,
  ],
  (search, category, priceMin, priceMax, sort, onlyOnSale, onlyInStock): CatalogFilters => ({
    search, category, priceMin, priceMax, sort, onlyOnSale, onlyInStock,
  }),
);
