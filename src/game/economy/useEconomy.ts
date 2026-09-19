import { useSyncExternalStore } from 'react';
import { getEconomy, isUnlimitedGems, subscribeEconomy, subscribeUnlimited } from './economy';
import type { PlayerEconomy } from './types';

/** Live Gems / pity / history: re-renders whenever the economy changes. */
export function useEconomy(): PlayerEconomy {
  return useSyncExternalStore(subscribeEconomy, getEconomy, getEconomy);
}

/** Dev-only Unlimited Gems flag (always false in production builds). */
export function useUnlimitedGems(): boolean {
  return useSyncExternalStore(subscribeUnlimited, isUnlimitedGems, () => false);
}
