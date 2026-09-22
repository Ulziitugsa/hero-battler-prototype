import { SummonFilm } from '../../components/SummonFilm';
import { CardArtwork } from '../../components/CardArtwork';
import { MoonwellVoyage } from '../../components/MoonwellVoyage';
import { useState, type CSSProperties } from 'react';
import { CardDetail } from '../../components/CardDetail';
import { CollectibleCard } from '../../components/CollectibleCard';
import { useDialogFocus } from '../../components/useDialogFocus';
import { Gems, Sigil } from '../../components/CardParts';
import { Icon } from '../../components/Icon';
import './moonwellArrival.css';
import { getCard } from '../../game/cards';
import { cardArtUrl } from '../../game/cards/art';
import type { StarterFaction } from '../../game/cards/starterDecks';
import type { SeqView } from '../../game/summon/sequence';
import type { SummonPull, SummonSuccess } from '../../game/summon/summon';
import { RARITY_LABEL } from '../../game/summon/view';

const FACTION_LABEL: Record<string, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };

/** A card face: real art, else the faction-tinted field with its sigil - the same fallback the rest of the app uses. */
function CardFace({ cardId, size }: { cardId: string; size: 'stage' | 'tile' }) {
  const card = getCard(cardId);
  const url = cardArtUrl(cardId);
  return (
    <span className={`cf cf-${size} r-${card.rarity}`}>
      <span className={`cf-art ${card.faction}`}>{url ? <CardArtwork cardId={cardId} /> : <Sigil faction={card.type !== 'hero' ? 'spell' : card.faction} size={size === 'stage' ? 'lg' : 'md'} />}</span>
    </span>
  );
}

/** The centred card: a carved back that rises out of the seal, then flips to the real face. */
function StageCard({ pull, phase, faction }: { pull: SummonPull; phase: SeqView['phase']; faction: StarterFaction }) {
  const card = getCard(pull.cardId);
  return (
    <div className={`rc rc-${phase} r-${card.rarity}`}>
      <div className="rc-inner">
        <div className="rc-face rc-front">
          <CollectibleCard cardId={pull.cardId} />
          {pull.grant.isNew && (
            <span className="wax-new" aria-label="New card">
              <span>New</span>
            </span>
          )}
          {pull.featured === 'main' && (
            <span className="rc-featured" aria-label="Featured">
              Featured
            </span>
          )}
        </div>
        <div className="rc-face rc-back">
          <span className={`rc-back-art ${faction}`}>
            <Sigil faction={faction} size="lg" />
          </span>
        </div>
      </div>
      <span className="rc-name">{card.rarity === 'legendary' ? 'A legend answers.' : card.rarity === 'epic' ? 'An extraordinary ally.' : 'Your story grows.'}</span>
    </div>
  );
}

function GridTile({ pull, revealed, onInspect, faction }: { pull: SummonPull; revealed: boolean; onInspect: (id: string) => void; faction: StarterFaction }) {
  const card = getCard(pull.cardId);
  if (!revealed)
    return (
      <div className="tile tile-sealed">
        <span className="tile-sealed-art">
          <Sigil faction={faction} size="md" />
        </span>
      </div>
    );
  return (
    <button type="button" className={`tile tile-open r-${card.rarity}`} onClick={() => onInspect(pull.cardId)} aria-label={`Inspect ${card.name}`}>
      <span className="tile-art">
        <CardFace cardId={pull.cardId} size="tile" />
        {pull.grant.isNew && (
          <span className="wax-new small" aria-label="New card">
            <span>New</span>
          </span>
        )}
        {!pull.grant.isNew && <span className="tile-dup">×{pull.grant.owned}</span>}
        {pull.ascensionAvailable && (
          <span className="tile-asc" aria-label="Ascension available">
            <Icon name="power" size={11} />
          </span>
        )}
        {pull.featured && <span className={`tile-feat ${pull.featured}`} aria-label="Featured" />}
      </span>
      <span className="tile-name">{card.name}</span>
      <Gems rarity={card.rarity} />
    </button>
  );
}

/**
 * The full-screen summon ritual. Pure presentation of an ALREADY-RESOLVED outcome, driven by a SeqView from
 * useSummonSequence: data-phase / data-tier on the root are the only things the CSS reacts to, so pacing lives
 * in the timeline and never in this component. Any tap skips forward (never backward, never changes rewards).
 */
