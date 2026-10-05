import { track } from '../../analytics/track';
import { canAfford, canAffordTickets, spendGems, spendTickets } from '../economy/economy';
import { BOX_PULL_GEMS, PULLS_PER_TICKET } from '../economy/config';
import type { PlayerEconomy } from '../economy/types';
import { getArchetypeBox, type ArchetypeBoxDef, type ArchetypeBoxId } from './archetypeBoxes';
import { boxCardsRemaining, canPull, getBoxesState, pullFromBox, setActiveBoxId, totalBoxPulls, type PullCount, type PullResult } from './boxPool';

// What a pull costs and how it is paid: the product layer over the nine archetype Boxes (boxPool.ts holds the pools).
// 1 pull = 1 card, a 10-pull = 10 cards, no bulk discount and no bonus card. A Pack Ticket pays for one pull. Both
// prices are placeholders in economy/config.ts (BOX_PULL_GEMS, PULLS_PER_TICKET) until the economy follow-up.

export type { ArchetypeBoxDef, ArchetypeBoxId, PullCount };

/** Gems a pull of `count` costs (no bulk discount). */
export function boxPullPrice(count: PullCount): number {
  return BOX_PULL_GEMS * count;
}

/** What pays for pulls: their Gem price, or Pack Tickets. Either way the cards come from the same finite Box. */
export type PullPayment = 'gems' | 'tickets';

/** Pack Tickets a pull of `count` costs. */
export function boxPullTickets(count: PullCount): number {
  return Math.ceil(count / PULLS_PER_TICKET);
}

export type BuyPullsResult = { ok: true; gems: number; tickets: number; opening: PullResult } | { ok: false; reason: 'sold-out' | 'not-enough-gems' | 'not-enough-tickets' };

/**
 * Pays (Gems or Pack Tickets) and pulls from one archetype Box: the game's one way to open cards. Nothing is spent when
 * the Box cannot supply the pull or the player cannot pay. The cards are granted and saved before this returns; the
 * reveal and Pull Results only show them. Pulling also makes this Box the active one (Home's shortcut).
 */
export function buyBoxPulls(boxId: ArchetypeBoxId, count: PullCount, payment: PullPayment = 'gems'): BuyPullsResult {
  if (!canPull(boxId, count)) return { ok: false, reason: 'sold-out' };
  const gems = payment === 'gems' ? boxPullPrice(count) : 0;
  const tickets = payment === 'tickets' ? boxPullTickets(count) : 0;
  if (payment === 'gems' && (!canAfford(gems) || !spendGems(gems))) return { ok: false, reason: 'not-enough-gems' };
  if (payment === 'tickets' && (!canAffordTickets(tickets) || !spendTickets(tickets))) return { ok: false, reason: 'not-enough-tickets' };
  const opening = pullFromBox(boxId, count);
  setActiveBoxId(boxId);
  const cards = opening.pulls;
  track('box_pulled', { boxId, pullCount: count, cardCount: cards.length, legendaryCount: cards.filter((c) => c.rarity === 'legendary').length, gems, tickets, cardsRemaining: boxCardsRemaining(boxId) });
  if (tickets > 0) track('pack_ticket_used', { boxId, count: tickets });
  for (const card of cards) {
    if (card.rarity === 'legendary') track('legendary_pulled', { boxId, cardId: card.cardId, wasNew: card.isNew });
    if (!card.isNew) track('duplicate_acquired', { cardId: card.cardId, rarity: card.rarity, source: 'box', copiesOwned: card.ownedCopies });
  }
  if (payment === 'gems') track('shop_purchase_simulated', { productId: `${boxId}:pulls-${count}`, productType: 'box', simulated: false, gems });
  return { ok: true, gems, tickets, opening };
}

/** Whether the player can pay for one pull right now (Home's "pull ready" hint). */
export function canAffordAPull(economy: Pick<PlayerEconomy, 'gems' | 'tickets'>): boolean {
  return economy.tickets >= boxPullTickets(1) || economy.gems >= boxPullPrice(1);
}

/**
 * Whether the player has ever opened cards (what unlocks the Gem bundles and the first bundle in the Shop): a pull from
 * any archetype Box, Moonfall packs opened before the launch set, or a saved Summon history from before packs. Nothing
 * a save had unlocked locks again.
 */
export function hasOpenedPacks(economy: Pick<PlayerEconomy, 'summon'>): boolean {
  const state = getBoxesState();
  return totalBoxPulls(state) > 0 || (state.legacyMoonfallPacksOpened ?? 0) > 0 || economy.summon.history.length > 0;
}

export { getArchetypeBox };
