import { useSyncExternalStore } from 'react';
import { getPurchaseState, subscribePurchases } from './store';
import type { PurchaseState } from './store';

/** Live purchase state: re-renders whenever a (simulated) purchase completes. */
export function useOffers(): PurchaseState {
  return useSyncExternalStore(subscribePurchases, getPurchaseState, getPurchaseState);
}
