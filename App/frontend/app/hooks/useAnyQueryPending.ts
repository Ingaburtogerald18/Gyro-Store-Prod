// ¿Hay alguna query de RTK Query en vuelo?
//
// Vivía en `module-loader.tsx`, junto al overlay que se retiró en la Fase 1.
// Se movió acá porque quien lo consume ahora es `GlobalProgress`, que no tiene
// nada que ver con aquel loader.
//
// Lee el estado del `baseApi` (reducerPath 'api') directo, en vez de que cada
// vista tenga que reportar su propio `isFetching`: el indicador global tiene
// que saber si hay actividad en CUALQUIER parte del árbol.
import { useAppSelector } from '~/store/hooks';

export function useAnyQueryPending(): boolean {
  return useAppSelector((s) => {
    const queries = s.api?.queries ?? {};
    return Object.values(queries).some((q) => q?.status === 'pending');
  });
}
