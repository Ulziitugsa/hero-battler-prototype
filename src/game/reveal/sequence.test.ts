import { describe, expect, it } from 'vitest';
import type { Rarity } from '../types';
import { CARD_BEAT_MS, HEADLINE_BEATS, OPENING_BEATS, SPOTLIGHT_BEATS, advanceTarget, bestRarity, buildPackTimeline, planPackReveal, risingOrder, totalMs, viewAt, type SeqStep } from './sequence';

// The pull ceremony as data (game/reveal/sequence.ts): what each opening presents, in which order and for how long.
// A pull is exactly 1 card and a 10-pull exactly 10. The cards were granted before the ceremony; these tests only read
// rarities.

const C: Rarity = 'common', R: Rarity = 'rare', E: Rarity = 'epic', L: Rarity = 'legendary';
const ten = (...r: Rarity[]) => [...r, ...Array.from({ length: 10 - r.length }, () => C)];
/** Every card the timeline puts in front of the player: on the stage, or in the grid tile it turns over. */
function presented(t: readonly SeqStep[], tiles: number[]): Set<number> {
  const seen = new Set<number>();
  for (const s of t) {
    if (s.stage && s.card !== null) seen.add(s.card);
    if (s.phase === 'slot' && s.slot !== null) seen.add(tiles[s.slot]);
  }
  return seen;
}

describe('a single pull: one card', () => {
  it('a Common: the Moonwell opening, one card beat, the result', () => {
    const t = buildPackTimeline([C]);
    expect(planPackReveal([C])).toEqual({ mode: 'one', tiles: [0], headline: null });
    expect(t.map((s) => s.phase)).toEqual(['charging', 'telegraph', 'opening', 'slot', 'result']);
    expect(t[3].ms).toBe(CARD_BEAT_MS.one.common);
    expect(viewAt(t, t.length - 1).revealed).toBe(1);
  });
  it('a Legendary gets the full hero reveal (telegraph, seal, emerge, a long reveal)', () => {
    const t = buildPackTimeline([L]);
    expect(planPackReveal([L]).headline).toBe(0);
    expect(t.filter((s) => s.card === 0).map((s) => [s.phase, s.ms])).toEqual([['telegraph', HEADLINE_BEATS.legendary.telegraph], ['opening', HEADLINE_BEATS.legendary.open], ['emerge', HEADLINE_BEATS.legendary.emerge], ['reveal', HEADLINE_BEATS.legendary.reveal]]);
  });
  it('an Epic takes the stage too, as the climax', () => {
    const t = buildPackTimeline([E]);
    expect(t.filter((s) => s.stage).every((s) => s.headline)).toBe(true);
    expect(t.filter((s) => s.stage).at(-1)).toMatchObject({ phase: 'reveal', card: 0 });
  });
  it('the opening telegraphs the card\'s rarity', () => {
    for (const r of [C, R, E, L] as const) {
      const t = buildPackTimeline([r]);
      expect(t.slice(0, 3).map((s) => s.tier)).toEqual([r, r, r]);
      expect(t[1].ms).toBe(OPENING_BEATS[r].telegraph);
    }
  });
});

describe('a 10-pull: ten cards, rising to the rarest', () => {
  const r = ten(C, L, R, C, E, C, R, C, E, C);
  it('turns all ten cards over once each, in rising rarity, the Legendary last even when drawn second', () => {
    const plan = planPackReveal(r);
    expect(plan.mode).toBe('ten');
    expect(plan.tiles).toHaveLength(10);
    expect([...plan.tiles].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(plan.tiles.at(-1)).toBe(1);
    const t = buildPackTimeline(r);
    expect(t.filter((s) => s.phase === 'charging')).toHaveLength(1);
    expect([...presented(t, plan.tiles)].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(viewAt(t, t.length - 1).revealed).toBe(10);
  });
  it('spotlights every Epic, and only the headline gets the long hero reveal', () => {
    const t = buildPackTimeline(r);
    expect([...new Set(t.filter((s) => s.stage).map((s) => s.card))].sort()).toEqual([1, 4, 8]);
    expect(t.filter((s) => s.headline && s.phase === 'reveal').map((s) => s.card)).toEqual([1]);
    expect(t.filter((s) => s.card === 4).map((s) => [s.phase, s.ms])).toEqual([['telegraph', SPOTLIGHT_BEATS.ten.epic.telegraph], ['reveal', SPOTLIGHT_BEATS.ten.epic.reveal]]);
    expect(t.filter((s) => s.stage).at(-1)).toMatchObject({ card: 1, phase: 'reveal', headline: true });
  });
  it('paces by rarity and stays short: ten Commons in a few seconds, a Legendary 10-pull well under twenty', () => {
    const commons = buildPackTimeline(ten());
    expect(commons.filter((s) => s.phase === 'slot').every((s) => s.ms === CARD_BEAT_MS.ten.common)).toBe(true);
    expect(totalMs(commons)).toBeLessThan(6000);
    expect(planPackReveal(ten()).headline).toBeNull();
    const rare = buildPackTimeline(ten(R)).filter((s) => s.phase === 'slot');
    expect(rare.at(-1)).toMatchObject({ tier: R, ms: CARD_BEAT_MS.ten.rare });
    expect(rare.at(-1)!.sounds).toContain('rarity_rare');
    expect(totalMs(buildPackTimeline(r))).toBeLessThan(18000);
  });
  it('celebrates two Legendaries: the first drawn is the climax, the other a spotlight', () => {
    const t = buildPackTimeline(ten(E, L, C, L, E));
    expect([...new Set(t.filter((s) => s.stage).map((s) => s.card))].sort()).toEqual([0, 1, 3, 4]);
    expect(t.filter((s) => s.headline && s.phase === 'reveal').map((s) => s.card)).toEqual([1]);
    expect(t.filter((s) => s.stage).at(-1)!.card).toBe(1);
  });
});

describe('tap and Skip only move the presentation forward', () => {
  const t = buildPackTimeline(ten(C, L, R, C, E));
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
    expect(viewAt(t, t.length - 1)).toMatchObject({ isResult: true, revealed: 10, stageCard: null });
  });
  it('presentation order never changes or loses a card: the plan is a permutation of the opening', () => {
    for (const r of [[L], [C], ten(L, E, R), ten(), ten(E, E, E, E, E, E, E, E, E, E)]) {
      const copy = [...r];
      expect([...planPackReveal(r).tiles].sort((a, b) => a - b)).toEqual(r.map((_, i) => i));
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
    const full = buildPackTimeline(ten(C, C, R, E, L));
    const reduced = buildPackTimeline(ten(C, C, R, E, L), true);
    expect(reduced.map((s) => s.phase)).toEqual(full.map((s) => s.phase));
    expect(totalMs(reduced)).toBeLessThan(totalMs(full) / 2);
  });
});
