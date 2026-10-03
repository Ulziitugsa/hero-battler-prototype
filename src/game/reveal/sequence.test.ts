import { describe, expect, it } from 'vitest';
import type { Rarity } from '../types';
import { CARD_BEAT_MS, HEADLINE_BEATS, OPENING_BEATS, advanceTarget, bestRarity, buildPackTimeline, planPackReveal, risingOrder, totalMs, viewAt, type SeqStep } from './sequence';

// The pack-opening ceremony as data (game/reveal/sequence.ts): what each opening presents, in which order and for how
// long. The cards themselves were granted before the ceremony; these tests only read rarities.

const C: Rarity = 'common', R: Rarity = 'rare', E: Rarity = 'epic', L: Rarity = 'legendary';
const pack = (...r: Rarity[]) => r;
const tenPacks = (packs: Partial<Record<number, Rarity[]>>): Rarity[] => Array.from({ length: 10 }, (_, p) => packs[p] ?? [C, C, C, C, C]).flat();
/** Every card the timeline puts in front of the player: on the stage, or in the grid tile it turns over. */
function presented(t: readonly SeqStep[], tiles: number[][]): Set<number> {
  const seen = new Set<number>();
  for (const s of t) {
    if (s.stage && s.card !== null) seen.add(s.card);
    if (s.phase === 'slot' && s.slot !== null) for (const c of tiles[s.slot]) seen.add(c);
  }
  return seen;
}

describe('one pack: all five cards, rising to the rarest', () => {
  it('turns every card over: the Moonwell opening, then five card beats, then the result', () => {
    const r = pack(C, L, R, C, E);
    const t = buildPackTimeline(r);
    const plan = planPackReveal(r);
    expect(t.slice(0, 3).map((s) => s.phase)).toEqual(['charging', 'telegraph', 'opening']);
    expect(t.at(-1)!.phase).toBe('result');
    expect([...presented(t, plan.tiles)].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(viewAt(t, t.length - 1).revealed).toBe(5);
  });
  it('presents in rising rarity with the Legendary last, even when it was drawn second', () => {
    const r = pack(C, L, R, C, E);
    expect(planPackReveal(r).tiles.flat()).toEqual([0, 3, 2, 4, 1]);
    const stages = buildPackTimeline(r).filter((s) => s.stage);
    expect(stages.at(-1)).toMatchObject({ phase: 'reveal', card: 1, headline: true });
  });
  it('gives the headline the full hero reveal (telegraph, seal, emerge, a long reveal) and the other Epic a shorter spotlight', () => {
    const t = buildPackTimeline(pack(C, L, R, C, E));
    const head = t.filter((s) => s.card === 1).map((s) => [s.phase, s.ms]);
    expect(head).toEqual([['telegraph', HEADLINE_BEATS.legendary.telegraph], ['opening', HEADLINE_BEATS.legendary.open], ['emerge', HEADLINE_BEATS.legendary.emerge], ['reveal', HEADLINE_BEATS.legendary.reveal]]);
    const epic = t.filter((s) => s.card === 4);
    expect(epic.map((s) => s.phase)).toEqual(['telegraph', 'reveal']);
    expect(epic.every((s) => !s.headline)).toBe(true);
    expect(epic.reduce((n, s) => n + s.ms, 0)).toBeLessThan(head.reduce((n, [, ms]) => n + (ms as number), 0));
  });
  it('paces by rarity: a Common turns fast, a Rare a little slower and brighter, an Epic or Legendary takes the stage', () => {
    const t = buildPackTimeline(pack(C, R, C, C, C));
    const slots = t.filter((s) => s.phase === 'slot');
    expect(slots.map((s) => s.tier)).toEqual([C, C, C, C, R]);
    expect(slots.map((s) => s.ms)).toEqual([CARD_BEAT_MS.common, CARD_BEAT_MS.common, CARD_BEAT_MS.common, CARD_BEAT_MS.common, CARD_BEAT_MS.rare]);
    expect(slots.at(-1)!.sounds).toContain('rarity_rare');
    expect(slots[0].sounds).toEqual(['card_reveal']);
    expect(t.some((s) => s.stage)).toBe(false); // nothing Epic or better: no stage, no headline
    expect(planPackReveal(pack(C, R, C, C, C)).headline).toBeNull();
  });
  it('five Commons stay short; a Legendary pack builds longer, but stays far from a minute', () => {
    const commons = totalMs(buildPackTimeline(pack(C, C, C, C, C)));
    const legendary = totalMs(buildPackTimeline(pack(C, C, R, E, L)));
    expect(commons).toBeLessThan(5000);
    expect(legendary).toBeGreaterThan(commons * 2);
    expect(legendary).toBeLessThan(16000); // plus the Moonwell film (about 4s), which a tap skips
  });
  it('celebrates every Epic and Legendary: two of each all take the stage, the first-drawn Legendary is the climax', () => {
    const r = pack(E, L, C, L, E);
    const t = buildPackTimeline(r);
    const staged = [...new Set(t.filter((s) => s.stage).map((s) => s.card))];
    expect(staged.sort()).toEqual([0, 1, 3, 4]);
    expect(t.filter((s) => s.headline && s.phase === 'reveal').map((s) => s.card)).toEqual([1]);
    expect(t.filter((s) => s.stage).at(-1)!.card).toBe(1);
  });
  it('the shared opening telegraphs the best rarity in the pack', () => {
    for (const best of [C, R, E, L] as const) {
      const t = buildPackTimeline(pack(C, C, C, C, best));
      expect(t.slice(0, 3).map((s) => s.tier)).toEqual([best, best, best]);
      expect(t[1].ms).toBe(OPENING_BEATS[best].telegraph);
    }
  });
});

describe('ten packs: one compressed ceremony for fifty cards', () => {
  const r = tenPacks({ 2: [C, E, C, C, R], 4: [R, C, E, R, C], 6: [E, C, L, C, C], 8: [C, C, E, C, R] });
  it('opens once, then one beat per pack: ten pack tiles, the climax pack last', () => {
    const plan = planPackReveal(r);
    expect(plan.mode).toBe('ten');
    expect(plan.tiles).toHaveLength(10);
    expect(plan.tiles.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i)); // all fifty, once each
    expect(plan.headline).toBe(32);
    expect(plan.tiles.at(-1)).toContain(32);
    const t = buildPackTimeline(r);
    expect(t.filter((s) => s.phase === 'charging')).toHaveLength(1);
    expect(t.filter((s) => s.phase === 'slot')).toHaveLength(9); // the climax pack opens with its hero reveal
    expect(viewAt(t, t.length - 1).revealed).toBe(10);
  });
  it('spotlights every Epic and Legendary before its pack opens; only the headline gets the long hero reveal', () => {
    const t = buildPackTimeline(r);
    const staged = [...new Set(t.filter((s) => s.stage).map((s) => s.card))];
    expect(staged.sort((a, b) => a! - b!)).toEqual([11, 22, 30, 32, 42]);
    expect(t.filter((s) => s.headline).map((s) => s.card)).toEqual([32, 32, 32, 32]);
    expect(t.filter((s) => s.stage).at(-1)).toMatchObject({ card: 32, phase: 'reveal', headline: true });
    // a spotlight comes before its own pack's grid beat, so the tile never spoils it
    const spotlight = t.findIndex((s) => s.card === 11 && s.phase === 'reveal');
    const packBeat = t.findIndex((s) => s.phase === 'slot' && s.slot === planPackReveal(r).tiles.findIndex((tile) => tile.includes(11)));
    expect(spotlight).toBeLessThan(packBeat);
  });
  it('is compressed: far shorter than ten one-pack ceremonies, and a pack of Commons is a fraction of a second', () => {
    const ten = totalMs(buildPackTimeline(r));
    const onePackEach = Array.from({ length: 10 }, (_, p) => totalMs(buildPackTimeline(r.slice(p * 5, p * 5 + 5)))).reduce((a, b) => a + b, 0);
    expect(ten).toBeLessThan(onePackEach / 2);
    expect(ten).toBeLessThan(22000);
    const commons = buildPackTimeline(tenPacks({}));
    expect(commons.filter((s) => s.phase === 'slot').every((s) => s.ms <= 300)).toBe(true);
    expect(totalMs(commons)).toBeLessThan(5500);
  });
});

