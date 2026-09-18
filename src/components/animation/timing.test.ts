import { describe, expect, it } from 'vitest';
import { BASE_DURATIONS, PAUSE_MS, resolveDuration, resolvePause } from './timing';

describe('resolveDuration', () => {
  it('instant always resolves to 0, regardless of category or reduced motion', () => {
    for (const category of Object.keys(BASE_DURATIONS) as (keyof typeof BASE_DURATIONS)[]) {
      expect(resolveDuration(category, 'instant', false)).toBe(0);
      expect(resolveDuration(category, 'instant', true)).toBe(0);
    }
  });

  it('at 1x speed with full motion, resolves each category to its own base duration', () => {
    expect(resolveDuration('micro', '1x', false)).toBe(BASE_DURATIONS.micro);
    expect(resolveDuration('short', '1x', false)).toBe(BASE_DURATIONS.short);
    expect(resolveDuration('combat', '1x', false)).toBe(BASE_DURATIONS.combat);
    expect(resolveDuration('major', '1x', false)).toBe(BASE_DURATIONS.major);
  });

  it('preserves category ordering at normal speed (readable pacing, not identical beats)', () => {
    expect(resolveDuration('micro', '1x', false)).toBeLessThan(resolveDuration('short', '1x', false));
    expect(resolveDuration('short', '1x', false)).toBeLessThan(resolveDuration('combat', '1x', false));
    expect(resolveDuration('combat', '1x', false)).toBeLessThan(resolveDuration('major', '1x', false));
  });

  it('2x speed is strictly faster than 1x for the same category', () => {
    for (const category of Object.keys(BASE_DURATIONS) as (keyof typeof BASE_DURATIONS)[]) {
      expect(resolveDuration(category, '2x', false)).toBeLessThan(resolveDuration(category, '1x', false));
    }
  });

  it('reduced motion collapses every category to the same (micro) pace before the speed multiplier applies', () => {
    const micro = resolveDuration('micro', '1x', true);
    expect(resolveDuration('short', '1x', true)).toBe(micro);
    expect(resolveDuration('combat', '1x', true)).toBe(micro);
    expect(resolveDuration('major', '1x', true)).toBe(micro);
    expect(micro).toBe(BASE_DURATIONS.micro);
  });

  it('reduced motion never lengthens a beat past its normal-motion duration', () => {
    for (const category of Object.keys(BASE_DURATIONS) as (keyof typeof BASE_DURATIONS)[]) {
      expect(resolveDuration(category, '1x', true)).toBeLessThanOrEqual(resolveDuration(category, '1x', false));
    }
  });

  it('1x readability targets are the slower combat-feel-refinement baseline, not the original fast pass', () => {
    // Regression guard: the whole point of this pass was "too fast to comfortably follow" - these
    // bases must stay at least as slow as the refinement's approximate targets (220/350/550/700ms).
    expect(BASE_DURATIONS.micro).toBeGreaterThanOrEqual(220);
    expect(BASE_DURATIONS.short).toBeGreaterThanOrEqual(350);
    expect(BASE_DURATIONS.combat).toBeGreaterThanOrEqual(550);
    expect(BASE_DURATIONS.major).toBeGreaterThanOrEqual(700);
  });
});

describe('resolvePause', () => {
  it('instant always resolves to 0', () => {
    expect(resolvePause('instant', false)).toBe(0);
    expect(resolvePause('instant', true)).toBe(0);
  });

  it('at 1x speed with full motion, resolves to the base pause', () => {
    expect(resolvePause('1x', false)).toBe(PAUSE_MS);
  });

  it('falls within the brief\'s approximate 80-140ms target at 1x', () => {
    expect(resolvePause('1x', false)).toBeGreaterThanOrEqual(80);
    expect(resolvePause('1x', false)).toBeLessThanOrEqual(140);
  });

  it('2x speed is strictly faster than 1x', () => {
    expect(resolvePause('2x', false)).toBeLessThan(resolvePause('1x', false));
  });

  it('reduced motion shortens the pause but never removes it outright at 1x', () => {
    const reduced = resolvePause('1x', true);
    expect(reduced).toBeLessThan(resolvePause('1x', false));
    expect(reduced).toBeGreaterThan(0);
  });
});
