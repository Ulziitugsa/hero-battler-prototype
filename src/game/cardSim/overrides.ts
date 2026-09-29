import type { CardDefinition } from '../types/index.js';
import { getCard } from '../cards/index.js';

// Sim-only card patches for balance passes. A patch replaces fields on the live card definition object for the
// duration of an experiment and `applyCardPatches` returns the function that restores the originals, so the
// same process can compare "as printed" and "as proposed" runs. Nothing in the game imports this file; it
// never changes saved data or the live card files. Proposals graduate into the card files only once approved.

export type CardPatch = Partial<Pick<CardDefinition, 'power' | 'abilities' | 'boardText'>>;
export type CardPatchSet = Record<string, CardPatch>;

export function applyCardPatches(...sets: CardPatchSet[]): () => void {
  const saved: { card: CardDefinition; fields: CardPatch }[] = [];
  for (const set of sets) {
    for (const [cardId, patch] of Object.entries(set)) {
      const card = getCard(cardId);
      const fields: CardPatch = {};
      for (const key of Object.keys(patch) as (keyof CardPatch)[]) (fields as Record<string, unknown>)[key] = card[key];
      saved.push({ card, fields });
      Object.assign(card, patch);
    }
  }
  return () => {
    for (let i = saved.length - 1; i >= 0; i--) Object.assign(saved[i].card, saved[i].fields);
  };
}

/** Runs `fn` with the patches applied and always restores the cards afterwards. */
export function withCardPatches<T>(sets: CardPatchSet[], fn: () => T): T {
  const restore = applyCardPatches(...sets);
  try {
    return fn();
  } finally {
    restore();
  }
}

/** Approved 2026-09-29: Power 7 Legendaries are re-banded to Power 6. */
export const APPROVED_REBAND: CardPatchSet = {
  'und-vharos': { power: 6 },
  'inf-infernal-lord': { power: 6 },
};