describe('tap and Skip only move the presentation forward', () => {
  const t = buildPackTimeline(pack(C, L, R, C, E));
  it('a tap finishes the current beat: during a card\'s build-up it jumps to that card\'s reveal, otherwise to the next step', () => {
    const headTelegraph = t.findIndex((s) => s.headline && s.phase === 'telegraph');
    expect(t[advanceTarget(t, headTelegraph)]).toMatchObject({ headline: true, phase: 'reveal' });
    expect(advanceTarget(t, 0)).toBe(1);
    const slot = t.findIndex((s) => s.phase === 'slot');
    expect(advanceTarget(t, slot)).toBe(slot + 1);
    for (let i = 0; i < t.length; i++) expect(advanceTarget(t, i)).toBeGreaterThanOrEqual(Math.min(i + 1, t.length - 1));
    expect(advanceTarget(t, t.length - 1)).toBe(t.length - 1);
  });
  it('the result shows every tile face-up, whatever was skipped', () => {
    expect(viewAt(t, t.length - 1)).toMatchObject({ isResult: true, revealed: 5, stageCard: null });
  });
  it('presentation order never changes or loses a card: the plan is a permutation of the opening', () => {
    for (const r of [pack(L, E, R, C, C), pack(C, C, C, C, C), pack(E, E, E, E, E), tenPacks({ 0: [L, L, E, E, R], 9: [E, C, C, C, L] })]) {
      const copy = [...r];
      expect(planPackReveal(r).tiles.flat().sort((a, b) => a - b)).toEqual(r.map((_, i) => i));
      expect(r).toEqual(copy);
    }
  });
});

describe('helpers', () => {
  it('bestRarity and risingOrder', () => {
    expect(bestRarity([C, E, R])).toBe(E);
    expect(bestRarity([])).toBe(C);
    expect(risingOrder([E, C, R, C])).toEqual([1, 3, 2, 0]);
  });
  it('reduced motion keeps the hierarchy and shortens every beat', () => {
    const full = buildPackTimeline(pack(C, C, R, E, L));
    const reduced = buildPackTimeline(pack(C, C, R, E, L), true);
    expect(reduced.map((s) => s.phase)).toEqual(full.map((s) => s.phase));
    expect(totalMs(reduced)).toBeLessThan(totalMs(full) / 2);
  });
});
