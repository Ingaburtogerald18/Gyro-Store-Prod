import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  CatalogProduct,
  CategoryMode,
  DraftComboChange,
  DraftProductChange,
  HeroSlide,
  LandingConfig,
  StoreDraftProducts,
} from '@shared/schemas';

// Deshacer y rehacer cubren la portada y los productos juntos.
interface Snapshot {
  landing: LandingConfig;
  products: StoreDraftProducts;
}

interface BuilderState {
  // Estado borrador de la configuración actual, solo activo durante el Modo Edición.
  draftLandingConfig: LandingConfig | null;
  draftProducts: StoreDraftProducts;
  /** Solo en la vista previa (iframe): el catálogo con los cambios del borrador. */
  previewCatalog: CatalogProduct[] | null;
  activeHeroSlideId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  changeKey: string | null;
}

const emptyProducts = (): StoreDraftProducts => ({ items: {}, combos: {} });
// Referencia estable: un `[]` nuevo en cada lectura re-renderiza a quien lo selecciona.
const EMPTY_IDS: string[] = [];

const initialState: BuilderState = {
  draftLandingConfig: null,
  draftProducts: emptyProducts(),
  previewCatalog: null,
  activeHeroSlideId: null,
  past: [],
  future: [],
  changeKey: null,
};

const snapshot = (state: BuilderState): Snapshot =>
  JSON.parse(JSON.stringify({ landing: state.draftLandingConfig, products: state.draftProducts })) as Snapshot;

function remember(state: BuilderState, key: string | null = null) {
  if (!state.draftLandingConfig) return;
  if (!key || state.changeKey !== key) {
    state.past.push(snapshot(state));
    if (state.past.length > 50) state.past.shift();
  }
  state.future = [];
  state.changeKey = key;
}

function restore(state: BuilderState, to: Snapshot) {
  state.draftLandingConfig = to.landing;
  state.draftProducts = to.products;
}

