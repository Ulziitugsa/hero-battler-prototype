import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../animation/timing';
import { landingDelay, type RewardKind } from './rewardBus';

export const COUNT_UP_MS = 650;

/** easeOutCubic: fast at first, settling onto the final value. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** The number shown `progress` (0..1) of the way from `from` to `to`, always a whole number and exact at the ends. */
export function tweenValue(from: number, to: number, progress: number): number {
  if (progress >= 1) return to;
  if (progress <= 0) return from;
  return Math.round(from + (to - from) * easeOutCubic(progress));
}

/** What a roll needs from the page. The browser one is the default; tests pass a fake. */
export interface CountUpEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
  requestFrame(fn: () => void): number;
  cancelFrame(id: number): void;
  isHidden(): boolean;
  /** Calls `fn` whenever the page is hidden or shown again; returns the unsubscribe. */
  onVisibilityChange(fn: () => void): () => void;
}

const browserEnv: CountUpEnv = {
  now: () => performance.now(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (id) => window.clearTimeout(id),
  requestFrame: (fn) => requestAnimationFrame(() => fn()),
  cancelFrame: (id) => cancelAnimationFrame(id),
  isHidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  onVisibilityChange: (fn) => {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
};

/** Grace after a roll should have ended before the timer forces the final value (one or two late frames). */
export const COUNT_UP_SETTLE_SLACK_MS = 50;

/**
 * Rolls a displayed number from `from` to `to`, reporting each step through `show`. Animation frames only make the
 * roll smooth; they are never what makes the number correct. The final value is forced by a timer once the roll should
 * have ended, shown at once when the page is hidden (frames stop there), and re-synced when the page is shown again.
 * Returns a cancel function.
 */
export function runCountUp(from: number, to: number, { delayMs, durationMs }: { delayMs: number; durationMs: number }, show: (value: number, counting: boolean) => void, env: CountUpEnv = browserEnv): () => void {
  let frame = 0;
  let start = 0;
  let done = false;
  const timers: number[] = [];
  let unsubscribe = () => {};
  const cleanup = () => {
    done = true;
    timers.forEach(env.clearTimer);
    env.cancelFrame(frame);
    unsubscribe();
  };
  const finish = () => {
    if (done) return;
    cleanup();
    show(to, false);
  };
  if (env.isHidden()) {
    finish();
    return cleanup;
  }
  const tick = () => {
    if (done) return;
    const next = tweenValue(from, to, (env.now() - start) / durationMs);
    if (next === to) return finish();
    show(next, true);
    frame = env.requestFrame(tick);
  };
  unsubscribe = env.onVisibilityChange(finish);
  timers.push(
    env.setTimer(() => {
      start = env.now();
      show(from, true);
      frame = env.requestFrame(tick);
    }, delayMs),
    env.setTimer(finish, delayMs + durationMs + COUNT_UP_SETTLE_SLACK_MS),
  );
  return cleanup;
}

export interface CountUpOptions {
  /** Wait for a reward of this kind to land (rewardBus) before counting. */
  kind?: RewardKind;
  durationMs?: number;
  /**
   * Animate decreases too (an HP meter draining). Off by default: spending is shown at once, so a balance never
   * pretends the player still has what they just spent.
   */
  animateDecrease?: boolean;
}

/**
 * A displayed number that rolls to its new value instead of jumping. Returns the value to render and whether it is
 * mid-roll (for a highlight class). The real value is never delayed for logic: callers render this for DISPLAY only and
 * keep using the store's value everywhere else. Reduced motion shows every change at once; see runCountUp for why the
 * shown value always ends on the real one.
 */
export function useCountUp(value: number, { kind, durationMs = COUNT_UP_MS, animateDecrease = false }: CountUpOptions = {}): { display: number; counting: boolean } {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const [counting, setCounting] = useState(false);
  const shown = useRef(value);

  useEffect(() => {
    const show = (next: number, rolling: boolean) => {
      shown.current = next;
      setDisplay(next);
      setCounting(rolling);
    };
    const from = shown.current;
    if (from === value) {
      setCounting(false);
      return;
    }
    if (reduced || durationMs <= 0 || (value < from && !animateDecrease)) {
      show(value, false);
      return;
    }
    return runCountUp(from, value, { delayMs: kind ? landingDelay(kind) : 0, durationMs }, show);
  }, [value, reduced, durationMs, animateDecrease, kind]);

  return { display, counting };
}
