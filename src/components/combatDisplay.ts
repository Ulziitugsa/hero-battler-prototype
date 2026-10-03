import { createContext, useContext } from 'react';
import type { HeroInstance, Side } from '../game/types';
import type { CardRules } from '../game/cards/cardPresentation';

/**
 * How battle surfaces (hand cards, board cards, Spell zones, the focus panel, Card Inspect, the help sheet and the
 * match summary) read a card in this battle. GamePage provides it for every battle, whatever resolver plays it, so the
 * same card faces show in every mode; outside battle it is null.
 *
 * `rules` says which rules the cards describe:
 *  - 'card': card combat. A Unit's live `power` IS its ATK, there is no Unit HP, and HP Contribution only matters for
 *    Starting HP, so battle faces show ATK and leave HP Contribution to the focus panel and Card Inspect.
 *  - 'legacy': a mode still on the legacy resolver. Faces show the ATK a Unit's live Power reads as (cardPresentation.ts
 *    legacyAtk), the legacy rules and, for a historical legacy match that recorded them, the copy's legacy Ascension
 *    effects, and no HP Contribution (Starting HP is fixed). Card combat has no Card Mastery: every copy is printed.
 */
export interface BattleCardDisplay {
  rules: CardRules;
  /** A Unit's current ATK as its face shows it. */
  unitAtk: (unit: HeroInstance) => number;
  /** The ATK a Unit in the player's hand enters play with (legacy: its Legacy Level's bonus included). */
  handAtk: (cardId: string) => number | undefined;
  /** A Unit's this-round ATK change as its face shows it. */
  tempAtk: (unit: HeroInstance) => number;
  /** Legacy rules only: the legacy Ascension rank whose added effects a historical legacy match plays (0 in card combat). */
  masteryRank: (cardId: string, owner: Side, unit?: HeroInstance) => number;
  /** Card combat: the HP Contribution this copy added to its owner's Starting HP (its printed value). */
  hpContribution?: (cardId: string, owner: Side) => number;
  /** A board Unit's conditional always-on effects, on or off on the board as shown (keyed by ability index). */
  passiveStates: (instanceId: string) => ReadonlyMap<number, boolean> | undefined;
}

export const CombatDisplayContext = createContext<BattleCardDisplay | null>(null);

export function useBattleCardDisplay(): BattleCardDisplay | null {
  return useContext(CombatDisplayContext);
}
