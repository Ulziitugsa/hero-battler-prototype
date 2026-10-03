import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from '../animation/timing';
import { buildPackTimeline, viewAt, type SeqStep, type SeqView } from '../../game/reveal/sequence';
import { emitRevealSound } from '../../game/reveal/sound';
import type { RevealOutcome } from '../../game/reveal/outcome';

// The ONE owner of the reveal ceremony's clock. It walks the pure timeline (game/reveal/sequence.ts) with a single
// timer at a time; components only render the SeqView it returns. The outcome handed to start() is already granted
// and saved - nothing here can change what was opened, and skipping only moves the presentation forward.

interface Run {
  outcome: RevealOutcome;
  timeline: SeqStep[];
  index: number;
}

export function useRevealSequence(): { outcome: RevealOutcome | null; view: SeqView | null; start: (outcome: RevealOutcome) => void; skip: () => void; end: () => void; finishIntro: () => void } {
  const reduced = useReducedMotion();
  const [run, setRun] = useState<Run | null>(null);

  const start = useCallback(
    (outcome: RevealOutcome) => {
      const timeline = buildPackTimeline(outcome.cards.map((c) => ({ rarity: c.rarity, mainFeatured: false })), reduced);
      setRun({ outcome, timeline, index: 0 });
    },
    [reduced],
  );

  const skip = useCallback(() => {
    setRun((r) => (r ? { ...r, index: r.timeline.length - 1 } : r));
  }, []);

  const finishIntro = useCallback(() => {
    setRun(r => r && r.index === 0 ? { ...r, index: 1 } : r);
  }, []);

  const end = useCallback(() => setRun(null), []);

  // Sound-event schedule + the single advance timer, keyed on the current step.
  const runId = run?.outcome;
  const index = run?.index ?? 0;
  useEffect(() => {
    if (!run) return;
    const step = run.timeline[run.index];
    for (const s of step.sounds) emitRevealSound(s);
    if (run.index >= run.timeline.length - 1) return;
    // Video completion owns the intro; reduced motion uses the ordinary short timer.
    if (run.index === 0 && !reduced) return;
    const t = window.setTimeout(() => setRun((r) => (r && r.outcome === run.outcome && r.index === run.index ? { ...r, index: r.index + 1 } : r)), step.ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step, not the whole run object
  }, [runId, index, reduced]);

  const view = useMemo(() => (run ? viewAt(run.timeline, run.index, run.outcome.cards.length) : null), [run]);
  return { outcome: run?.outcome ?? null, view, start, skip, end, finishIntro };
}
