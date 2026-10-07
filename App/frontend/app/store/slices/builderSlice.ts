import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CategoryMode, LandingConfig } from '@shared/schemas';

interface BuilderState {
  // Estado borrador de la configuración actual, solo activo durante el Modo Edición.
  draftLandingConfig: LandingConfig | null;
  activeHeroSlideId: string | null;
}

const initialState: BuilderState = {
  draftLandingConfig: null,
  activeHeroSlideId: null,
};

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
    },
    // Actualiza el orden de las categorías del header
    updateHeaderCategories(state, action: PayloadAction<string[]>) {
      if (state.draftLandingConfig) {
        state.draftLandingConfig.headerCategories = action.payload;
      }
    },
    // Modo de cada zona de categorías (automático / elegidas / oculta).
    setCategoryMode(state, action: PayloadAction<{ zone: 'header' | 'home'; mode: CategoryMode }>) {
      if (!state.draftLandingConfig) return;
      if (action.payload.zone === 'header') state.draftLandingConfig.headerCategoriesMode = action.payload.mode;
      else state.draftLandingConfig.homeCategoriesMode = action.payload.mode;
    },
    // Actualiza el orden de los carriles (homeCategories)
    updateHomeCategories(state, action: PayloadAction<string[]>) {
      if (state.draftLandingConfig) {
        state.draftLandingConfig.homeCategories = action.payload;
      }
    },
    // Descarta los cambios
    clearBuilderSession(state) {
      state.draftLandingConfig = null;
      state.activeHeroSlideId = null;
    },
    // Actualiza las diapositivas del hero
    updateHeroSlides(state, action: PayloadAction<import('@shared/schemas').HeroSlide[]>) {
      if (state.draftLandingConfig) {
        state.draftLandingConfig.heroSlides = action.payload;
      }
    },
    // Textos e imágenes del carrito (se publican con «Guardar cambios», como los slides)
    updateCartContent(state, action: PayloadAction<import('@shared/schemas').CartContent>) {
      if (state.draftLandingConfig) {
        state.draftLandingConfig.cart = action.payload;
      }
    },
  },
  selectors: {
    selectActiveHeroSlideId: (state) => state.activeHeroSlideId,
    selectDraftLandingConfig: (state) => state.draftLandingConfig,
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
} = builderSlice.actions;

export const {
  selectActiveHeroSlideId,
  selectDraftLandingConfig,
  selectDraftHeaderCategories,
  selectDraftHomeCategories,
} = builderSlice.selectors;

export const builderReducer = builderSlice.reducer;
