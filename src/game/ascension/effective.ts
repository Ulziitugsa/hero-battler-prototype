import type { AbilityDefinition, CardDefinition } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { getCardAscension } from './definitions.js';

// Base card + resolved Ascension modifiers = the card's effective behaviour. The base definition is
// never mutated; results are memoised per (card, rank). Rank 0 (or an unsupported card) returns the base
// abilities untouched - which is also how a future mode could "normalise" Ascension away: just resolve
// everything at rank 0.

const memo = new Map<string, AbilityDefinition[]>();

/** Base abilities with ranks 1..rank applied in order. Rank is clamped to what the card defines. */
export function effectiveAbilities(cardId: string, rank: number): AbilityDefinition[] {
  const base = getCard(cardId).abilities;
  const def = getCardAscension(cardId);
  const r = def ? Math.max(0, Math.min(def.ranks.length, Math.floor(rank))) : 0;
  if (r === 0 || !def) return base;
  const key = `${cardId}:${r}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const abilities = [...base];
  for (const rankDef of def.ranks.slice(0, r)) {
    for (const mod of rankDef.modifiers) {
      if (mod.type === 'ADD_ABILITY') abilities.push(mod.ability);
      else if (mod.index >= 0 && mod.index < base.length) abilities[mod.index] = mod.ability;
    }
  }
  memo.set(key, abilities);
  return abilities;
}

/** The card as it behaves at this Ascension rank (a shallow copy; the base is untouched). */
export function getEffectiveCardDefinition(cardId: string, rank: number): CardDefinition {
  const base = getCard(cardId);
  return rank > 0 ? { ...base, abilities: effectiveAbilities(cardId, rank) } : base;
}

/** Abilities that exist at `rank` but not in the base card - what the UI highlights as "from Ascension". */
export function ascensionAddedAbilities(cardId: string, rank: number): Set<AbilityDefinition> {
  const base = new Set(getCard(cardId).abilities);
  return new Set(effectiveAbilities(cardId, rank).filter((a) => !base.has(a)));
}
