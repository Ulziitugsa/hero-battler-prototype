import { createContext, useContext } from 'react';

/**
 * How battle surfaces (hand cards, board chits, Card Inspect) should read card stats. Provided by GamePage for
 * a card-combat match only; everywhere else (legacy battles, Collection, Deck Builder) it is null and the
 * components behave exactly as before.
 *
 * In card combat a Unit's live `power` IS its ATK, there is no Unit HP, and HP Contribution only matters for
 * Starting HP, so battle surfaces show ATK as the headline stat and leave HP Contribution to Card Inspect.
 */
export interface CardCombatDisplay {
  /** HP Contribution this card copy added to its owner's Starting HP in this match (Card Mastery applied). */
  hpContribution: (cardId: string, owner: 'player' | 'enemy') => number;
  /** Card Mastery stage (1..5) this match uses for the card. */
  masteryStage: (cardId: string, owner: 'player' | 'enemy') => number;
}

export const CombatDisplayContext = createContext<CardCombatDisplay | null>(null);

export function useCardCombatDisplay(): CardCombatDisplay | null {
  return useContext(CombatDisplayContext);
}