export function RitualStage({ outcome, view, faction, onSkip, onDone, onIntroFinished, preview = false }: { outcome: SummonSuccess; view: SeqView; faction: StarterFaction; onSkip: () => void; onDone: () => void; onIntroFinished: () => void; preview?: boolean }) {
  const [inspectId, setInspectId] = useState<string | null>(null);
  const ten = outcome.pulls.length > 1;
  const stagePull = view.stageSlot !== null ? outcome.pulls[view.stageSlot] : null;
  const result = view.isResult;
  const dialog = useDialogFocus(result ? onDone : onSkip);
  const newCount = outcome.pulls.filter((p) => p.grant.isNew).length;
  const ascendable = [...new Set(outcome.pulls.filter((p) => p.ascensionAvailable).map((p) => p.cardId))];
  const single = outcome.pulls[0];
  const singleCard = getCard(single.cardId);

  // Which rarity the LIGHT should show: the step's tier (opening beats of a 10x show the best rarity in the batch).
  const tier = view.tier;
  const showStage = !!stagePull && (view.phase === 'emerge' || view.phase === 'reveal' || (!ten && result));

  const infoEl = result ? (
          <div className="ritual-info">
            {!ten && (
              <div className="ri-card">
                <span className="ri-line">
                  <Gems rarity={singleCard.rarity} />
                  <strong className={`ri-rarity r-${singleCard.rarity}`}>{RARITY_LABEL[singleCard.rarity]}</strong>
                  <span>· {FACTION_LABEL[singleCard.faction] ?? singleCard.faction}</span>
                </span>
                <span className="ri-chips">
                  {single.grant.isNew ? <span className="chip gold">New to your collection</span> : <span className="chip">Owned ×{single.grant.owned}</span>}
                  {single.featured && <span className="chip gold">Featured</span>}
                  {single.pityTriggered && <span className="chip gold">Guarantee reached</span>}
                  {single.ascensionAvailable && (
                    <span className="chip">
                      <Icon name="power" size={12} /> Ascension available
                    </span>
                  )}
                </span>
              </div>
            )}
            {ten && (
              <span className="ri-chips">
                <span className="chip">
                  {newCount} new · {outcome.pulls.length - newCount} duplicate{outcome.pulls.length - newCount === 1 ? '' : 's'}
                </span>
                {outcome.pulls.some((p) => p.pityTriggered) && <span className="chip gold">Guarantee reached</span>}
                {ascendable.map((id) => (
                  <span key={id} className="chip">
                    <Icon name="power" size={12} /> Ascension · {getCard(id).name}
                  </span>
                ))}
              </span>
            )}
            {outcome.starterProgress.map((s) => (
              <span key={s.deckId} className={`chip wide ${s.unlockedNow ? 'gold' : ''}`}>
                {s.unlockedNow ? (
                  <>
                    <Icon name="check" size={12} /> <strong>{s.name} unlocked</strong> — ready in Decks
                  </>
                ) : (
                  <>
                    {s.name} · {s.collected} / {s.total}
                  </>
                )}
              </span>
            ))}
            <button type="button" className="ritual-continue" onClick={onDone} autoFocus>
              {ten ? 'Done' : 'Continue'}
            </button>
            {preview && <span className="chip">Dev preview — nothing was granted</span>}
          </div>
  ) : null;

  return (
    <div className={`ritual ${ten ? 'ten' : 'single'} ${result ? 'is-result' : ''}`} data-phase={view.phase} data-tier={tier} data-faction={faction} data-featured={view.featured ? '1' : '0'} data-stage={view.stageSlot !== null && ten ? '1' : '0'} data-grid={ten && (view.phase === 'slot' || view.isResult || view.stageSlot !== null || view.revealed > 0) ? '1' : '0'} style={{ ['--step-ms' as string]: `${view.ms}ms` } as CSSProperties} role="dialog" aria-label="Summon results">
      <div className="ritual-canvas" ref={dialog} tabIndex={-1}>
        <SummonFilm active={view.phase === 'charging'} onFinished={onIntroFinished} />
        
        <div className="ritual-architecture" aria-hidden="true"><span /><span /><span /></div>
        <div className="ritual-heading"><span>The Moonwell</span><strong>{result ? 'A new chapter begins' : view.phase === 'charging' ? 'A light beyond the clouds' : view.phase === 'telegraph' ? 'Across the midnight sky' : 'A new companion awaits'}</strong></div>
        <div className="ritual-vignette" />
        <div className="ritual-env" />

        <div className="ritual-center">
          <MoonwellVoyage phase={view.phase} tier={tier} duration={view.ms} pulls={view.stageSlot !== null ? [outcome.pulls[view.stageSlot]] : outcome.pulls} />
          {showStage && stagePull && <StageCard key={view.stageSlot} pull={stagePull} phase={view.phase} faction={faction} />}
        </div>

        {ten ? (
          <div className="ritual-ten">
            <div className="ritual-ten-title">Summon result</div>
            <div className="ritual-grid" aria-live="polite">
              {outcome.pulls.map((p, i) => (
                <GridTile key={i} pull={p} revealed={i < view.revealed} onInspect={result ? setInspectId : () => {}} faction={faction} />
              ))}
            </div>
            {infoEl}
          </div>
        ) : (
          infoEl
        )}

        {!result && <button type="button" className="ritual-skip" onClick={onSkip} aria-label="Skip">Skip animation <span aria-hidden="true">↠</span></button>}
      </div>

      {inspectId && <CardDetail cardId={inspectId} onClose={() => setInspectId(null)} />}
    </div>
  );
}


