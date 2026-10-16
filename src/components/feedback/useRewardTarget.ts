import { useCallback } from 'react';
import { registerRewardTarget, type RewardKind } from './rewardBus';

/**
 * Makes an element the landing spot for one kind of reward while it is mounted (see rewardBus.ts). Pass the returned
 * callback as the element's `ref`.
 */
export function useRewardTarget<T extends HTMLElement>(kind: RewardKind): (element: T | null) => (() => void) | undefined {
  return useCallback((element: T | null) => (element ? registerRewardTarget(kind, element) : undefined), [kind]);
}
