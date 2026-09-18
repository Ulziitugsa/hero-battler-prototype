import { useEffect, useMemo, useState } from 'react';
import type { GameEvent, GameState } from '../../game/types';
import { replayUpTo } from '../../game/engine/replay';
import { buildAnimationSteps } from './buildAnimationSteps';
import { computeStepVisuals, type StepVisuals } from './chitEffects';
import { resolveDuration, resolvePause, useReducedMotion } from './timing';
import type { AnimationSpeed, AnimationStep } from './types';

/**
 * Drives playback of one round's already-resolved events. This is the ONLY place that owns a timer -
 * the engine (`resolveRound`) stays fully synchronous and knows nothing about any of this; this hook
 * just steps through the ordered `AnimationStep[]` `buildAnimationSteps` produced from its events.
 *
 * State-commit model: `displayState` always reflects everything from step 0 up through the PREVIOUS
 * step - never the step currently playing. A step's own events (a Hero dying, HP dropping, ...) are
 * only folded into `displayState` when that step's duration elapses and playback advances to the
 * next one. This is what lets a destroyed Hero's chit still be on the board while its own destruction
 * animation plays, instead of vanishing the instant the engine decided it was dead - see
 * `buildAnimationSteps`'s combat-pairing comment for why events aren't always shown in their raw
 * array order. `committedIndex` only ever moves forward (a running max of each step's
 * `maxEventIndex`), so `displayState` is always a valid prefix-replay of the real event log, never a
 * skipped-around reconstruction - the invariant `replay.test.ts` already relies on elsewhere.
 */
export function useAnimationController({ events, baseState, speed, active }: { events: GameEvent[]; baseState: GameState; speed: AnimationSpeed; active: boolean }) {
  const reducedMotion = useReducedMotion();
  const steps = useMemo(() => buildAnimationSteps(events), [events]);

  const [stepIndex, setStepIndex] = useState(0);
  const [committedIndex, setCommittedIndex] = useState(-1);

  // A new round's events (a fresh array from a fresh resolveRound() call) resets playback to the
  // start. Adjusted during render rather than in an effect - the React-recommended way to reset state
  // when a prop changes, avoiding an extra commit-then-immediately-re-render cycle.
  const [eventsForReset, setEventsForReset] = useState(events);
  if (events !== eventsForReset) {
    setEventsForReset(events);
    setStepIndex(0);
    setCommittedIndex(-1);
  }

  useEffect(() => {
    if (!active || steps.length === 0) return;
    if (stepIndex >= steps.length) return;

    const step = steps[stepIndex];
    const duration = resolveDuration(step.timingCategory, speed, reducedMotion);
    // A curated set of "major beat" steps hold the screen a little longer than their own animation
    // takes, so the next beat reads as a separate event rather than blurring into this one - see
    // buildAnimationSteps's `pauseAfter` and timing.ts's `resolvePause`.
    const wait = duration + (step.pauseAfter ? resolvePause(speed, reducedMotion) : 0);
    // Even "instant" settles on the next tick rather than synchronously inside the effect - still
    // imperceptible to the player, but keeps every state transition driven by a real async boundary.
    const timer = setTimeout(
      () => {
        if (wait <= 0) {
          setStepIndex(steps.length);
          setCommittedIndex(events.length - 1);
          return;
        }
        setCommittedIndex((prev) => Math.max(prev, step.maxEventIndex));
        setStepIndex((i) => i + 1);
      },
      Math.max(wait, 0),
    );
    return () => clearTimeout(timer);
  }, [active, stepIndex, steps, speed, reducedMotion, events.length]);

  const displayState = useMemo(() => replayUpTo(baseState, events, committedIndex), [baseState, events, committedIndex]);

  const currentStep: AnimationStep | null = active && stepIndex < steps.length ? steps[stepIndex] : null;
  const visuals: StepVisuals = useMemo(() => computeStepVisuals(currentStep, displayState), [currentStep, displayState]);

  return {
    steps,
    stepIndex,
    currentStep,
    displayState,
    visuals,
    isDone: stepIndex >= steps.length,
    reducedMotion,
  };
}
