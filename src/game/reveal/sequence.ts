import type { Rarity } from '../types';
import type { RevealSoundEvent } from './sound';

// The pack-opening ceremony as DATA: a flat, ordered timeline of steps built once from cards that are already granted
// and saved. One controller (components/reveal/useRevealSequence.ts) walks it with a single timer; this file is pure,
// so pacing, the presentation order, tap/skip targets and the sound schedule are unit-tested. Nothing here decides a
// card - it only reads the rarities of results that already exist, and it only ever reorders their PRESENTATION.
//
//   a pull is one card from an archetype Box; a 10-pull is ten cards. Either way:
//     charging (the Moonwell film) -> telegraph (best rarity) -> opening (the seal breaks)
//     -> the cards in rising rarity: Commons and Rares turn over in the grid, each Epic or Legendary takes the stage
//        (a shorter spotlight in a 10-pull), and the rarest card lands last with the full hero reveal
//     -> result (then Pull Results)

export type SeqPhase = 'charging' | 'telegraph' | 'opening' | 'emerge' | 'reveal' | 'slot' | 'result';

export interface SeqStep {
  phase: SeqPhase;
  ms: number;
  /** Rarity this step telegraphs or reveals (the light and the sky follow it). */
  tier: Rarity;
  /** The grid tile (a card) this step concerns. Null for the opening beats and the result. */
  slot: number | null;
  /** The card on the stage (an index into the opening's cards) for the stage sub-steps; null otherwise. */
  card: number | null;
  /** True for a stage sub-step (a card taking the centre) as opposed to a quick grid beat. */
  stage: boolean;
  /** The opening's rarest card: its stage is the climax and holds longest. */
  headline: boolean;
  sounds: RevealSoundEvent[];
}

type StageBeats = { telegraph: number; open: number; emerge: number; reveal: number };

/** The shared opening (the Moonwell film plays over `charge`; its light telegraphs the best rarity in the opening). */
export const OPENING_BEATS: Record<Rarity, { charge: number; telegraph: number; open: number }> = {
  common: { charge: 700, telegraph: 900, open: 550 },
  rare: { charge: 850, telegraph: 1200, open: 700 },
  epic: { charge: 1100, telegraph: 1600, open: 900 },
  legendary: { charge: 1500, telegraph: 2000, open: 1100 },
};

/** How long a Common or Rare card takes to turn over in the grid (a Rare's beat is a little longer and brighter). A
 *  10-pull turns its cards a little faster so ten cards stay a short ceremony. */
export const CARD_BEAT_MS: Record<'one' | 'ten', Record<'common' | 'rare', number>> = { one: { common: 420, rare: 700 }, ten: { common: 300, rare: 480 } };

/** A card worth a moment that is not the headline: a short spotlight (a single pull, or a 10-pull). */
export const SPOTLIGHT_BEATS: Record<'one' | 'ten', Record<'epic' | 'legendary', StageBeats>> = {
  one: { epic: { telegraph: 450, open: 0, emerge: 0, reveal: 1300 }, legendary: { telegraph: 700, open: 450, emerge: 0, reveal: 1500 } },
  ten: { epic: { telegraph: 200, open: 0, emerge: 0, reveal: 750 }, legendary: { telegraph: 550, open: 350, emerge: 0, reveal: 1300 } },
};

/** The headline card's hero reveal: the climax, with enough hold to appreciate it (a tap moves on sooner). */
export const HEADLINE_BEATS: Record<'epic' | 'legendary', StageBeats> = {
  epic: { telegraph: 900, open: 600, emerge: 600, reveal: 2200 },
  legendary: { telegraph: 1500, open: 800, emerge: 800, reveal: 2800 },
};

const REDUCED_SCALE = 0.4;
const REDUCED_MIN = 90;
const scaled = (ms: number, reduced: boolean): number => (ms <= 0 ? 0 : reduced ? Math.max(REDUCED_MIN, Math.round(ms * REDUCED_SCALE)) : ms);

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const RARITY_SOUND: Partial<Record<Rarity, RevealSoundEvent>> = { rare: 'rarity_rare', epic: 'rarity_epic', legendary: 'rarity_legendary' };
const isHigh = (r: Rarity): r is 'epic' | 'legendary' => r === 'epic' || r === 'legendary';

export function bestRarity(rarities: readonly Rarity[]): Rarity {
  return rarities.reduce<Rarity>((b, r) => (RANK[r] > RANK[b] ? r : b), 'common');
}

/** The cards in rising rarity, ties in the order they were drawn: the presentation order of an opening. */
export function risingOrder(rarities: readonly Rarity[], indices: readonly number[] = rarities.map((_, i) => i)): number[] {
  return [...indices].sort((a, b) => RANK[rarities[a]] - RANK[rarities[b]] || a - b);
}

/** How the opening is laid out on screen. Only the PRESENTATION order; the cards and who owns them never change. */
export interface PackPlan {
  /** 'one' for a single pull (one card), 'ten' for a 10-pull. */
  mode: 'one' | 'ten';
  /** Grid tiles (one card each, as an index into the opening's cards) in the order they turn over: rising rarity. */
  tiles: number[];
  /** The rarest card (the first drawn among equals) when it is Epic or Legendary: the climax. Null otherwise. */
  headline: number | null;
}

