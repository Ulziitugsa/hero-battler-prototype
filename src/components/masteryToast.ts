import type { GameEvent } from '../game/types';

export interface MasteryToast {
  key: number;
  name: string;
  rank: number;
  outcome: 'applied' | 'no-target';
  detail: string;
}

let toastSeq = 0;

/** The player's Mastery trigger from a batch of engine events, as a small floating label - or null if it didn't fire. The engine already decided everything; this only words it. */
export function masteryToastFrom(events: GameEvent[]): MasteryToast | null {
  const e = events.find((ev): ev is Extract<GameEvent, { type: 'MASTERY_TRIGGERED' }> => ev.type === 'MASTERY_TRIGGERED' && ev.side === 'player');
  return e ? { key: ++toastSeq, name: e.name, rank: e.rank, outcome: e.outcome, detail: e.detail } : null;
}
