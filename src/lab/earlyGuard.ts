import { isLabUrl } from './labAccess';
import { installStorageGuard, type StorageGuard } from './storageGuard';

// Imported first by main.tsx, so it runs before any other module of the game: when this page load is the Card Discovery
// Lab, every write to localStorage is refused from the very start (storageGuard.ts). In a build without the lab
// (__CARD_LAB__ = false) this is null and nothing is installed.

export const labGuard: StorageGuard | null =
  __CARD_LAB__ && typeof window !== 'undefined' && isLabUrl(window.location.search) ? installStorageGuard(window.localStorage, (entry) => console.warn('[card lab] refused a save write:', entry)) : null;
