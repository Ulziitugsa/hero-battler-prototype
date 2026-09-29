import type { CardDefinition } from '../types/index.js';
import { getCard as getLiveCard } from '../cards/index.js';

// Card lookup for the simulator. By default it is the live card data. Balance studies swap in proposed card
// definitions (effect rewrites, re-banded Power, study-only reference cards) without touching src/game/cards:
// the engine, AI and experiments read every card through `getCard` here. Overrides are module state and the
// simulator is single-threaded, so every helper restores what was installed before it.
// (Merged from Threads A, C and D of the balance pass, which each added the same hook under another name.)

type CardSet = ReadonlyMap<string, CardDefinition> | readonly CardDefinition[] | null;

let overrides = new Map<string, CardDefinition>();

const toMap = (cards: CardSet): Map<string, CardDefinition> =>
  cards === null ? new Map() : cards instanceof Map ? new Map(cards) : new Map((cards as readonly CardDefinition[]).map((c) => [c.id, c]));

export function getCard(cardId: string): CardDefinition {
  return overrides.get(cardId) ?? getLiveCard(cardId);
}

/** Replaces every override (null clears them). */
export function setCardOverrides(cards: CardSet): void {
  overrides = toMap(cards);
}

/** Runs `fn` with exactly `cards` installed as overrides, then restores the previous set. */
export function withCardOverrides<T>(cards: CardSet, fn: () => T): T {
  const previous = overrides;
  overrides = toMap(cards);
  try {
    return fn();
  } finally {
    overrides = previous;
  }
}

/** Adds `cards` on top of the current overrides and returns a function that restores what was there before. */
export function registerSimCards(cards: readonly CardDefinition[]): () => void {
  const previous = overrides;
  overrides = new Map([...previous, ...cards.map((c) => [c.id, c] as const)]);
  return () => {
    overrides = previous;
  };
}

/** Runs `fn` with `cards` added on top of the current overrides, then restores them. */
export function withSimCards<T>(cards: readonly CardDefinition[], fn: () => T): T {
  const restore = registerSimCards(cards);
  try {
    return fn();
  } finally {
    restore();
  }
}
