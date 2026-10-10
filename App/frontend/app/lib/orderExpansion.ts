export interface OrderExpansion {
  all: boolean;
  exceptions: Record<string, boolean>;
}

export type OrderExpansionAction = { type: 'toggle'; id: string } | { type: 'all'; open: boolean };

export function orderIsExpanded(state: OrderExpansion, id: string) {
  return state.exceptions[id] ?? state.all;
}

export function orderExpansionReducer(state: OrderExpansion, action: OrderExpansionAction): OrderExpansion {
  if (action.type === 'all') return { all: action.open, exceptions: {} };
  return { ...state, exceptions: { ...state.exceptions, [action.id]: !orderIsExpanded(state, action.id) } };
}
