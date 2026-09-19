import { useSyncExternalStore } from 'react';
import { getAscensionState, subscribeAscension, type AscensionState } from './store';

/** Live Ascension progression: re-renders when any card's rank changes. */
export function useAscension(): AscensionState {
  return useSyncExternalStore(subscribeAscension, getAscensionState, getAscensionState);
}
