import { getAscensionRank } from './store';

// Card Mastery advancement (stored as the legacy Ascension rank) is RETIRED.
//
// Combat Card Mastery is removed (docs/CARD-COMBAT-DESIGN.md section 7): cards play at their printed values, so a
// Mastery stage would buy nothing in battle. No player action can advance a card any more:
//   - no duplicate copies are spent (the collection quantity is never lowered here);
//   - no Gold is charged (the old Mastery IV / V fees in config economy.masteryGoldFee are inert: nothing reads them);
//   - the stored rank and duplicatesSpent are never written.
// Historical Ascension/Mastery data is preserved for future cosmetic Prestige conversion and has no combat effect
// (cardMastery/model.ts reads it). `ascendCard` stays as the one entry point older callers (dev tools) reach, and it
// refuses every request without touching the save.

export type AscendBlock = 'retired';

export interface AscendResult {
  ok: boolean;
  cardId: string;
  newRank: number;
  spent: number;
  goldSpent: number;
  reason: string | null;
}

export const MASTERY_RETIRED_REASON = 'Card Mastery upgrades are retired. Cards play at their printed values.';

/** Always refuses: spends no copies and no Gold, and leaves the stored rank untouched. */
export function ascendCard(cardId: string): AscendResult {
  return { ok: false, cardId, newRank: getAscensionRank(cardId), spent: 0, goldSpent: 0, reason: MASTERY_RETIRED_REASON };
}

/** Player-facing name of a stored rank: rank 0..4 = "Mastery I".."Mastery V". */
export const ascensionLabel = (rank: number): string => `Mastery ${ascensionNumeral(rank)}`;
/** The Mastery numeral of a stored rank (rank 1 = "II"). */
export const ascensionNumeral = (rank: number): string => ['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, Math.floor(rank)))] ?? 'I';
