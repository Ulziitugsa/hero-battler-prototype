import { describe, expect, it } from 'vitest';
import type { Rarity } from '../types';
import { FEATURED_EXTRA_MS, SINGLE_BEATS, TEN_OPENING, TEN_SLOT_MS, bestRarity, buildTimeline, skipTarget, totalMs, viewAt, type SeqPull } from './sequence';

const one = (rarity: Rarity, mainFeatured = false): SeqPull[] => [{ rarity, mainFeatured }];
const ten = (r: Partial<Record<number, Rarity>> = {}, mainFeatured: number[] = []): SeqPull[] => Array.from({ length: 10 }, (_, i) => ({ rarity: r[i] ?? 'common', mainFeatured: mainFeatured.includes(i) }));

describe('single timeline', () => {
  it('walks charging -> telegraph -> opening -> emerge -> reveal -> result', () => {
    for (const r of ['common', 'rare', 'epic', 'legendary'] as const) expect(buildTimeline(one(r)).map((s) => s.phase)).toEqual(['charging', 'telegraph', 'opening', 'emerge', 'reveal', 'result']);
  });
  it('gets slower and more dramatic with rarity, and the tier is on every step (so the light can telegraph it)', () => {
    const t = (r: Rarity) => totalMs(buildTimeline(one(r)));
    expect(t('common')).toBeLessThan(t('rare'));
    expect(t('rare')).toBeLessThan(t('epic'));
    expect(t('epic')).toBeLessThan(t('legendary'));
    for (const s of buildTimeline(one('epic'))) expect(s.tier).toBe('epic');
  });
  it('Common stays under 3.5s; Legendary builds for 8-9s; featured holds stay under 9.5s', () => {
    expect(totalMs(buildTimeline(one('common')))).toBeLessThan(3500);
    const leg = totalMs(buildTimeline(one('legendary')));
    expect(leg).toBeGreaterThanOrEqual(8000);
    expect(leg).toBeLessThanOrEqual(9000);
    const feat = totalMs(buildTimeline(one('legendary', true)));
    expect(feat - leg).toBe(FEATURED_EXTRA_MS);
    expect(feat).toBeLessThanOrEqual(9500);
  });
  it('the rarity telegraph is longer for higher rarity - the anticipation beat', () => {
    const tele = (r: Rarity) => buildTimeline(one(r)).find((s) => s.phase === 'telegraph')!.ms;
    expect(tele('common')).toBeLessThan(tele('rare'));
    expect(tele('rare')).toBeLessThan(tele('epic'));
    expect(tele('epic')).toBeLessThan(tele('legendary'));
    expect(tele('legendary')).toBe(SINGLE_BEATS.legendary.telegraph);
  });
  it('schedules sound events in order: start, rarity cue, seal break, card reveal (+ featured)', () => {
    const sounds = (p: SeqPull[]) => buildTimeline(p).flatMap((s) => s.sounds);
    expect(sounds(one('common'))).toEqual(['summon_start', 'seal_break', 'card_reveal']);
    expect(sounds(one('rare'))).toEqual(['summon_start', 'rarity_rare', 'seal_break', 'card_reveal']);
    expect(sounds(one('epic'))).toEqual(['summon_start', 'rarity_epic', 'seal_break', 'card_reveal']);
    expect(sounds(one('legendary'))).toEqual(['summon_start', 'rarity_legendary', 'seal_break', 'card_reveal']);
    expect(sounds(one('legendary', true))).toEqual(['summon_start', 'rarity_legendary', 'seal_break', 'card_reveal', 'featured_reveal']);
  });
  it('reduced motion shortens every beat but keeps the same phases and the rarity ordering', () => {
    for (const r of ['common', 'rare', 'epic', 'legendary'] as const) {
      const full = buildTimeline(one(r));
      const red = buildTimeline(one(r), true);
      expect(red.map((s) => s.phase)).toEqual(full.map((s) => s.phase));
      expect(totalMs(red)).toBeLessThan(totalMs(full));
    }
    expect(totalMs(buildTimeline(one('legendary'), true))).toBeGreaterThan(totalMs(buildTimeline(one('common'), true)));
  });
});

