import { RevealFilm } from './RevealFilm';
import { MoonwellVoyage } from '../MoonwellVoyage';
import type { CSSProperties } from 'react';
import { GameCard } from '../card/GameCard';
import { cardCopyView } from '../../game/cards/cardCopy';
import { useDialogFocus } from '../useDialogFocus';
import { Sigil } from '../CardParts';
import './moonwellArrival.css';
import '../../styles/revealRitual.css';
import '../../styles/archiveRitual.css';
import { getCard } from '../../game/cards';
import type { StarterFaction } from '../../game/cards/starterDecks';
import type { SeqView } from '../../game/reveal/sequence';
import type { RevealCard, RevealOutcome } from '../../game/reveal/outcome';

/** The centred card: a carved back that rises out of the seal, then flips to the real face. */
function StageCard({ card: pulled, phase, faction }: { card: RevealCard; phase: SeqView['phase']; faction: StarterFaction }) {
  const card = getCard(pulled.cardId);
  return (
    <div className={`rc rc-${phase} r-${card.rarity}`}>
      <div className="rc-inner">
        <div className="rc-face rc-front">
          <GameCard cardId={pulled.cardId} density="tile" hpContribution={cardCopyView(pulled.cardId).hpContribution} />
          {pulled.isNew && (
            <span className="wax-new" aria-label="New card">
              <span>New</span>
            </span>
          )}
        </div>
        <div className="rc-face rc-back">
          <span className={`rc-back-art ${faction}`}>
            <Sigil faction={faction} size="lg" />
          </span>
        </div>
      </div>
      <span className="rc-name">{card.rarity === 'legendary' ? 'A legend answers.' : 'An extraordinary ally.'}</span>
    </div>
  );
}

/** One meteor per card worth one (Rare and up, at most ten), else a single light in the opening's best rarity. */
function meteorCards(outcome: RevealOutcome, tier: SeqView['tier']): { rarity: SeqView['tier'] }[] {
  const notable = outcome.cards.filter((c) => c.rarity !== 'common').slice(0, 10);
  return notable.length > 0 ? notable : [{ rarity: tier }];
}

const HEADING: Partial<Record<SeqView['phase'], string>> = { charging: 'A light beyond the clouds', telegraph: 'Across the midnight sky', opening: 'The seal breaks' };

/**
 * The pack-opening ceremony (once the Moonwell Summon's ritual). Pure presentation of an ALREADY-GRANTED opening,
 * driven by a SeqView from useRevealSequence: data-phase / data-tier on the root are the only things the CSS reacts
 * to, so pacing lives in the timeline and never in this component. The light telegraphs the best rarity in the
 * opening, and each Epic or Legendary card takes the stage; then the caller shows Pack Results. Any tap or the Skip
 * button jumps straight to the results (never backward, never changes rewards).
 */
export function RevealStage({ outcome, view, faction = 'kingdom', onSkip, onIntroFinished }: { outcome: RevealOutcome; view: SeqView; faction?: StarterFaction; onSkip: () => void; onIntroFinished: () => void }) {
  const dialog = useDialogFocus(onSkip);
  const stageCard = view.stageSlot !== null ? outcome.cards[view.stageSlot] : null;
  const showStage = !!stageCard && (view.phase === 'emerge' || view.phase === 'reveal');
  const heading = stageCard ? 'A rare card emerges' : (HEADING[view.phase] ?? 'Your cards arrive');

  return (
    <div className="ritual single pack-reveal" data-phase={view.phase} data-tier={view.tier} data-faction={faction} data-featured="0" data-stage={view.stageSlot !== null ? '1' : '0'} data-grid="0" style={{ ['--step-ms' as string]: `${view.ms}ms` } as CSSProperties} role="dialog" aria-label="Opening packs">
      <div className="ritual-canvas" ref={dialog} tabIndex={-1} onClick={onSkip}>
        <RevealFilm active={view.phase === 'charging'} onFinished={onIntroFinished} />

        <div className="ritual-architecture" aria-hidden="true"><span /><span /><span /></div>
        <div className="ritual-heading"><span>{outcome.boxName} · {outcome.packs} {outcome.packs === 1 ? 'pack' : 'packs'}</span><strong>{heading}</strong></div>
        <div className="ritual-vignette" />
        <div className="ritual-env" />

        <div className="ritual-center">
          <MoonwellVoyage phase={view.phase} tier={view.tier} duration={view.ms} pulls={stageCard ? [stageCard] : meteorCards(outcome, view.tier)} />
          {showStage && stageCard && <StageCard key={view.stageSlot} card={stageCard} phase={view.phase} faction={faction} />}
        </div>

        <button type="button" className="ritual-skip" onClick={(e) => { e.stopPropagation(); onSkip(); }} aria-label="Skip to Pack Results">Skip <span aria-hidden="true">↠</span></button>
      </div>
    </div>
  );
}
