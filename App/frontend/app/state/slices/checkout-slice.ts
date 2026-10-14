import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PublicOrderFields, PublicOrderInput } from '@shared/schemas';
import type { DiscountCodeValidation } from '../api/discount-codes-api';

export type CheckoutFields = Omit<PublicOrderFields, 'discountCode'>;
export const EMPTY_CHECKOUT_FIELDS: CheckoutFields = { customerName: '', phone: '', deliveryMethod: 'retiro' };
const initialState = {
  fields: EMPTY_CHECKOUT_FIELDS,
  codeInput: '', appliedCode: null as DiscountCodeValidation | null,
  couponOpen: false, noteOpen: false,
  attempt: null as PublicOrderInput | null,
};
const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    checkoutFieldsChanged(state, action: PayloadAction<CheckoutFields>) { state.fields = action.payload; },
    checkoutExtrasChanged(state, action: PayloadAction<Partial<Omit<typeof initialState, 'fields'>>>) {
      Object.assign(state, action.payload);
    },
    checkoutCleared: () => ({ ...initialState, fields: { ...EMPTY_CHECKOUT_FIELDS } }),
  },
  selectors: { selectCheckoutDraft: state => state },
});
export const { checkoutFieldsChanged, checkoutExtrasChanged, checkoutCleared } = checkoutSlice.actions;
export const { selectCheckoutDraft } = checkoutSlice.selectors;
export const checkoutReducer = checkoutSlice.reducer;
