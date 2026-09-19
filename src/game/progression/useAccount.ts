import { useSyncExternalStore } from 'react';
import { getAccount, subscribeAccount } from './account';
import type { AccountState } from './types';

/** Live account progression: re-renders whenever XP, level, Mastery rank or the equipped Mastery changes. */
export function useAccount(): AccountState {
  return useSyncExternalStore(subscribeAccount, getAccount, getAccount);
}
