import { track } from '../../analytics/track';
import { canAfford, spendGems } from '../economy/economy';
import { getCard } from '../cards/index.js';
import { openPrototypeBox, prototypeBoxPacksRemaining, PROTOTYPE_BOX, type OpenBoxResult } from './prototypeBox';

// Shop-facing description of a finite Box: what it is called, what it is about, which cards headline
// it and what a pack costs. The finite pool itself (composition, draws, reset) lives in prototypeBox.ts;
// this file only adds the product layer, so other surfaces (an event page, Home) can reference a Box by
// its stable id without importing Shop UI.

export type BoxSetKind = 'main' | 'mini' | 'seasonal';

export interface BoxProductDef {
  /** Stable id - the same id the finite pool is saved under. */
  id: string;
  name: string;
  kind: BoxSetKind;
  theme: string;
  description: string;
  /** Up to three cards shown on the Box banner, headline card first. */
  bannerCardIds: string[];
  /** Cards presented as the chase set: every Legendary in the pool, with live remaining counts. */
  chaseCardIds: string[];
  /** In-game Gem price. No bulk discount: Open 10 costs exactly ten single packs. PROTOTYPE tuning. */
  gemsPerPack: number;
}

export const MOONFALL_BOX: BoxProductDef = {
  id: PROTOTYPE_BOX.id,
  name: PROTOTYPE_BOX.name,
  kind: 'main',
  theme: 'All three factions under the falling moon',
  description: 'The first Moonwater set. Kingdom, Undead and Infernal cards in one sealed Box of 100 packs. Every card you open leaves the Box, so the rarest cards get closer with each pack.',
  bannerCardIds: ['und-vharos', 'kng-paladin', 'inf-infernal-lord'],
  chaseCardIds: ['kng-paladin', 'kng-archmage-vael', 'und-vharos', 'inf-infernal-lord'].filter(id => getCard(id).rarity === 'legendary'),
  gemsPerPack: 150,
};

export const BOX_PRODUCTS: readonly BoxProductDef[] = [MOONFALL_BOX];

export function getBoxProduct(id: string): BoxProductDef | undefined {
  return BOX_PRODUCTS.find(box => box.id === id);
}

export function boxPackPrice(box: BoxProductDef, count: 1 | 10): number {
  return box.gemsPerPack * count;
}

export type BuyBoxPacksResult =
  | { ok: true; gems: number; opening: OpenBoxResult }
  | { ok: false; reason: 'sold-out' | 'not-enough-gems' };

/** Spends Gems and opens packs from the finite Box. Nothing is spent when the Box cannot supply the packs. */
export function buyBoxPacks(count: 1 | 10, box: BoxProductDef = MOONFALL_BOX): BuyBoxPacksResult {
  if (prototypeBoxPacksRemaining() < count) return { ok: false, reason: 'sold-out' };
  const gems = boxPackPrice(box, count);
  if (!canAfford(gems) || !spendGems(gems)) return { ok: false, reason: 'not-enough-gems' };
  const opening = openPrototypeBox(count);
  const cards = opening.packs.flat();
  track('prototype_box_opened', { boxId: box.id, packCount: count, cardCount: cards.length, legendaryCount: cards.filter(card => card.rarity === 'legendary').length, gems, packsRemaining: prototypeBoxPacksRemaining(opening.state) });
  track('shop_purchase_simulated', { productId: `${box.id}:packs-${count}`, productType: 'box', simulated: false, gems });
  return { ok: true, gems, opening };
}
