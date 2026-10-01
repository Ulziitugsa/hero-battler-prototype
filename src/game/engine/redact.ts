import type { GameEvent, GameState, HandCard, PlayerState, Side } from '../types/index.js';
import { opposite } from './board.js';

/** Placeholder cardId for a hidden hand/deck entry - never a real card id, so nothing can accidentally look it up. */
const HIDDEN_CARD_ID = '__hidden__';

function redactedHand(hand: HandCard[]): HandCard[] {
  return hand.map((h) => ({ handId: h.handId, cardId: HIDDEN_CARD_ID }));
}

function redactedDeck(deck: string[]): string[] {
  return deck.map(() => HIDDEN_CARD_ID);
}

function redactedPlayerState(p: PlayerState): PlayerState {
  return { ...p, hand: redactedHand(p.hand), deck: redactedDeck(p.deck) };
}

/**
 * Hides `viewerCanonicalSide`'s opponent's hand contents and deck order/contents, preserving array
 * lengths (the UI only ever shows an opponent's hand/deck COUNT - see OpponentHand - never its contents,
 * so nothing else needs to change). Everything else (board, graveyard, HP) is public information once a
 * card has actually been played, so it passes through unchanged.
 */
export function redactStateForViewer(state: GameState, viewerCanonicalSide: Side): GameState {
  const opponentSide = opposite(viewerCanonicalSide);
  // Card combat keeps a Mastery table per side keyed by every card id in the deck, which would list the opponent's
  // deck. It only matters for that side's HP Contribution readout, and a missing entry reads as Mastery I (what
  // Friendly Battle plays), so the opponent's table is dropped.
  const cardCombat = state.cardCombat ? { ...state.cardCombat, masteryStage: { ...state.cardCombat.masteryStage, [opponentSide]: {} } } : undefined;
  const base = cardCombat ? { ...state, cardCombat } : state;
  if (opponentSide === 'player') return { ...base, player: redactedPlayerState(state.player) };
  return { ...base, enemy: redactedPlayerState(state.enemy) };
}

/**
 * Strips the one genuine hidden-information leak in the event log: DRAW/CARD_DRAWN name the exact card
 * that just entered the OPPONENT's hand. Every other event only ever describes a card that was actually
 * played (already public) or a side-tagged state change with no card identity attached, so it passes
 * through unchanged.
 */
export function redactEventsForViewer(events: GameEvent[], viewerCanonicalSide: Side): GameEvent[] {
  const opponentSide = opposite(viewerCanonicalSide);
  return events.map((event) => {
    if (event.type === 'DRAW' && event.side === opponentSide) {
      return { type: 'DRAW', side: event.side, fizzled: event.fizzled };
    }
    if (event.type === 'CARD_DRAWN' && event.side === opponentSide) {
      return { ...event, cardId: HIDDEN_CARD_ID, cardName: '???' };
    }
    return event;
  });
}
