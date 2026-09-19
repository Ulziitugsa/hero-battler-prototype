import { grantCard, removeCard, resetCollection, setAllOwned, getCollection } from './collection';
import { getStarterDeckUnlockProgress, starterDeckId } from './starterUnlock';
import { getCardAcquisitionSources, getUnavailableCards } from './acquisition';
import { PLAYTEST_ROSTER } from '../cards/roster';
import type { StarterFaction } from '../cards/starterDecks';

// DEV ONLY - attached to window.skyloomDev by main.tsx behind import.meta.env.DEV, so it never ships.
// e.g. skyloomDev.grant('und-mira'), skyloomDev.setAllOwned(), skyloomDev.reset().
export const devTools = {
  grant: (cardId: string, count = 1) => grantCard(cardId, count),
  remove: (cardId: string, count = 1) => removeCard(cardId, count),
  setAllOwned: (copies = 2) => setAllOwned(copies),
  reset: () => resetCollection(),
  get: () => getCollection(),
  /** Grants exactly the missing copies a starter deck needs (e.g. 'undead'), unlocking it. */
  grantStarterRequirements: (faction: StarterFaction) => {
    for (const r of getStarterDeckUnlockProgress(starterDeckId(faction))?.requirements ?? []) if (!r.met) grantCard(r.cardId, r.need - r.have);
  },
  starterProgress: (faction: StarterFaction) => getStarterDeckUnlockProgress(starterDeckId(faction)),
  /** Every roster card with its acquisition sources; unavailable lists cards with no path at all. */
  acquisitionReport: () => ({ sources: Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, getCardAcquisitionSources(id)])), unavailable: getUnavailableCards() }),
};
