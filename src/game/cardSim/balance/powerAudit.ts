import type { AbilityDefinition, CardDefinition } from '../../types/index.js';
import { getCard } from '../cardSource.js';
import { type PolicyId, type Rules } from '../engine.js';
import { type SimDeck } from '../decks.js';
import { type SeriesResult, runSeries, summarize } from '../experiments.js';
import { type StatModel } from '../statModels.js';

// Power-budget audit for the aggressive / high-rarity pass (Thread C of the effect and archetype balance
// pass, 2026-09-29). Measures what each card is worth to the decks that play it, by swapping it for
// study-only variants of itself:
//   - vanilla: same Power and printed stats, no abilities -> the effect's value
//   - minus one Power, same abilities -> what one Power band is worth on this card
// and runs decks against a fixed field with paired seeds, so variants of one deck see the same draws.
// Study-only cards use the id `<live id>~<variant>`; aliasModel() gives them the live card's printed stats.

/** A copy of `model` that prices a study variant `<id>~<tag>` with the live id's per-card ATK offset. */
export function aliasModel(model: StatModel): StatModel {
  return { ...model, stats: (card) => model.stats({ ...card, id: card.id.split('~')[0] }) };
}

export function variantCard(cardId: string, tag: string, patch: Partial<CardDefinition>): CardDefinition {
  return { ...getCard(cardId), ...patch, id: `${cardId}~${tag}` };
}

export function vanillaVariant(cardId: string): CardDefinition {
  return variantCard(cardId, 'vanilla', { abilities: [] });
}

export function powerVariant(cardId: string, delta: number): CardDefinition {
  const power = (getCard(cardId).power ?? 1) + delta;
  return variantCard(cardId, `p${power}`, { power });
}

/** The live card with some abilities replaced (by index) and/or new ones appended, same id. */
export function reworkCard(cardId: string, patch: Partial<CardDefinition> & { replace?: Record<number, AbilityDefinition | null>; append?: AbilityDefinition[] }): CardDefinition {
  const live = getCard(cardId);
  const { replace, append, ...rest } = patch;
  const abilities = (rest.abilities ?? live.abilities).flatMap((ability, i) => {
    if (!replace || !(i in replace)) return [ability];
    const next = replace[i];
    return next ? [next] : [];
  });
  return { ...live, ...rest, id: cardId, abilities: [...abilities, ...(append ?? [])] };
}

export function swapInDeck(deck: SimDeck, from: string, to: string, id = `${deck.id}:${to}`): SimDeck {
  return { ...deck, id, cards: deck.cards.map((c) => (c === from ? to : c)) };
}

export interface FieldResult {
  deck: string;
  share: number;
  perOpponent: Record<string, number>;
  pooled: SeriesResult[];
}

/**
 * `deck` against every field deck (natural pilots unless overridden). Seeds depend only on the
 * opponent's position in `field`, so two variants of one deck face identical seeds (paired comparison).
 */
export function fieldShare(model: StatModel, rules: Rules, deck: SimDeck, field: SimDeck[], games: number, seed: number, pilot: PolicyId = deck.pilot): FieldResult {
  const perOpponent: Record<string, number> = {};
  const pooled: SeriesResult[] = [];
  let total = 0;
  let n = 0;
  field.forEach((opp, j) => {
    if (opp.id === deck.id) return;
    const res = runSeries({ model, rules, a: { deck: deck.cards, policy: pilot }, b: { deck: opp.cards, policy: opp.pilot }, games, seed: seed + j * 10_007 });
    const share = summarize(res).winShareA;
    perOpponent[opp.id] = share;
    pooled.push(res);
    total += share;
    n++;
  });
  return { deck: deck.id, share: Math.round((total / Math.max(1, n)) * 1000) / 1000, perOpponent, pooled };
}

export interface CardAuditRow {
  cardId: string;
  rarity: string;
  power: number;
  deck: string;
  copies: number;
  deckShare: number;
  /** Deck's field share with this card's abilities removed (same Power and stats). */
  vanillaShare: number;
  /** Deck's field share with this card one Power band lower (same abilities). */
  minusOneShare: number;
  effectValue: number;
  powerStepValue: number;
}
