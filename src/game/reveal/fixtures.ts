import { getCard } from '../cards';
import { prototypeBoxCardIds, type PrototypeBoxPull } from '../box/prototypeBox';
import type { Rarity } from '../types';

// DEV / QA ONLY: fixed openings for the pack-reveal preview (`?revealFixture=one|ten` on a dev build, RevealFixturePage).
// They are built here from card ids and nothing else: no Box is opened, nothing is granted, saved or tracked, and no
// production code path reads this file. Real packs only ever come from the Box itself.

export type RevealFixture = 'one' | 'ten';

/** One pack of Common, Common, Rare, Epic and Legendary, drawn with the Legendary second (the ceremony still ends on it). */
const ONE: Rarity[] = ['common', 'legendary', 'rare', 'common', 'epic'];

/** Ten packs: four Epics across four packs (one beside a Rare) and one Legendary, so the climax pack is not the last drawn. */
const TEN: Rarity[][] = [
  ['common', 'common', 'common', 'rare', 'common'],
  ['common', 'common', 'rare', 'common', 'common'],
  ['common', 'epic', 'common', 'common', 'rare'],
  ['common', 'common', 'common', 'common', 'common'],
  ['rare', 'common', 'epic', 'rare', 'common'],
  ['common', 'common', 'common', 'rare', 'common'],
  ['epic', 'common', 'legendary', 'common', 'common'],
  ['common', 'rare', 'common', 'common', 'common'],
  ['common', 'common', 'epic', 'common', 'rare'],
  ['common', 'common', 'common', 'common', 'rare'],
];

/** The opening as Pack Results and the ceremony read it: cycling through the Box's own cards of each rarity. */
export function revealFixturePulls(kind: RevealFixture): PrototypeBoxPull[] {
  const ids = prototypeBoxCardIds();
  const byRarity = (r: Rarity) => ids.filter((id) => getCard(id).rarity === r);
  const used: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const rarities = kind === 'one' ? ONE : TEN.flat();
  return rarities.map((rarity, i) => {
    const pool = byRarity(rarity);
    const cardId = pool[used[rarity]++ % pool.length];
    const isNew = i % 3 === 0;
    return { cardId, rarity, previousCopies: isNew ? 0 : 1, ownedCopies: isNew ? 1 : 2, isNew };
  });
}
