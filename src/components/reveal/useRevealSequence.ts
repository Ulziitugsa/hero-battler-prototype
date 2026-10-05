import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from '../animation/timing';
import { advanceTarget, buildPackTimeline, planPackReveal, viewAt, type PackPlan, type SeqStep, type SeqView } from '../../game/reveal/sequence';
import { emitRevealSound } from '../../game/reveal/sound';
import type { RevealOutcome } from '../../game/reveal/outcome';
import { haptics } from '../../platform/haptics';

// The ONE owner of the reveal ceremony's clock. It walks the pure timeline (game/reveal/sequence.ts) with a single
// timer at a time; components only render the SeqView it returns. The outcome handed to start() is already granted
// and saved - nothing here can change what was opened: a tap only moves to the end of the current beat, Skip only
// jumps to the result, and neither touches the outcome.

interface Run {
  outcome: RevealOutcome;
  plan: PackPlan;
  timeline: SeqStep[];
  index: number;
}

export interface RevealSequence {
  outcome: RevealOutcome | null;
  plan: PackPlan | null;
  view: SeqView | null;
  start: (outcome: RevealOutcome) => void;
  /** A tap: finish the current beat. */
  advance: () => void;
  /** Skip: straight to the result (Pull Results). */
  skip: () => void;
  end: () => void;
  finishIntro: () => void;
}

export function useRevealSequence(): RevealSequence {
  const reduced = useReducedMotion();
  const [run, setRun] = useState<Run | null>(null);

  const start = useCallback(
    (outcome: RevealOutcome) => {
      const rarities = outcome.cards.map((c) => c.rarity);
      setRun({ outcome, plan: planPackReveal(rarities), timeline: buildPackTimeline(rarities, reduced), index: 0 });
    },
    [reduced],
  );

  const advance = useCallback(() => {
    setRun((r) => (r ? { ...r, index: advanceTarget(r.timeline, r.index) } : r));
  }, []);

  const skip = useCallback(() => {
    setRun((r) => (r ? { ...r, index: r.timeline.length - 1 } : r));
  }, []);

  const finishIntro = useCallback(() => {
    setRun((r) => (r && r.index === 0 ? { ...r, index: 1 } : r));
  }, []);

  const end = useCallback(() => setRun(null), []);

  // Sound events + the single advance timer, keyed on the current step.
  const runId = run?.outcome;
  const index = run?.index ?? 0;
  useEffect(() => {
    if (!run) return;
    const step = run.timeline[run.index];
    // Skipping to the result plays nothing; every other step announces itself once.
    if (step.phase !== 'result') for (const s of step.sounds) emitRevealSound(s);
    if (step.headline && step.phase === 'reveal' && step.tier === 'legendary') void haptics.legendary();
    if (run.index >= run.timeline.length - 1) return;
    // Video completion owns the intro; reduced motion uses the ordinary short timer.
    if (run.index === 0 && !reduced) return;
    const t = window.setTimeout(() => setRun((r) => (r && r.outcome === run.outcome && r.index === run.index ? { ...r, index: r.index + 1 } : r)), step.ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step, not the whole run object
  }, [runId, index, reduced]);

  const view = useMemo(() => (run ? viewAt(run.timeline, run.index) : null), [run]);
  return { outcome: run?.outcome ?? null, plan: run?.plan ?? null, view, start, advance, skip, end, finishIntro };
}
