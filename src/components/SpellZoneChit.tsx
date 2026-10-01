import type { SpellZoneInstance, Side } from '../game/types';
import { getCard } from '../game/cards';
import { useBattleCardDisplay } from './combatDisplay';
import type { ChitVisual } from './animation/chitEffects';
import { GameCard } from './card/GameCard';

/**
 * A Spell zone's filled state: the shared card face (GameCard, spell density), a wide strip with the Spell's name and
 * every effect in its battle wording, in every battle mode (`display.rules` picks card combat's rules or a legacy
 * battle's). Kind is always re-derived from the card definition rather than trusted from the instance, because this
 * same component renders two different things that share the `SpellZoneInstance` shape: a real Continuous Spell
 * occupying its zone, and a ONE_TIME Spell staged this round as a `pending-` preview (see `buildPreviewZones` in
 * GamePage). `anim`, when present, is this round's currently-playing animation beat for this Spell.
 */
export function SpellZoneChit({ spell, side, anim, disabled, focused, onClick }: { spell: SpellZoneInstance; side: Side; anim?: ChitVisual | null; disabled?: boolean; /** The card the focus panel shows. */ focused?: boolean; onClick: () => void }) {
  const card = getCard(spell.cardId);
  const mine = side === 'player';
  const continuous = card.spellKind === 'CONTINUOUS';
  const ready = !continuous && mine; // a staged one-time Spell, ready to resolve on Fight
  const display = useBattleCardDisplay();
  const staged = spell.instanceId.startsWith('pending-');

  return (
    <button
      type="button"
      className={`zone-card spell-zone-card card-face ${mine ? 'mine' : 'theirs'} ${continuous ? 'clamped' : 'floating'} ${focused ? 'is-focused' : ''} ${anim?.className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${card.name}, ${continuous ? 'Continuous Spell' : 'Spell'}.${staged ? ' Tap to take it back.' : ' Tap for details.'}`}
    >
      <GameCard cardId={spell.cardId} density="spell" rules={display?.rules ?? 'card'} name={spell.shortName} />
      {ready && <span className="zone-card-ready">Ready</span>}
      {anim?.floaters.map((f) => (
        <span key={f.key} className={`floater floater-${f.kind}`}>
          {f.text}
        </span>
      ))}
    </button>
  );
}
