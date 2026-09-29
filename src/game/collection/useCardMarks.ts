import { useSyncExternalStore } from 'react';
import { getCardMarks, subscribeCardMarks, type CardMarksState } from './cardMarks';

/** Live favorites / last-obtained marks: re-renders when a card is favorited or granted. */
export function useCardMarks(): CardMarksState {
  return useSyncExternalStore(subscribeCardMarks, getCardMarks, getCardMarks);
}
