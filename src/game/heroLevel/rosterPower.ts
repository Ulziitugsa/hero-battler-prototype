import { getCard } from '../cards';
import { getAscensionRank, type AscensionState } from '../ascension/store';
import { ROSTER_POWER_WEIGHTS } from './config';
import { getHeroLevel } from './store';
import type { HeroLevelState } from './types';

// Roster Power: a large, purely virtual UI/gating number - see config.ts's header note. Never imported by
// anything under game/engine. Used by Campaign (Phase 3) for the "recommended power" comparison and by
// any future collection/hero-detail screen that wants a single "how strong is this hero" readout.

/** One hero's Roster Power. `power` is the card's base Power (Heroes only - callers should not call this for Spells). */
export function rosterPowerForHero(power: number, level: number, ascensionRank: number): number {
  return power * ROSTER_POWER_WEIGHTS.basePower + level * ROSTER_POWER_WEIGHTS.level + ascensionRank * ROSTER_POWER_WEIGHTS.ascensionRank;
}

/** A card id's current Roster Power, reading its live Level/Ascension state. 0 for a Spell (no Power to weigh). */
export function rosterPowerForCard(cardId: string, levelState: HeroLevelState, ascensionState: AscensionState): number {
  const card = getCard(cardId);
  if (card.type !== 'hero' || card.power === undefined) return 0;
  return rosterPowerForHero(card.power, getHeroLevel(cardId, levelState), getAscensionRank(cardId, ascensionState));
}

/** A deck/roster's total Roster Power: every Hero card's Roster Power, plus one flat account-level term
 * (the "you as a commander" contribution) - not one per hero, so a 15-card deck isn't rewarded for
 * fielding more bodies, only stronger ones. Spells contribute 0 (they carry no Power/Level/Ascension). */
export function rosterPowerForDeck(cardIds: readonly string[], accountLevel: number, levelState: HeroLevelState, ascensionState: AscensionState): number {
  const heroTotal = cardIds.reduce((sum, id) => sum + rosterPowerForCard(id, levelState, ascensionState), 0);
  return heroTotal + accountLevel * ROSTER_POWER_WEIGHTS.accountLevel;
}