describe('10x timeline', () => {
  it('opens once with the BEST rarity in the batch, then walks results in pull order', () => {
    const t = buildTimeline(ten({ 6: 'legendary', 2: 'rare' }));
    expect(t.slice(0, 3).map((s) => [s.phase, s.tier])).toEqual([['charging', 'legendary'], ['telegraph', 'legendary'], ['opening', 'legendary']]);
    const slots = t.filter((s) => s.slot !== null).map((s) => s.slot!);
    expect([...new Set(slots)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
    expect(t[t.length - 1].phase).toBe('result');
  });
  it('a batch with no Epic+ is quick: under five seconds to the grid', () => {
    const ms = totalMs(buildTimeline(ten({ 3: 'rare', 7: 'rare' })));
    expect(ms).toBeGreaterThan(1200);
    expect(ms).toBeLessThanOrEqual(5000);
    expect(ms).toBe(TEN_OPENING.rare.charge + TEN_OPENING.rare.telegraph + TEN_OPENING.rare.open + 2 * TEN_SLOT_MS.rare + 8 * TEN_SLOT_MS.common);
  });
  it('Epic adds a short pause and Legendary a full stage; neither is required for the rest to stay fast', () => {
    const low = totalMs(buildTimeline(ten()));
    const epic = totalMs(buildTimeline(ten({ 5: 'epic' })));
    const leg = totalMs(buildTimeline(ten({ 5: 'legendary' })));
    expect(epic).toBeGreaterThan(low);
    expect(leg).toBeGreaterThan(epic);
    expect(epic).toBeLessThan(6500);
    expect(leg).toBeLessThan(9500);
  });
  it('Epic/Legendary slots get their own staged telegraph -> opening -> reveal; commons do not', () => {
    const t = buildTimeline(ten({ 4: 'epic', 8: 'legendary' }, [8]));
    const stage = (slot: number) => t.filter((s) => s.slot === slot).map((s) => s.phase);
    expect(stage(0)).toEqual(['slot']);
    expect(stage(4)).toEqual(['telegraph', 'opening', 'reveal']);
    expect(stage(8)).toEqual(['telegraph', 'opening', 'emerge', 'reveal']);
    expect(t.find((s) => s.slot === 8 && s.phase === 'reveal')!.featured).toBe(true);
    expect(t.filter((s) => s.slot === 8).flatMap((s) => s.sounds)).toEqual(['rarity_legendary', 'seal_break', 'card_reveal', 'featured_reveal']);
  });
  it('pull order is preserved even for multiple high rarities', () => {
    const t = buildTimeline(ten({ 1: 'epic', 3: 'legendary', 6: 'epic' }));
    const order = t.filter((s) => s.stage && s.phase === 'reveal').map((s) => s.slot);
    expect(order).toEqual([1, 3, 6]);
    expect(bestRarity(ten({ 1: 'epic', 3: 'legendary' }))).toBe('legendary');
  });
});

describe('view state', () => {
  it('single: the card is on stage from emerge onward; the result is the last step', () => {
    const t = buildTimeline(one('epic'));
    expect(viewAt(t, 0, 1)).toMatchObject({ phase: 'charging', stageSlot: null });
    expect(viewAt(t, 3, 1)).toMatchObject({ phase: 'emerge', stageSlot: 0 });
    expect(viewAt(t, t.length - 1, 1)).toMatchObject({ phase: 'result', isResult: true, stageSlot: 0 });
  });
  it('ten: slots become face-up in order; a staged slot appears in the grid only after its stage', () => {
    const t = buildTimeline(ten({ 2: 'epic' }));
    const idx = (slot: number, phase: string) => t.findIndex((s) => s.slot === slot && s.phase === phase);
    expect(viewAt(t, idx(1, 'slot'), 10).revealed).toBe(2);
    expect(viewAt(t, idx(2, 'telegraph'), 10)).toMatchObject({ revealed: 2, stageSlot: 2 });
    expect(viewAt(t, idx(2, 'reveal'), 10)).toMatchObject({ revealed: 2, stageSlot: 2 });
    expect(viewAt(t, idx(3, 'slot'), 10).revealed).toBe(4);
    expect(viewAt(t, t.length - 1, 10)).toMatchObject({ revealed: 10, isResult: true });
  });
});

describe('skipping', () => {
  it('never skips the first beat, never goes backward, and always ends at the result', () => {
    const t = buildTimeline(one('legendary'));
    expect(skipTarget(t, 0)).toBe(0);
    for (let i = 1; i < t.length; i++) expect(skipTarget(t, i)).toBeGreaterThanOrEqual(i);
    expect(skipTarget(t, t.length - 1)).toBe(t.length - 1);
  });
  it('single: a tap during the build-up jumps to the card reveal; a tap during the reveal jumps to the result', () => {
    const t = buildTimeline(one('legendary'));
    const reveal = t.findIndex((s) => s.phase === 'reveal');
    expect(skipTarget(t, 1)).toBe(reveal);
    expect(skipTarget(t, 3)).toBe(reveal);
    expect(skipTarget(t, reveal)).toBe(t.length - 1);
  });
  it('ten: a tap finishes the current stage, then jumps to the next Epic/Legendary stage, else straight to the grid', () => {
    const t = buildTimeline(ten({ 4: 'epic', 8: 'legendary' }));
    const at = (slot: number, phase: string) => t.findIndex((s) => s.slot === slot && s.phase === phase);
    expect(skipTarget(t, 1)).toBe(at(4, 'telegraph')); // during the opening telegraph
    expect(skipTarget(t, at(4, 'telegraph'))).toBe(at(4, 'reveal')); // finish the stage first
    expect(skipTarget(t, at(4, 'reveal'))).toBe(at(8, 'telegraph'));
    expect(skipTarget(t, at(8, 'reveal'))).toBe(t.length - 1);
    const plain = buildTimeline(ten());
    expect(skipTarget(plain, 2)).toBe(plain.length - 1);
  });
});

// The full-film version must not reintroduce a second coded travel sequence.
describe('film handoff', () => {
  it('retains every reward and ends at the same result without sky phases', async () => {
    const { buildFilmTimeline } = await import('./sequence');
    for (const pulls of [one('legendary', true),ten({2:'epic',7:'legendary'})]) {
      const t=buildFilmTimeline(pulls);
      expect(t[0].phase).toBe('charging');
      expect(t.some(s=>s.phase==='telegraph'||s.phase==='opening')).toBe(false);
      expect(viewAt(t,t.length-1,pulls.length)).toMatchObject({isResult:true,revealed:pulls.length});
      if(pulls.length===10) expect([...new Set(t.filter(s=>s.slot!==null).map(s=>s.slot))]).toEqual([0,1,2,3,4,5,6,7,8,9]);
    }
  });
});
