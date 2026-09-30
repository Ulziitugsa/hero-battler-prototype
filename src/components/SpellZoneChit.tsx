import type { SpellZoneInstance, Side } from '../game/types';
import { getCard } from '../game/cards';
import { Icon } from './Icon';
import { cardEffectSummary } from '../game/cards/effectText';
import { cardCombatEffectSummary } from '../game/cardCombat/cardText';
import { useCardCombatDisplay } from './combatDisplay';
import type { ChitVisual } from './animation/chitEffects';
import { BattleCard } from './card/BattleCard';

/**
 * A Spell zone's filled state (Battle Screen v8). Kind is always re-derived from the card definition
 * rather than trusted from the instance, because this same component renders two different things
 * that share the `SpellZoneInstance` shape: a real Continuous Spell occupying its zone, and a
 * ONE_TIME Spell staged this round as a `pending-` preview (see `buildPreviewZones` in GamePage) -
 * both need their kind's own treatment (floating+Ready vs clamped+rune ring). `anim`, when present, is
 * this round's currently-playing animation beat for this Spell (see `components/animation`).
 */
export function SpellZoneChit({ spell, side, anim, disabled, onClick }: { spell: SpellZoneInstance; side: Side; anim?: ChitVisual | null; disabled?: boolean; onClick: () => void }) {
  const card = getCard(spell.cardId);
  const mine = side === 'player';
  const continuous = card.spellKind === 'CONTINUOUS';
  const ready = !continuous && mine; // a staged one-time Spell, ready to resolve on Fight
  const cardCombat = useCardCombatDisplay();
  const summary = cardCombat ? cardCombatEffectSummary(card) : cardEffectSummary(card);

  if (cardCombat) {
    // Card combat (Battle UX pass): the Spell's rules on its face, not a summary.
    return (
      <button
        type="button"
        className={`zone-card spell-zone-card card-face ${mine ? 'mine' : 'theirs'} ${continuous ? 'clamped' : 'floating'} ${anim?.className ?? ''}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={`${card.name}, ${continuous ? 'Continuous' : 'staged'}. Tap to inspect.`}
      >
        <BattleCard cardId={spell.cardId} variant="spell" name={spell.shortName} />
        {ready && <span className="zone-card-ready">Ready</span>}
        {anim?.floaters.map((f) => (
          <span key={f.key} className={`floater floater-${f.kind}`}>
            {f.text}
          </span>
        ))}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`zone-card spell-zone-card ${mine ? 'mine' : 'theirs'} ${continuous ? 'clamped' : 'floating'} ${anim?.className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${card.name}, ${continuous ? 'Continuous' : 'staged'}${summary ? `: ${summary}` : ''}`}
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
      {summary ? (
        <span className="zone-card-footer">
          <span className="zone-card-name">
            <Icon name={continuous ? 'continuousSpell' : 'spell'} size={11} />
            {spell.shortName}
          </span>
          <span className="zone-card-effect">{summary}</span>
        </span>
      ) : (
        <span className="zone-card-name bare">
          <Icon name={continuous ? 'continuousSpell' : 'spell'} size={11} />
          {spell.shortName}
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
