import { useCallback, useState, useSyncExternalStore } from 'react';
import { getMissionsState, subscribeMissions } from './store';
import type { MissionsState } from './store';
import { useAppResume } from '../../platform/lifecycle';

/** Live missions state: re-renders whenever progress advances, a period rolls over, or a mission is claimed. */
export function useMissions(): MissionsState {
  const [resumeTick, setResumeTick] = useState(0);
  const onResume = useCallback(() => setResumeTick((tick) => tick + 1), []);
  useAppResume(onResume);
  return useSyncExternalStore(subscribeMissions, () => { void resumeTick; return getMissionsState(); }, () => getMissionsState());
}