export function planPackReveal(rarities: readonly Rarity[]): PackPlan {
  const best = bestRarity(rarities);
  const first = rarities.findIndex((r) => r === best);
  const headline = isHigh(best) && first >= 0 ? first : null;
  const order = risingOrder(rarities);
  // The headline lands last even when another card of the same rarity was drawn after it.
  const tiles = headline === null ? order : [...order.filter((i) => i !== headline), headline];
  return { mode: rarities.length > 1 ? 'ten' : 'one', tiles, headline };
}

function step(phase: SeqPhase, ms: number, tier: Rarity, opts: { slot?: number | null; card?: number | null; stage?: boolean; headline?: boolean; sounds?: RevealSoundEvent[]; reduced: boolean }): SeqStep {
  return { phase, ms: scaled(ms, opts.reduced), tier, slot: opts.slot ?? null, card: opts.card ?? null, stage: opts.stage ?? false, headline: opts.headline ?? false, sounds: opts.sounds ?? [] };
}

/** One card taking the stage: telegraph -> [opening] -> [emerge] -> reveal. */
function stageBeats(rarity: 'epic' | 'legendary', beats: StageBeats, slot: number, card: number, headline: boolean, reduced: boolean): SeqStep[] {
  const o = { slot, card, stage: true, headline, reduced };
  const out = [step('telegraph', beats.telegraph, rarity, { ...o, sounds: [RARITY_SOUND[rarity]!] })];
  if (beats.open > 0) out.push(step('opening', beats.open, rarity, { ...o, sounds: ['seal_break'] }));
  if (beats.emerge > 0) out.push(step('emerge', beats.emerge, rarity, o));
  out.push(step('reveal', beats.reveal, rarity, { ...o, sounds: headline ? ['card_reveal', 'headline_reveal'] : ['card_reveal'] }));
  return out;
}

/**
 * The whole ceremony for one opening (a pull or a 10-pull), from the rarities of its cards in the order they were
 * drawn. It adapts to what is actually inside: a Common takes a few seconds; a 10-pull with an Epic and a Legendary
 * builds to the Legendary.
 */
export function buildPackTimeline(rarities: readonly Rarity[], reduced = false): SeqStep[] {
  if (rarities.length === 0) return [step('result', 0, 'common', { reduced })];
  const plan = planPackReveal(rarities);
  const best = bestRarity(rarities);
  const open = OPENING_BEATS[best];
  const steps: SeqStep[] = [
    step('charging', open.charge, best, { reduced, sounds: ['reveal_start'] }),
    step('telegraph', open.telegraph, best, { reduced, sounds: RARITY_SOUND[best] ? [RARITY_SOUND[best]!] : [] }),
    step('opening', open.open, best, { reduced, sounds: ['seal_break'] }),
  ];
  plan.tiles.forEach((card, slot) => {
    const r = rarities[card];
    if (isHigh(r)) steps.push(...(card === plan.headline ? stageBeats(r, HEADLINE_BEATS[r], slot, card, true, reduced) : stageBeats(r, SPOTLIGHT_BEATS[plan.mode][r], slot, card, false, reduced)));
    else steps.push(step('slot', CARD_BEAT_MS[plan.mode][r], r, { slot, reduced, sounds: r === 'rare' ? ['rarity_rare', 'card_reveal'] : ['card_reveal'] }));
  });
  steps.push(step('result', 0, best, { reduced }));
  return steps;
}

export function totalMs(timeline: readonly SeqStep[]): number {
  return timeline.reduce((n, s) => n + s.ms, 0);
}

/** What the presentation shows at a given step. */
export interface SeqView {
  phase: SeqPhase;
  tier: Rarity;
  /** The card on the stage (an index into the opening's cards), or null when no card is centred. */
  stageCard: number | null;
  /** How many grid tiles are face-up. */
  revealed: number;
  /** The step is the headline card's stage. */
  headline: boolean;
  isResult: boolean;
  /** Duration of the current step: the presentation scales its CSS animation to it. */
  ms: number;
}

export function viewAt(timeline: readonly SeqStep[], index: number): SeqView {
  const i = Math.max(0, Math.min(index, timeline.length - 1));
  const s = timeline[i];
  const tiles = new Set(timeline.filter((t) => t.slot !== null).map((t) => t.slot)).size;
  let revealed = 0;
  if (s.phase === 'result') revealed = tiles;
  // A tile turns face-up with its own grid beat; a tile whose card is on the stage stays sealed until the next step.
  else if (s.slot !== null) revealed = s.stage ? s.slot : s.slot + 1;
  return { phase: s.phase, tier: s.tier, stageCard: s.stage ? s.card : null, revealed, headline: s.headline, isResult: s.phase === 'result', ms: s.ms };
}

/**
 * Where a tap moves the ceremony: to the end of the current beat. During the film it starts the opening; during a
 * card's stage build-up it jumps to that card's reveal; anything else moves to the next step. Only ever forward, and
 * only the PRESENTATION: the cards were granted and saved before the ceremony began. (Skip goes straight to the result.)
 */
export function advanceTarget(timeline: readonly SeqStep[], index: number): number {
  const last = timeline.length - 1;
  if (index >= last) return last;
  const cur = timeline[index];
  if (cur.stage && cur.phase !== 'reveal') {
    const reveal = timeline.findIndex((s, i) => i > index && s.stage && s.card === cur.card && s.phase === 'reveal');
    if (reveal !== -1) return reveal;
  }
  return index + 1;
}
