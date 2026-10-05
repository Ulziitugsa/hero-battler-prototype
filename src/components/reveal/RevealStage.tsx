import { RevealFilm } from './RevealFilm';
import { MoonwellVoyage } from '../MoonwellVoyage';
import type { CSSProperties } from 'react';
import { CardArtwork } from '../CardArtwork';
import { GameCard } from '../card/GameCard';
import { cardCopyView } from '../../game/cards/cardCopy';
import { useDialogFocus } from '../useDialogFocus';
import { Gems, Sigil } from '../CardParts';
import './moonwellArrival.css';
import '../../styles/revealRitual.css';
import '../../styles/archiveRitual.css';
import { getCard } from '../../game/cards';
import type { StarterFaction } from '../../game/cards/starterDecks';
import type { Rarity } from '../../game/types';
import { bestRarity, type PackPlan, type SeqView } from '../../game/reveal/sequence';
import type { RevealCard, RevealOutcome } from '../../game/reveal/outcome';

const CAPTION: Record<Rarity, string> = { common: '', rare: '', epic: 'An extraordinary ally.', legendary: 'A legend answers.' };

/** The centred card: a carved back that rises out of the light, then turns to the real face. Only one exists at a time. */
function StageCard({ card: pulled, phase, faction, headline }: { card: RevealCard; phase: SeqView['phase']; faction: StarterFaction; headline: boolean }) {
  const card = getCard(pulled.cardId);
  return (
    <div className={`rc rc-${phase} r-${card.rarity} ${headline ? 'rc-headline' : 'rc-spotlight'}`}>
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
      <span className="rc-name">{CAPTION[card.rarity]}</span>
    </div>
  );
}

/** A card's art in its rarity frame: still art (the moving art belongs to the stage card only). */
function CardFace({ cardId }: { cardId: string }) {
  const card = getCard(cardId);
  return (
    <span className={`cf cf-tile r-${card.rarity}`}>
      <span className={`cf-art ${card.faction}`}>
        <CardArtwork cardId={cardId} animated={false} />
      </span>
    </span>
  );
}

/** A card tile, sealed until its beat, then its face, name and rarity. */
function CardTile({ card, revealed, faction }: { card: RevealCard; revealed: boolean; faction: StarterFaction }) {
  if (!revealed)
    return (
      <div className="tile tile-sealed">
        <span className="tile-sealed-art">
          <Sigil faction={faction} size="md" />
        </span>
      </div>
    );
  const def = getCard(card.cardId);
  return (
    <div className={`tile tile-open r-${card.rarity}`}>
      <span className="tile-art">
        <CardFace cardId={card.cardId} />
        {card.isNew ? (
          <span className="wax-new small" aria-label="New card">
            <span>New</span>
          </span>
        ) : (
          <span className="tile-dup">×{card.owned}</span>
        )}
      </span>
      <span className="tile-name">{def.name}</span>
      <Gems rarity={card.rarity} />
    </div>
  );
}

const HEADING: Partial<Record<SeqView['phase'], string>> = { charging: 'A light beyond the clouds', telegraph: 'The Moonwell stirs', opening: 'The seal breaks' };

/**
 * The pull ceremony: the Moonwell brings the cards up from the Box. Pure presentation of an ALREADY-GRANTED opening,
 * driven by a SeqView from useRevealSequence: data-phase / data-tier on the root are the only things the CSS reacts to,
 * so pacing lives in the timeline (game/reveal/sequence.ts), never here. A pull shows its one card; a 10-pull turns its
 * ten cards over in rising rarity, spotlighting each Epic and giving the rarest the stage last. A tap finishes the
 * current beat; Skip goes straight to Pull Results. Neither can change what was opened.
 */
export function RevealStage({ outcome, plan, view, faction = 'kingdom', onAdvance, onSkip, onIntroFinished }: { outcome: RevealOutcome; plan: PackPlan; view: SeqView; faction?: StarterFaction; onAdvance: () => void; onSkip: () => void; onIntroFinished: () => void }) {
  const dialog = useDialogFocus(onSkip);
  const stageCard = view.stageCard !== null ? outcome.cards[view.stageCard] : null;
  const showStage = !!stageCard && (view.phase === 'emerge' || view.phase === 'reveal');
  const gridOn = view.phase === 'slot' || view.revealed > 0 || view.stageCard !== null;
  const ten = plan.mode === 'ten';
  const count = outcome.cards.length;
  const heading = stageCard ? 'A rare card emerges' : gridOn ? (ten ? 'Your cards arrive' : 'Your card arrives') : (HEADING[view.phase] ?? 'The Moonwell stirs');
  // One meteor per card worth one: the card of a single pull; the Rares and up of a 10-pull.
  const meteors = stageCard ? [stageCard] : ten ? outcome.cards.filter((c) => c.rarity !== 'common') : outcome.cards;

  return (
    <div className={`ritual pack-reveal ${ten ? 'pulls-ten' : 'pulls-one'}`} data-phase={view.phase} data-tier={view.tier} data-faction={faction} data-headline={view.headline ? '1' : '0'} data-stage={view.stageCard !== null ? '1' : '0'} data-grid={gridOn ? '1' : '0'} style={{ ['--step-ms' as string]: `${view.ms}ms` } as CSSProperties} role="dialog" aria-label="Pulling cards">
      <div className="ritual-canvas" ref={dialog} tabIndex={-1} onClick={onAdvance}>
        <RevealFilm active={view.phase === 'charging'} onFinished={onIntroFinished} />

        <div className="ritual-architecture" aria-hidden="true"><span /><span /><span /></div>
        <div className="ritual-heading"><span>{outcome.boxName} · {count} {count === 1 ? 'card' : 'cards'}</span><strong>{heading}</strong></div>
        <div className="ritual-vignette" />
        <div className="ritual-env" />

        <div className={`pack-grid ${ten ? 'ten' : 'one'}`} aria-live="polite">
          {plan.tiles.map((card, i) => (
            <CardTile key={i} card={outcome.cards[card]} revealed={i < view.revealed} faction={faction} />
          ))}
        </div>

        <div className="ritual-center">
          <MoonwellVoyage phase={view.phase} tier={view.tier} duration={view.ms} pulls={meteors.length > 0 ? meteors : [{ rarity: bestRarity(outcome.cards.map((c) => c.rarity)) }]} />
          {showStage && stageCard && <StageCard key={view.stageCard} card={stageCard} phase={view.phase} faction={faction} headline={view.headline} />}
        </div>

        <button type="button" className="ritual-skip" onClick={(e) => { e.stopPropagation(); onSkip(); }} aria-label="Skip to Pull Results">Skip <span aria-hidden="true">↠</span></button>
      </div>
    </div>
  );
}
