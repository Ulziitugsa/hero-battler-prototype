import type { GameEvent, Side } from '../game/types';
import type { ChitFx } from './BoardChit';

export interface ChitFxTarget {
  side: Side;
  instanceId: string;
  fx: ChitFx;
}

/** Which board chit (if any) should flash for the event that was just applied during FIGHT playback. */
export function chitFxFromEvent(event: GameEvent): ChitFxTarget | null {
  if (event.type === 'POWER_CHANGED') {
    const delta = event.to - event.from;
    if (delta === 0) return null;
    return {
      side: event.side,
      instanceId: event.instanceId,
      fx: { kind: delta > 0 ? 'buf' : 'dmg', text: `${delta > 0 ? '+' : ''}${delta}` },
    };
  }
  return null;
}

/** Which side's HP bar (if any) should flash for the event that was just applied. */
export function hpFxFromEvent(event: GameEvent): Side | null {
  if (event.type === 'DIRECT_DAMAGE') return event.side;
  if (event.type === 'OVERFLOW_DAMAGE') return event.side;
  if (event.type === 'HEAL') return event.side;
  return null;
}

const COMBAT_OUTCOME_TEXT: Record<string, string> = {
  PLAYER_WINS: 'wins the lane',
  ENEMY_WINS: 'wins the lane',
  TIE: 'both are destroyed',
  PLAYER_DIRECT: 'attacks directly',
  ENEMY_DIRECT: 'attacks directly',
  EMPTY: '',
};

export function bannerTextFromEvent(event: GameEvent | null): string {
  if (!event) return '';
  switch (event.type) {
    case 'REVEAL':
      return 'Lanes reveal...';
    case 'ON_PLAY':
      return event.zone === 'spell' ? `${event.name} activates - stays in play` : `${event.name} enters play`;
    case 'SPELL_RESOLVED':
      return event.fizzled ? `${event.name} had no effect` : `${event.name}!`;
    case 'SPELL_ZONE_DESTROYED':
      return `${event.name} destroyed`;
    case 'TRIGGER':
      return `${event.sourceName} - ${event.label}`;
    case 'COMBAT': {
      if (event.outcome === 'EMPTY') return `${event.lane}: empty`;
      const who = event.player?.name ?? event.enemy?.name ?? '';
      return `${who} ${COMBAT_OUTCOME_TEXT[event.outcome]}`;
    }
    case 'DIRECT_DAMAGE':
      return `Direct hit! -${event.amount} HP`;
    case 'OVERFLOW_DAMAGE':
      return `${event.winnerName} overpowers ${event.loserName} - -${event.amount} HP`;
    case 'HEAL':
      return `+${event.amount} HP`;
    case 'HERO_DESTROYED':
      return `${event.name} is destroyed`;
    case 'RETURNED_TO_HAND':
      return `${event.name} returns to hand`;
    case 'RETURNED_TO_DECK':
      return `${event.name} returns to the Deck`;
    case 'REVIVED':
      return `${event.name} is revived!`;
    case 'TEMP_POWER_EXPIRED':
      return `${event.name} settles`;
    case 'EXILED':
      return `${event.name} is exiled - gone for good`;
    case 'MATCH_END':
      return event.winner === 'draw' ? 'Draw!' : event.winner === 'player' ? 'Victory!' : 'Defeat...';
    default:
      return '';
  }
}
