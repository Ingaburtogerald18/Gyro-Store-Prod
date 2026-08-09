// Hooks tipados (doc 09 ítem 40): usar SIEMPRE estos en vez de los crudos de
// react-redux, para que dispatch y selector conozcan el shape real del store.
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
