import type { CardDefinition } from '../types/index.js';
import { cardFaceStats, deckStartingHp } from './cardFace.js';

/** @deprecated Use `cardFaceStats` from ./cardFace. Kept so existing callers keep compiling; `lp` equals `hpContribution`. */
export interface CardStatsPreview {
  atk: number;
  lp: number;
}

/** @deprecated Use `cardFaceStats` from ./cardFace. */
export function cardStatsPreview(card: CardDefinition, effectivePower = card.power): CardStatsPreview | null {
  const stats = cardFaceStats(card, effectivePower);
  return stats && { atk: stats.atk, lp: stats.hpContribution };
}

/** @deprecated Use `deckStartingHp` from ./cardFace. */
export function deckLifePreview(cards: readonly CardDefinition[]): number {
  return deckStartingHp(cards);
}
