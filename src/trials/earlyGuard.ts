import { isTrialsUrl } from './access';
import { installStorageGuard, type StorageGuard } from '../lab/storageGuard';

// Imported first by main.tsx, so it runs before any other module of the game: on an Arcane Trials page load, every write
// to localStorage is refused from the very start (lab/storageGuard.ts, shared with the Card Discovery Lab). In a build
// without experiments (__CARD_LAB__ = false) this is null and nothing is installed.

export const trialsGuard: StorageGuard | null =
  __CARD_LAB__ && typeof window !== 'undefined' && isTrialsUrl(window.location.search) ? installStorageGuard(window.localStorage, (entry) => console.warn('[arcane trials] refused a save write:', entry)) : null;
