import type { Side } from '../types';
import type { CampaignNodeDef } from './types';
import { campaignEnemyDeck } from './encounterDecks';
import { STARTER_DECKS } from '../cards/starterDecks';
import { deckStartingHp } from '../cardCombat/stats';

// How a Campaign node's battle is set up on the card resolver: the encounter's own deck (never the player's progression),
// its boss HP pool if any, and a challenge rule's reduced Starting HP for the player. Both decks play printed card
// values: no Mastery, Ascension or Level of either side is read. The stage sheet's Starting HP
// preview and the battle itself both read this, so they cannot disagree.

export interface CampaignBattlePlan {
  enemyDeck: string[];
  /** Fixed Starting HP per side in place of a deck's total (createCardMatch's startingHpOverride). Empty for a normal node. */
  startingHpOverride: Partial<Record<Side, number>>;
}

export function campaignBattlePlan(node: CampaignNodeDef, playerDeck: readonly string[]): CampaignBattlePlan | null {
  const encounter = node.encounter;
  if (!encounter) return null;
  const enemyDeck = campaignEnemyDeck(node.id) ?? STARTER_DECKS[encounter.enemyDeckFaction];
  const startingHpOverride: Partial<Record<Side, number>> = {};
  if (encounter.enemyStartingHp) startingHpOverride.enemy = encounter.enemyStartingHp;
  if (encounter.playerStartingHpPct) {
    const own = deckStartingHp(playerDeck).total;
    startingHpOverride.player = Math.max(1, Math.round((own * encounter.playerStartingHpPct) / 100));
  }
  return { enemyDeck, startingHpOverride };
}

/** Both sides' Starting HP for this node's battle, as the battle will start them. Null for a node with no battle. */
export function campaignBattleHp(node: CampaignNodeDef, playerDeck: readonly string[]): { player: number; enemy: number } | null {
  const plan = campaignBattlePlan(node, playerDeck);
  if (!plan) return null;
  return {
    player: plan.startingHpOverride.player ?? deckStartingHp(playerDeck).total,
    enemy: plan.startingHpOverride.enemy ?? deckStartingHp(plan.enemyDeck).total,
  };
}
