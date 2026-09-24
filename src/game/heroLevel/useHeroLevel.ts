import { useSyncExternalStore } from 'react';
import { getHeroLevelState, subscribeHeroLevel } from './store';
import type { HeroLevelState } from './types';

/** Live Hero Level state: re-renders whenever any hero's Level changes. */
export function useHeroLevel(): HeroLevelState {
  return useSyncExternalStore(subscribeHeroLevel, getHeroLevelState, getHeroLevelState);
}
