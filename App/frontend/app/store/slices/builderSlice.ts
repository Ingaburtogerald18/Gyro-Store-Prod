import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CategoryMode, HeroSlide, LandingConfig } from '@shared/schemas';

interface BuilderState {
  // Estado borrador de la configuración actual, solo activo durante el Modo Edición.
  draftLandingConfig: LandingConfig | null;
  activeHeroSlideId: string | null;
  past: LandingConfig[];
  future: LandingConfig[];
  changeKey: string | null;
}

const initialState: BuilderState = {
  draftLandingConfig: null,
  activeHeroSlideId: null,
  past: [],
  future: [],
  changeKey: null,
};

function remember(state: BuilderState, key: string | null = null) {
  if (!state.draftLandingConfig) return;
  if (!key || state.changeKey !== key) {
    state.past.push(JSON.parse(JSON.stringify(state.draftLandingConfig)) as LandingConfig);
    if (state.past.length > 50) state.past.shift();
  }
  state.future = [];
  state.changeKey = key;
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
    // Descarta los cambios
    clearBuilderSession(state) {
      state.draftLandingConfig = null;
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
    // El carrito comparte el borrador y su publicación con la portada.
    updateCartContent(state, action: PayloadAction<import('@shared/schemas').CartContent>) {
      if (state.draftLandingConfig) {
        remember(state);
        state.draftLandingConfig.cart = action.payload;
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
      state.future.push(state.draftLandingConfig);
      state.draftLandingConfig = previous;
      state.changeKey = null;
    },
    redoBuilderChange(state) {
      const next = state.future.pop();
      if (!next || !state.draftLandingConfig) return;
      state.past.push(state.draftLandingConfig);
      state.draftLandingConfig = next;
      state.changeKey = null;
    },
  },
  selectors: {
    selectActiveHeroSlideId: (state) => state.activeHeroSlideId,
    selectDraftLandingConfig: (state) => state.draftLandingConfig,
    selectCanUndoBuilder: (state) => state.past.length > 0,
    selectCanRedoBuilder: (state) => state.future.length > 0,
    selectDraftHeaderCategories: (state) => state.draftLandingConfig?.headerCategories || [],
    selectDraftHomeCategories: (state) => state.draftLandingConfig?.homeCategories || [],
  },
});

export const {
  selectHeroSlide,
  initBuilderSession,
  updateHeaderCategories,
  updateHomeCategories,
  setCategoryMode,
  clearBuilderSession,
  updateHeroSlides,
  updateCartContent,
  updateHeroSlide,
  endBuilderChange,
  undoBuilderChange,
  redoBuilderChange,
} = builderSlice.actions;

export const {
  selectActiveHeroSlideId,
  selectDraftLandingConfig,
  selectCanUndoBuilder,
  selectCanRedoBuilder,
  selectDraftHeaderCategories,
  selectDraftHomeCategories,
} = builderSlice.selectors;

export const builderReducer = builderSlice.reducer;
