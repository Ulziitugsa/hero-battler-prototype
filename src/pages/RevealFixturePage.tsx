import { useEffect, useMemo, useState } from 'react';
import { RevealStage } from '../components/reveal/RevealStage';
import { useRevealSequence } from '../components/reveal/useRevealSequence';
import { CardViewer } from '../components/card/CardViewer';
import { pullRevealOutcome } from '../game/reveal/outcome';
import { revealFixtureBoxName, revealFixturePulls, type RevealFixture } from '../game/reveal/fixtures';
import { PullResults } from './shop/BoxDetail';
import '../styles/box.css';

/**
 * DEV / QA ONLY (`?revealFixture=one|ten` on a dev build): the real pull ceremony and Pull Results played over a
 * fixed opening, so screenshots show a known pull every time. Nothing is opened, granted, saved or tracked.
 */
export function RevealFixturePage({ kind, onBack }: { kind: RevealFixture; onBack: () => void }) {
  const pulls = useMemo(() => revealFixturePulls(kind), [kind]);
  const reveal = useRevealSequence();
  const [inspect, setInspect] = useState<string | null>(null);
  const { start } = reveal;
  useEffect(() => { start(pullRevealOutcome(revealFixtureBoxName(), pulls)); }, [start, pulls]);
  return <main className="shop-screen box-screen">
    {reveal.outcome && reveal.plan && reveal.view && !reveal.view.isResult && <RevealStage outcome={reveal.outcome} plan={reveal.plan} view={reveal.view} onAdvance={reveal.advance} onSkip={reveal.skip} onIntroFinished={reveal.finishIntro} />}
    {reveal.view?.isResult && <PullResults pulls={pulls} onInspect={setInspect} onClose={onBack} preview />}
    {inspect && <CardViewer cardId={inspect} context="pack" onClose={() => setInspect(null)} />}
  </main>;
}
