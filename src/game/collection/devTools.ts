import { grantCard, removeCard, resetCollection, setAllOwned, getCollection } from './collection';
import { getStarterDeckUnlockProgress, starterDeckId } from './starterUnlock';
import { getCardAcquisitionSources, getUnavailableCards } from './acquisition';
import { PLAYTEST_ROSTER } from '../cards/roster';
import type { StarterFaction } from '../cards/starterDecks';
import { getAccount, grantXp, resetProgression, setLevel, setMasteryRank, unlockMastery } from '../progression/account';
import type { MasteryId } from '../mastery/definitions';
import { ascendCard, getAscensionStatus } from '../ascension/ascend';
import { CARD_ASCENSIONS } from '../ascension/definitions';
import { getAscensionState, resetAscension, setAscensionRank } from '../ascension/store';

// DEV ONLY - attached to window.skyloomDev by main.tsx behind import.meta.env.DEV, so it never ships.
// e.g. skyloomDev.grant('und-mira'), skyloomDev.setAllOwned(), skyloomDev.reset().
export const devTools = {
  grant: (cardId: string, count = 1) => grantCard(cardId, count),
  remove: (cardId: string, count = 1) => removeCard(cardId, count),
  setAllOwned: (copies = 2) => setAllOwned(copies),
  reset: () => resetCollection(),
  get: () => getCollection(),
  // ---- Ascension ----
  grantCopies: (cardId: string, count = 1) => grantCard(cardId, count),
  setAscensionRank: (cardId: string, rank: number) => setAscensionRank(cardId, rank),
  resetAscension: () => resetAscension(),
  ascend: (cardId: string) => ascendCard(cardId),
  ascensionReport: () => ({ state: getAscensionState(), cards: Object.fromEntries(CARD_ASCENSIONS.map((c) => [c.cardId, getAscensionStatus(c.cardId)])) }),
  // ---- Account progression ----
  account: () => getAccount(),
  addXp: (amount: number) => grantXp(amount),
  setLevel: (level: number) => setLevel(level),
  unlockMastery: (id: MasteryId, rank = 1) => unlockMastery(id, rank),
  setMasteryRank: (id: MasteryId, rank: number) => setMasteryRank(id, rank),
  resetProgression: () => resetProgression(),
  /** Grants exactly the missing copies a starter deck needs (e.g. 'undead'), unlocking it. */
  grantStarterRequirements: (faction: StarterFaction) => {
    for (const r of getStarterDeckUnlockProgress(starterDeckId(faction))?.requirements ?? []) if (!r.met) grantCard(r.cardId, r.need - r.have);
  },
  starterProgress: (faction: StarterFaction) => getStarterDeckUnlockProgress(starterDeckId(faction)),
  /** Every roster card with its acquisition sources; unavailable lists cards with no path at all. */
  acquisitionReport: () => ({ sources: Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, getCardAcquisitionSources(id)])), unavailable: getUnavailableCards() }),
};
