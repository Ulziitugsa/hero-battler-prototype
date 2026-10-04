import { track } from '../../analytics/track';
import { canAfford, canAffordTickets, spendGems, spendTickets } from '../economy/economy';
import { getCard } from '../cards/index.js';
import { getPrototypeBoxState, openPrototypeBox, prototypeBoxPacksRemaining, PROTOTYPE_BOX, type OpenBoxResult } from './prototypeBox';
import type { PlayerEconomy } from '../economy/types';

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

/** What pays for packs: their Gem price, or one Pack Ticket per pack. Either way the packs come from the same finite Box. */
export type PackPayment = 'gems' | 'tickets';

/** Pack Tickets a number of packs costs: always one per pack, with no bulk discount. */
export function boxPackTickets(count: 1 | 10): number {
  return count;
}

export type BuyBoxPacksResult =
  | { ok: true; gems: number; tickets: number; opening: OpenBoxResult }
  | { ok: false; reason: 'sold-out' | 'not-enough-gems' | 'not-enough-tickets' };

/** Pays (Gems or Pack Tickets) and opens packs from the finite Box: the game's one way to open packs. Nothing is spent
 * when the Box cannot supply the packs or the player cannot pay. The cards are granted and saved before this returns;
 * the reveal ceremony and Pack Results only show them. */
export function buyBoxPacks(count: 1 | 10, box: BoxProductDef = MOONFALL_BOX, payment: PackPayment = 'gems'): BuyBoxPacksResult {
  if (prototypeBoxPacksRemaining() < count) return { ok: false, reason: 'sold-out' };
  const gems = payment === 'gems' ? boxPackPrice(box, count) : 0;
  const tickets = payment === 'tickets' ? boxPackTickets(count) : 0;
  if (payment === 'gems' && (!canAfford(gems) || !spendGems(gems))) return { ok: false, reason: 'not-enough-gems' };
  if (payment === 'tickets' && (!canAffordTickets(tickets) || !spendTickets(tickets))) return { ok: false, reason: 'not-enough-tickets' };
  const opening = openPrototypeBox(count);
  const cards = opening.packs.flat();
  track('prototype_box_opened', { boxId: box.id, packCount: count, cardCount: cards.length, legendaryCount: cards.filter(card => card.rarity === 'legendary').length, gems, tickets, packsRemaining: prototypeBoxPacksRemaining(opening.state) });
  for (let pack = 0; pack < count; pack += 1) track('pack_opened', { boxId: box.id, payment });
  if (tickets > 0) track('pack_ticket_used', { boxId: box.id, count: tickets });
  for (const card of cards) {
    if (card.rarity === 'legendary') track('legendary_pulled', { boxId: box.id, cardId: card.cardId, wasNew: card.isNew });
    if (!card.isNew) track('duplicate_acquired', { cardId: card.cardId, rarity: card.rarity, source: 'box', copiesOwned: card.ownedCopies });
  }
  if (payment === 'gems') track('shop_purchase_simulated', { productId: `${box.id}:packs-${count}`, productType: 'box', simulated: false, gems });
  return { ok: true, gems, tickets, opening };
}

/** Whether the player has ever opened a pack (what unlocks the Gem bundles and the first bundle in the Shop). A save that
 * used the retired Moonwell Summon counts too, so nothing it had unlocked locks again. */
export function hasOpenedPacks(economy: Pick<PlayerEconomy, 'summon'>): boolean {
  const box = getPrototypeBoxState();
  return box.openedPacks > 0 || (box.resetCount ?? 0) > 0 || economy.summon.history.length > 0;
}
