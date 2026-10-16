import { describe, expect, it } from 'vitest';
import { COUNT_UP_SETTLE_SLACK_MS, runCountUp, type CountUpEnv } from './useCountUp';

/** A page whose clock, timers, frames and visibility the test drives by hand. */
function fakePage({ hidden = false, framesRun = true } = {}) {
  let clock = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const frames = new Map<number, () => void>();
  const visibility = new Set<() => void>();
  const flags = { hidden, framesRun };
  const page = {
    flags,
    env: {
      now: () => clock,
      setTimer: (fn, ms) => (timers.set(nextId, { at: clock + ms, fn }), nextId++),
      clearTimer: (id) => void timers.delete(id),
      requestFrame: (fn) => (frames.set(nextId, fn), nextId++),
      cancelFrame: (id) => void frames.delete(id),
      isHidden: () => flags.hidden,
      onVisibilityChange: (fn) => (visibility.add(fn), () => void visibility.delete(fn)),
    } satisfies CountUpEnv,
    /** Advances time in 16ms steps, firing due timers and (if frames run) one frame per step. */
    advance(ms: number) {
      const end = clock + ms;
      while (clock < end) {
        clock = Math.min(end, clock + 16);
        for (const [id, t] of [...timers]) {
          if (t.at > clock) continue;
          timers.delete(id);
          t.fn();
        }
        if (!flags.framesRun) continue;
        for (const [id, fn] of [...frames]) {
          frames.delete(id);
          fn();
        }
      }
    },
    setHidden(value: boolean) {
      flags.hidden = value;
      [...visibility].forEach((fn) => fn());
    },
    pending: () => timers.size + frames.size + visibility.size,
  };
  return page;
}

const roll = (page: ReturnType<typeof fakePage>, from = 100, to = 130, delayMs = 0, durationMs = 650) => {
  const shown: Array<[number, boolean]> = [];
  const cancel = runCountUp(from, to, { delayMs, durationMs }, (v, c) => shown.push([v, c]), page.env);
  return { shown, cancel, last: () => shown.at(-1) };
};

describe('a rolling number always ends on the real value', () => {
  it('rolls through in-between values and settles on the target', () => {
    const page = fakePage();
    const r = roll(page);
    page.advance(700);
    expect(r.shown.some(([v]) => v > 100 && v < 130)).toBe(true);
    expect(r.last()).toEqual([130, false]);
    expect(page.pending()).toBe(0);
  });

  it('a hidden page shows the final value at once and schedules nothing', () => {
    const page = fakePage({ hidden: true, framesRun: false });
    const r = roll(page);
    expect(r.shown).toEqual([[130, false]]);
    expect(page.pending()).toBe(0);
  });

  it('with no animation frames at all, a timer still lands the final value', () => {
    const page = fakePage({ framesRun: false });
    const r = roll(page, 1004, 824, 300, 900);
    page.advance(300 + 900);
    expect(r.last()).not.toEqual([824, false]);
    page.advance(COUNT_UP_SETTLE_SLACK_MS);
    expect(r.last()).toEqual([824, false]);
    expect(page.pending()).toBe(0);
  });

  it('hiding the page mid-roll snaps to the final value; showing it again keeps it there', () => {
    const page = fakePage();
    const r = roll(page);
    page.advance(200);
    expect(r.last()![1]).toBe(true);
    page.flags.framesRun = false;
    page.setHidden(true);
    expect(r.last()).toEqual([130, false]);
    page.setHidden(false);
    expect(r.last()).toEqual([130, false]);
    expect(page.pending()).toBe(0);
  });

  it('cancelling (a newer value arrived) stops every update', () => {
    const page = fakePage();
    const r = roll(page);
    page.advance(100);
    const count = r.shown.length;
    r.cancel();
    page.advance(2000);
    expect(r.shown.length).toBe(count);
    expect(page.pending()).toBe(0);
  });
});
