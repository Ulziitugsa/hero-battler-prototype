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

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
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

/** One pack: a card tile, sealed until its beat, then its face, name and rarity. */
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

/** Ten packs: a pack tile, sealed until its beat, then the best card it held and one pip per card by rarity. */
function PackTile({ cards, number, revealed, faction }: { cards: RevealCard[]; number: number; revealed: boolean; faction: StarterFaction }) {
  if (!revealed)
    return (
      <div className="pack-tile sealed">
        <span className="pack-tile-art">
          <Sigil faction={faction} size="sm" />
        </span>
        <span className="pack-tile-label">Pack {number}</span>
      </div>
    );
  const best = [...cards].sort((a, b) => RANK[b.rarity] - RANK[a.rarity])[0];
  const newCount = cards.filter((c) => c.isNew).length;
  return (
    <div className={`pack-tile open r-${best.rarity}`}>
      <span className="pack-tile-art">
        <CardFace cardId={best.cardId} />
      </span>
      <span className="pack-pips" aria-hidden="true">
        {cards.map((c, i) => (
          <i key={i} className={`r-${c.rarity}`} />
        ))}
      </span>
      <span className="pack-tile-label">{newCount > 0 ? `${newCount} new` : `Pack ${number}`}</span>
    </div>
  );
}

const HEADING: Partial<Record<SeqView['phase'], string>> = { charging: 'A light beyond the clouds', telegraph: 'The Moonwell stirs', opening: 'The seal breaks' };

/**
 * The pack-opening ceremony: the Moonwell opens the pack. Pure presentation of an ALREADY-GRANTED opening, driven by a
 * SeqView from useRevealSequence: data-phase / data-tier on the root are the only things the CSS reacts to, so pacing
 * lives in the timeline (game/reveal/sequence.ts), never here. One pack turns its five cards over in rising rarity and
 * gives the rarest the stage last; ten packs open pack by pack, spotlighting each Epic and Legendary. A tap finishes the
 * current beat; Skip goes straight to Pack Results. Neither can change what was opened.
 */
export function RevealStage({ outcome, plan, view, faction = 'kingdom', onAdvance, onSkip, onIntroFinished }: { outcome: RevealOutcome; plan: PackPlan; view: SeqView; faction?: StarterFaction; onAdvance: () => void; onSkip: () => void; onIntroFinished: () => void }) {
  const dialog = useDialogFocus(onSkip);
  const stageCard = view.stageCard !== null ? outcome.cards[view.stageCard] : null;
  const showStage = !!stageCard && (view.phase === 'emerge' || view.phase === 'reveal');
  const gridOn = view.phase === 'slot' || view.revealed > 0 || view.stageCard !== null;
  const ten = plan.mode === 'ten';
  const heading = stageCard ? 'A rare card emerges' : gridOn ? (ten ? `${outcome.packs} packs open` : 'Your cards arrive') : (HEADING[view.phase] ?? 'The Moonwell stirs');
  // One meteor per card worth one: all five for one pack; the Rares and up (at most ten) for ten packs.
  const meteors = stageCard ? [stageCard] : ten ? outcome.cards.filter((c) => c.rarity !== 'common').slice(0, 10) : outcome.cards;

  return (
    <div className={`ritual pack-reveal ${ten ? 'packs-ten' : 'packs-one'}`} data-phase={view.phase} data-tier={view.tier} data-faction={faction} data-headline={view.headline ? '1' : '0'} data-stage={view.stageCard !== null ? '1' : '0'} data-grid={gridOn ? '1' : '0'} style={{ ['--step-ms' as string]: `${view.ms}ms` } as CSSProperties} role="dialog" aria-label="Opening packs">
      <div className="ritual-canvas" ref={dialog} tabIndex={-1} onClick={onAdvance}>
        <RevealFilm active={view.phase === 'charging'} onFinished={onIntroFinished} />

        <div className="ritual-architecture" aria-hidden="true"><span /><span /><span /></div>
        <div className="ritual-heading"><span>{outcome.boxName} · {outcome.packs} {outcome.packs === 1 ? 'pack' : 'packs'}</span><strong>{heading}</strong></div>
        <div className="ritual-vignette" />
        <div className="ritual-env" />

        <div className={`pack-grid ${ten ? 'ten' : 'one'}`} aria-live="polite">
          {plan.tiles.map((tile, i) =>
            ten ? (
              <PackTile key={i} cards={tile.map((c) => outcome.cards[c])} number={i + 1} revealed={i < view.revealed} faction={faction} />
            ) : (
              <CardTile key={i} card={outcome.cards[tile[0]]} revealed={i < view.revealed} faction={faction} />
            ),
          )}
        </div>

        <div className="ritual-center">
          <MoonwellVoyage phase={view.phase} tier={view.tier} duration={view.ms} pulls={meteors.length > 0 ? meteors : [{ rarity: bestRarity(outcome.cards.map((c) => c.rarity)) }]} />
          {showStage && stageCard && <StageCard key={view.stageCard} card={stageCard} phase={view.phase} faction={faction} headline={view.headline} />}
        </div>

        <button type="button" className="ritual-skip" onClick={(e) => { e.stopPropagation(); onSkip(); }} aria-label="Skip to Pack Results">Skip <span aria-hidden="true">↠</span></button>
      </div>
    </div>
  );
}