const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    selectHeroSlide(state, action: PayloadAction<string | null>) {
      state.activeHeroSlideId = action.payload;
    },
    // Inicia una sesión de edición con la configuración actual
    initBuilderSession(state, action: PayloadAction<LandingConfig>) {
      state.draftLandingConfig = action.payload;
      state.past = [];
      state.future = [];
      state.changeKey = null;
    },
    // Actualiza el orden de las categorías del header
    updateHeaderCategories(state, action: PayloadAction<string[]>) {
      if (state.draftLandingConfig) {
        remember(state);
        state.draftLandingConfig.headerCategories = action.payload;
      }
    },
    // Modo de cada zona de categorías (automático / elegidas / oculta).
    setCategoryMode(state, action: PayloadAction<{ zone: 'header' | 'home'; mode: CategoryMode }>) {
      if (!state.draftLandingConfig) return;
      remember(state);
      if (action.payload.zone === 'header')
        state.draftLandingConfig.headerCategoriesMode = action.payload.mode;
      else state.draftLandingConfig.homeCategoriesMode = action.payload.mode;
    },
    // Actualiza el orden de los carriles (homeCategories)
    updateHomeCategories(state, action: PayloadAction<string[]>) {
      if (state.draftLandingConfig) {
        remember(state);
        state.draftLandingConfig.homeCategories = action.payload;
      }
    },
    // Destacados de la portada, en orden.
    updateFeaturedProducts(state, action: PayloadAction<string[]>) {
      if (!state.draftLandingConfig) return;
      remember(state);
      state.draftLandingConfig.featuredProductIds = action.payload;
    },
    // Cambios de productos que trae el borrador del servidor; no entran a la historia.
    initDraftProducts(state, action: PayloadAction<StoreDraftProducts>) {
      state.draftProducts = action.payload;
    },
    updateDraftProduct(state, action: PayloadAction<{ id: string; change: DraftProductChange; key?: string }>) {
      if (!state.draftLandingConfig) return;
      remember(state, action.payload.key ?? null);
      const { id, change } = action.payload;
      state.draftProducts.items[id] = { ...state.draftProducts.items[id], ...change };
    },
    updateDraftCombo(state, action: PayloadAction<{ id: string; change: DraftComboChange }>) {
      if (!state.draftLandingConfig) return;
      remember(state);
      const { id, change } = action.payload;
      state.draftProducts.combos[id] = { ...state.draftProducts.combos[id], ...change };
    },
    setDraftProductOrder(state, action: PayloadAction<string[]>) {
      if (!state.draftLandingConfig) return;
      remember(state);
      state.draftProducts.order = action.payload;
    },
    setPreviewCatalog(state, action: PayloadAction<CatalogProduct[] | null>) {
      state.previewCatalog = action.payload;
    },
    // Descarta los cambios
    clearBuilderSession(state) {
      state.draftLandingConfig = null;
      state.draftProducts = emptyProducts();
      state.activeHeroSlideId = null;
      state.past = [];
      state.future = [];
      state.changeKey = null;
    },
    // Actualiza las diapositivas del hero
    updateHeroSlides(state, action: PayloadAction<import('@shared/schemas').HeroSlide[]>) {
      if (state.draftLandingConfig) {
        remember(state);
        state.draftLandingConfig.heroSlides = action.payload;
      }
    },
    // El carrito comparte el borrador y su publicación con la portada; `key` junta
    // lo que se escribe en un mismo campo en un solo paso de deshacer.
    updateCartContent(state, action: PayloadAction<{ content: import('@shared/schemas').CartContent; key?: string }>) {
      if (state.draftLandingConfig) {
        remember(state, action.payload.key ?? null);
        state.draftLandingConfig.cart = action.payload.content;
      }
    },
    updateHeroSlide(state, action: PayloadAction<{ slide: HeroSlide; key?: string }>) {
      const index =
        state.draftLandingConfig?.heroSlides.findIndex(
          (slide) => slide.id === action.payload.slide.id,
        ) ?? -1;
      if (!state.draftLandingConfig || index < 0) return;
      if (
        JSON.stringify(state.draftLandingConfig.heroSlides[index]) ===
        JSON.stringify(action.payload.slide)
      )
        return;
      remember(state, action.payload.key ?? null);
      state.draftLandingConfig.heroSlides[index] = action.payload.slide;
    },
    endBuilderChange(state) {
      state.changeKey = null;
    },
    undoBuilderChange(state) {
      const previous = state.past.pop();
      if (!previous || !state.draftLandingConfig) return;
      state.future.push(snapshot(state));
      restore(state, previous);
      state.changeKey = null;
    },
    redoBuilderChange(state) {
      const next = state.future.pop();
      if (!next || !state.draftLandingConfig) return;
      state.past.push(snapshot(state));
      restore(state, next);
      state.changeKey = null;
    },
  },
  selectors: {
    selectActiveHeroSlideId: (state) => state.activeHeroSlideId,
    selectDraftLandingConfig: (state) => state.draftLandingConfig,
    selectDraftProducts: (state) => state.draftProducts,
    selectPreviewCatalog: (state) => state.previewCatalog,
    selectCanUndoBuilder: (state) => state.past.length > 0,
    selectCanRedoBuilder: (state) => state.future.length > 0,
    selectDraftHeaderCategories: (state) => state.draftLandingConfig?.headerCategories || [],
    selectDraftHomeCategories: (state) => state.draftLandingConfig?.homeCategories || [],
    selectDraftFeaturedProducts: (state) => state.draftLandingConfig?.featuredProductIds || EMPTY_IDS,
  },
});

export const {
  selectHeroSlide,
  initBuilderSession,
  updateHeaderCategories,
  updateHomeCategories,
  updateFeaturedProducts,
  setCategoryMode,
  clearBuilderSession,
  updateHeroSlides,
  updateCartContent,
  updateHeroSlide,
  initDraftProducts,
  updateDraftProduct,
  updateDraftCombo,
  setDraftProductOrder,
  setPreviewCatalog,
  endBuilderChange,
  undoBuilderChange,
  redoBuilderChange,
} = builderSlice.actions;

export const {
  selectActiveHeroSlideId,
  selectDraftLandingConfig,
  selectDraftProducts,
  selectPreviewCatalog,
  selectCanUndoBuilder,
  selectCanRedoBuilder,
  selectDraftHeaderCategories,
  selectDraftHomeCategories,
  selectDraftFeaturedProducts,
} = builderSlice.selectors;

export const builderReducer = builderSlice.reducer;
