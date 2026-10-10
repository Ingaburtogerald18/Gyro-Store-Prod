// ¿Hay alguna query de RTK Query en vuelo? Lee el estado de `baseApi` directo
// para que el indicador global vea la actividad de todo el árbol.
import { useAppSelector } from '~/store/hooks';

export function useAnyQueryPending(): boolean {
  return useAppSelector((s) => {
    const queries = s.api?.queries ?? {};
    return Object.values(queries).some((q) => q?.status === 'pending');
  });
}
