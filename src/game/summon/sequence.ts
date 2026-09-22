import type { Rarity } from '../types';
import type { SummonSoundEvent } from './sound';

// The Summon reveal as DATA: a flat, ordered timeline of steps built once from the already-resolved pulls.
// One controller (pages/summon/useSummonSequence.ts) walks it with a single timer; this file is pure, so
// pacing, skip targets and the sound-event schedule are unit-tested. Nothing here decides a card - it
// only reads rarity + featured status of results that are already persisted.
//
//   single: charging -> telegraph -> opening -> emerge -> reveal -> result
//   ten:    charging -> telegraph(best rarity) -> opening -> [slot | stage] x10 -> result
//           (common/rare slots pop in fast; an Epic/Legendary slot takes the stage with its own telegraph/opening/reveal)

export type SeqPhase = 'charging' | 'telegraph' | 'opening' | 'emerge' | 'reveal' | 'slot' | 'result';

export interface SeqStep {
  phase: SeqPhase;
  ms: number;
  /** Rarity this step is telegraphing / revealing (the vessel's light follows it). */
  tier: Rarity;
  /** Which of the ten results this step concerns (ten only; null for the opening beats and single). */
  slot: number | null;
  /** True for the stage sub-steps (telegraph/opening/emerge/reveal of one slot) as opposed to a quick 'slot' pop. */
  stage: boolean;
  /** The pull is the banner's main featured card: gets an extra presentation beat. */
  featured: boolean;
  sounds: SummonSoundEvent[];
}

export interface SeqPull {
  rarity: Rarity;
  /** True when this is the banner's MAIN featured card. */
  mainFeatured: boolean;
}

type Beats = { charge: number; telegraph: number; open: number; emerge: number; reveal: number };

/** Single-summon pacing (ms). Common stays concise; Legendary has an eight-second cinematic build-up. */
export const SINGLE_BEATS: Record<Rarity, Beats> = {
  common: { charge: 700, telegraph: 1100, open: 650, emerge: 500, reveal: 350 },
  rare: { charge: 900, telegraph: 1600, open: 1000, emerge: 750, reveal: 550 },
  epic: { charge: 1300, telegraph: 2400, open: 1400, emerge: 1000, reveal: 700 },
  legendary: { charge: 1700, telegraph: 3000, open: 1800, emerge: 1200, reveal: 900 },
};

/** Extra hold on the final frame when the pull is the banner's main featured card. */
export const FEATURED_EXTRA_MS = 500;

/** 10x: the shared opening (its telegraph reflects the best rarity in the batch). */
export const TEN_OPENING: Record<Rarity, { charge: number; telegraph: number; open: number }> = {
  common: { charge: 700, telegraph: 1000, open: 600 },
  rare: { charge: 850, telegraph: 1400, open: 800 },
  epic: { charge: 1100, telegraph: 1900, open: 1100 },
  legendary: { charge: 1500, telegraph: 2600, open: 1500 },
};

/** 10x: how long each slot dwells. Epic/Legendary use the stage beats below instead. */
export const TEN_SLOT_MS: Record<'common' | 'rare', number> = { common: 110, rare: 190 };
export const TEN_STAGE: Record<'epic' | 'legendary', Beats> = {
  epic: { charge: 0, telegraph: 300, open: 250, emerge: 0, reveal: 450 },
  legendary: { charge: 0, telegraph: 800, open: 480, emerge: 500, reveal: 600 },
};

const REDUCED_SCALE = 0.4;
const REDUCED_MIN = 90;
const scaled = (ms: number, reduced: boolean): number => (ms <= 0 ? 0 : reduced ? Math.max(REDUCED_MIN, Math.round(ms * REDUCED_SCALE)) : ms);

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const RARITY_SOUND: Partial<Record<Rarity, SummonSoundEvent>> = { rare: 'rarity_rare', epic: 'rarity_epic', legendary: 'rarity_legendary' };

export function bestRarity(pulls: readonly SeqPull[]): Rarity {
  return pulls.reduce<Rarity>((b, p) => (RANK[p.rarity] > RANK[b] ? p.rarity : b), 'common');
}

function step(phase: SeqPhase, ms: number, tier: Rarity, opts: { slot?: number | null; stage?: boolean; featured?: boolean; sounds?: SummonSoundEvent[]; reduced: boolean }): SeqStep {
  return { phase, ms: scaled(ms, opts.reduced), tier, slot: opts.slot ?? null, stage: opts.stage ?? false, featured: opts.featured ?? false, sounds: opts.sounds ?? [] };
}

