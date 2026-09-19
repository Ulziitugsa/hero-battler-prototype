import { useSyncExternalStore } from 'react';
import { getCollection, subscribeCollection } from './collection';
import type { OwnedMap } from './types';

/** Live view of the player's collection: re-renders the component whenever a grant/removal happens. */
export function useCollection(): OwnedMap {
  return useSyncExternalStore(subscribeCollection, getCollection, getCollection);
}
