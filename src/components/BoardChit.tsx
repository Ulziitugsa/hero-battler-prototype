import type { HeroInstance, Side } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { RARITY_GEMS } from './cardVisuals';

export interface ChitFx {
  kind: 'dmg' | 'buf';
  text: string;
}

/** A Hero zone's filled state - a compact version of the card frame (art, gems, power coin, name),
 * tinted gold for the player's own Heroes and ember for the enemy's (Battle Screen v8). */
export function BoardChit({ hero, side, fx, onClick }: { hero: HeroInstance; side: Side; fx?: ChitFx | null; onClick: () => void }) {
  const card = getCard(hero.cardId);
  const mine = side === 'player';
  const flashClass = fx ? (fx.kind === 'dmg' ? 'flash-damage' : 'flash-buff') : '';
  const gemCount = RARITY_GEMS[card.rarity];
  const artUrl = cardArtUrl(hero.cardId);

  return (
    <button type="button" className={`zone-card hero-zone-card ${mine ? 'mine' : 'theirs'} ${flashClass}`} onClick={onClick} aria-label={`${card.name}, Power ${hero.power}`}>
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
          <span className="zone-card-effect">{card.boardText}</span>
        </span>
      ) : (
        <span className="zone-card-name bare">{hero.shortName}</span>
      )}
      {fx && <span className={`floater ${fx.kind}`}>{fx.text}</span>}
    </button>
  );
}