/** Steps for one card's telegraph -> opening -> [emerge] -> reveal, used by the single summon and by a 10x stage slot. */
function cardBeats(rarity: Rarity, beats: Beats, featured: boolean, slot: number | null, stage: boolean, reduced: boolean): SeqStep[] {
  const o = { slot, stage, reduced };
  const out: SeqStep[] = [step('telegraph', beats.telegraph, rarity, { ...o, sounds: RARITY_SOUND[rarity] ? [RARITY_SOUND[rarity]!] : [] }), step('opening', beats.open, rarity, { ...o, sounds: ['seal_break'] })];
  if (beats.emerge > 0) out.push(step('emerge', beats.emerge, rarity, o));
  out.push(step('reveal', beats.reveal + (featured ? FEATURED_EXTRA_MS : 0), rarity, { ...o, featured, sounds: featured ? ['card_reveal', 'featured_reveal'] : ['card_reveal'] }));
  return out;
}

export function buildTimeline(pulls: readonly SeqPull[], reduced = false): SeqStep[] {
  if (pulls.length === 0) return [step('result', 0, 'common', { reduced })];
  if (pulls.length === 1) {
    const p = pulls[0];
    const b = SINGLE_BEATS[p.rarity];
    return [step('charging', b.charge, p.rarity, { reduced, sounds: ['summon_start'] }), ...cardBeats(p.rarity, b, p.mainFeatured, null, false, reduced), step('result', 0, p.rarity, { reduced, featured: p.mainFeatured })];
  }
  const best = bestRarity(pulls);
  const open = TEN_OPENING[best];
  const steps: SeqStep[] = [
    step('charging', open.charge, best, { reduced, sounds: ['summon_start'] }),
    step('telegraph', open.telegraph, best, { reduced, sounds: RARITY_SOUND[best] ? [RARITY_SOUND[best]!] : [] }),
    step('opening', open.open, best, { reduced, sounds: ['seal_break'] }),
  ];
  pulls.forEach((p, i) => {
    if (p.rarity === 'common' || p.rarity === 'rare') steps.push(step('slot', TEN_SLOT_MS[p.rarity], p.rarity, { slot: i, reduced, sounds: ['card_reveal'] }));
    else steps.push(...cardBeats(p.rarity, TEN_STAGE[p.rarity], p.mainFeatured, i, true, reduced));
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
  /** The slot whose card is currently on stage (single: 0). Null when no card is centred. */
  stageSlot: number | null;
  /** How many of the ten grid slots are face-up (ten only). */
  revealed: number;
  featured: boolean;
  isResult: boolean;
  /** Duration of the current step - the presentation scales its CSS animation to it. */
  ms: number;
}

export function viewAt(timeline: readonly SeqStep[], index: number, count: number): SeqView {
  const s = timeline[Math.min(index, timeline.length - 1)];
  const ten = count > 1;
  let revealed = 0;
  if (s.phase === 'result') revealed = count;
  else if (s.slot !== null) revealed = s.stage ? s.slot : s.slot + 1;
  const stageSlot = s.stage ? s.slot : !ten && (s.phase === 'emerge' || s.phase === 'reveal' || s.phase === 'result') ? 0 : null;
  return { phase: s.phase, tier: s.tier, stageSlot, revealed, featured: s.featured, isResult: s.phase === 'result', ms: s.ms };
}

/** Where a tap jumps to. Skipping only ever moves the PRESENTATION forward - results were granted before it began. */
export function skipTarget(timeline: readonly SeqStep[], index: number): number {
  const last = timeline.length - 1;
  if (index >= last) return last;
  const cur = timeline[index];
  // The very first beat (charging) is too short to matter and hasn't established the rarity yet.
  if (cur.phase === 'charging') return index;
  const ten = timeline.some((s) => s.slot !== null);
  if (!ten) return cur.phase === 'reveal' ? last : timeline.findIndex((s) => s.phase === 'reveal');
  // ten: finish an in-progress stage first, then jump to the next Epic/Legendary stage, else the grid.
  if (cur.stage && cur.phase !== 'reveal') return timeline.findIndex((s, i) => i > index && s.phase === 'reveal' && s.slot === cur.slot);
  const next = timeline.findIndex((s, i) => i > index && s.stage && s.phase === 'telegraph');
  return next === -1 ? last : next;
}

/** The film owns travel/anticipation. Continue directly into real cards, never replay sky effects. */
export function buildFilmTimeline(pulls: readonly SeqPull[], reduced = false): SeqStep[] {
  return buildTimeline(pulls, reduced).filter(s => s.phase !== 'telegraph' && s.phase !== 'opening');
}
