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
 * keep using the store's value everywhere else. Reduced motion shows every change at once.
 */
export function useCountUp(value: number, { kind, durationMs = COUNT_UP_MS, animateDecrease = false }: CountUpOptions = {}): { display: number; counting: boolean } {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const [counting, setCounting] = useState(false);
  const shown = useRef(value);

  useEffect(() => {
    const from = shown.current;
    if (from === value) return;
    const snap = reduced || durationMs <= 0 || (value < from && !animateDecrease);
    if (snap) {
      shown.current = value;
      setDisplay(value);
      setCounting(false);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const next = tweenValue(from, value, (t - start) / durationMs);
      shown.current = next;
      setDisplay(next);
      if (next === value) {
        setCounting(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const delay = kind ? landingDelay(kind) : 0;
    const timer = window.setTimeout(() => {
      setCounting(true);
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, reduced, durationMs, animateDecrease, kind]);

  return { display, counting };
}
