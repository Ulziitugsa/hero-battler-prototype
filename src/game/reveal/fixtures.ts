import { getCard } from '../cards';
import { fullBoxContents, getArchetypeBox } from '../box/archetypeBoxes';
import type { BoxPull } from '../box/boxPool';
import type { Rarity } from '../types';

// DEV / QA ONLY: fixed openings for the pull-reveal preview (`?revealFixture=one|ten` on a dev build, RevealFixturePage).
// They are built here from card ids and nothing else: no Box is opened, nothing is granted, saved or tracked, and no
// production code path reads this file. Real pulls only ever come from a Box itself.

export type RevealFixture = 'one' | 'ten';

/** The Box the fixtures draw their card ids from (its name heads the ceremony). */
export const REVEAL_FIXTURE_BOX = 'bone-legion' as const;

/** A single pull: the Box's Legendary (the hero reveal). */
const ONE: Rarity[] = ['legendary'];

/** A 10-pull with two Epics and the Legendary drawn mid-way (the ceremony still ends on it). */
const TEN: Rarity[] = ['common', 'rare', 'epic', 'common', 'legendary', 'common', 'rare', 'common', 'epic', 'common'];

export function revealFixtureBoxName(): string {
  return getArchetypeBox(REVEAL_FIXTURE_BOX).name;
}

/** The opening as Pull Results and the ceremony read it: cycling through the Box's own cards of each rarity. */
export function revealFixturePulls(kind: RevealFixture): BoxPull[] {
  const ids = Object.keys(fullBoxContents(REVEAL_FIXTURE_BOX));
  const byRarity = (r: Rarity) => ids.filter((id) => getCard(id).rarity === r);
  const used: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const rarities = kind === 'one' ? ONE : TEN;
  return rarities.map((rarity, i) => {
    const pool = byRarity(rarity);
    const cardId = pool[used[rarity]++ % pool.length];
    const isNew = i % 3 === 0;
    return { cardId, rarity, previousCopies: isNew ? 0 : 1, ownedCopies: isNew ? 1 : 2, isNew };
  });
}
