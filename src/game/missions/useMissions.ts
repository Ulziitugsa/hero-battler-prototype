import { useSyncExternalStore } from 'react';
import { getMissionsState, subscribeMissions } from './store';
import type { MissionsState } from './store';

/** Live missions state: re-renders whenever progress advances, a period rolls over, or a mission is claimed. */
export function useMissions(): MissionsState {
  return useSyncExternalStore(subscribeMissions, () => getMissionsState(), () => getMissionsState());
}
