import type { SpellZoneInstance, Side } from '../game/types';
import { getCard } from '../game/cards';
import { Icon } from './Icon';

/**
 * A Spell zone's filled state (Battle Screen v8). Kind is always re-derived from the card definition
 * rather than trusted from the instance, because this same component renders two different things
 * that share the `SpellZoneInstance` shape: a real Continuous Spell occupying its zone, and a
 * ONE_TIME Spell staged this round as a `pending-` preview (see `buildPreviewZones` in GamePage) -
 * both need their kind's own treatment (floating+Ready vs clamped+rune ring).
 */
export function SpellZoneChit({ spell, side, onClick }: { spell: SpellZoneInstance; side: Side; onClick: () => void }) {
  const card = getCard(spell.cardId);
  const mine = side === 'player';
  const continuous = card.spellKind === 'CONTINUOUS';
  const ready = !continuous && mine; // a staged one-time Spell, ready to resolve on Fight

  return (
    <button
      type="button"
      className={`zone-card spell-zone-card ${mine ? 'mine' : 'theirs'} ${continuous ? 'clamped' : 'floating'}`}
      onClick={onClick}
      aria-label={continuous ? `${card.name}, Continuous` : `${card.name}, staged`}
    >
      {continuous && (
        <>
          <span className="zone-card-bracket left" />
          <span className="zone-card-bracket right" />
        </>
      )}
      <span className={`zone-card-art spell-art ${spell.faction}`}>
        <span className={`spell-sigil ${continuous ? 'cont' : 'once'}`} />
        {continuous && <span className="spell-rune-ring" />}
      </span>
      {ready && <span className="zone-card-ready">Ready</span>}
      {card.boardText ? (
        <span className="zone-card-footer">
          <span className="zone-card-name">
            <Icon name={continuous ? 'continuousSpell' : 'spell'} size={11} />
            {spell.shortName}
          </span>
          <span className="zone-card-effect">{card.boardText}</span>
        </span>
      ) : (
        <span className="zone-card-name bare">
          <Icon name={continuous ? 'continuousSpell' : 'spell'} size={11} />
          {spell.shortName}
        </span>
      )}
    </button>
  );
}
