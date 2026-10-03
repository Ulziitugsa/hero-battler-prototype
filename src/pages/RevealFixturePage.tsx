import { useEffect, useMemo, useState } from 'react';
import { RevealStage } from '../components/reveal/RevealStage';
import { useRevealSequence } from '../components/reveal/useRevealSequence';
import { CardViewer } from '../components/card/CardViewer';
import { packRevealOutcome } from '../game/reveal/outcome';
import { revealFixturePulls, type RevealFixture } from '../game/reveal/fixtures';
import { MOONFALL_BOX } from '../game/box/boxProduct';
import { PackResults } from './shop/BoxDetail';
import '../styles/box.css';

/**
 * DEV / QA ONLY (`?revealFixture=one|ten` on a dev build): the real pack-opening ceremony and Pack Results played over a
 * fixed opening, so screenshots show a known pack every time. Nothing is opened, granted, saved or tracked.
 */
export function RevealFixturePage({ kind, onBack }: { kind: RevealFixture; onBack: () => void }) {
  const pulls = useMemo(() => revealFixturePulls(kind), [kind]);
  const packs = kind === 'one' ? 1 : 10;
  const reveal = useRevealSequence();
  const [inspect, setInspect] = useState<string | null>(null);
  const { start } = reveal;
  useEffect(() => { start(packRevealOutcome(MOONFALL_BOX.name, packs, pulls)); }, [start, packs, pulls]);
  return <main className="shop-screen box-screen">
    {reveal.outcome && reveal.plan && reveal.view && !reveal.view.isResult && <RevealStage outcome={reveal.outcome} plan={reveal.plan} view={reveal.view} onAdvance={reveal.advance} onSkip={reveal.skip} onIntroFinished={reveal.finishIntro} />}
    {reveal.view?.isResult && <PackResults pulls={pulls} packs={packs} onInspect={setInspect} onClose={onBack} preview />}
    {inspect && <CardViewer cardId={inspect} context="pack" onClose={() => setInspect(null)} />}
  </main>;
}
