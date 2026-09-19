import type { HeroInstance, Side } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { RARITY_GEMS } from './cardVisuals';
import type { ChitVisual } from './animation/chitEffects';
import { Icon } from './Icon';
import '../styles/ascension.css';

/** A Hero zone's filled state - a compact version of the card frame (art, gems, power coin, name),
 * tinted gold for the player's own Heroes and ember for the enemy's (Battle Screen v8). `anim`, when
 * present, is this round's currently-playing animation beat for this specific Hero (see
 * `components/animation` - built from the engine's own event log, never from the card's identity).
 * `hero.shielded`/`hero.silenced` are persistent engine state (not animation), so their quiet standing
 * indicators render independently of whatever beat is currently playing. */
export function BoardChit({ hero, side, anim, disabled, onClick }: { hero: HeroInstance; side: Side; anim?: ChitVisual | null; disabled?: boolean; onClick: () => void }) {
  const card = getCard(hero.cardId);
  const mine = side === 'player';
  const gemCount = RARITY_GEMS[card.rarity];
  const artUrl = cardArtUrl(hero.cardId);

  return (
    <button
      type="button"
      className={`zone-card hero-zone-card ${mine ? 'mine' : 'theirs'} ${hero.shielded ? 'chit-shield-active' : ''} ${hero.silenced ? 'chit-silenced-persistent' : ''} ${anim?.className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${card.name}, Power ${hero.power}`}
    >
      <span className={`zone-card-art ${hero.faction}`}>
        {artUrl ? (
          <img className="zone-card-art-image" src={artUrl} alt="" draggable={false} />
        ) : (
          <>
            <span className="zone-card-figure-head" />
            <span className="zone-card-figure-body" />
          </>
        )}
      </span>
      <span className="zone-card-gems">
        {Array.from({ length: gemCount }, (_, i) => (
          <span key={i} className="gem" />
        ))}
      </span>
      {hero.ascension ? <span className="zone-card-asc" title="Ascended">{['', 'I', 'II', 'III'][hero.ascension]}</span> : null}
      <span className="zone-card-power">{hero.power}</span>
      {hero.tempPower !== 0 && (
        <span className="zone-card-buff">
          {hero.tempPower > 0 ? '+' : ''}
          {hero.tempPower}
        </span>
      )}
      {card.boardText ? (
        <span className="zone-card-footer">
          <span className="zone-card-name">{hero.shortName}</span>
          <span className="zone-card-effect">{hero.silenced ? 'Silenced' : card.boardText}</span>
        </span>
      ) : (
        <span className="zone-card-name bare">{hero.shortName}</span>
      )}
      {hero.shielded && <span className="chit-shield-ring" aria-hidden="true" />}
      {hero.silenced && (
        <span className="chit-silence-icon" aria-hidden="true">
          <Icon name="mute" size={11} />
        </span>
      )}
      {anim?.floaters.map((f) => (
        <span key={f.key} className={`floater floater-${f.kind}`}>
          {f.text}
        </span>
      ))}
    </button>
  );
}
