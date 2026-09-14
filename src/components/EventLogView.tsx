import type { GameEvent } from '../game/types';

function formatEvent(e: GameEvent): string {
  switch (e.type) {
    case 'ROUND_START':
      return `Round ${e.round} begins`;
    case 'REVEAL':
      return `Both lanes reveal (${e.placements.length} placed)`;
    case 'ON_PLAY':
      return e.zone === 'spell'
        ? `CONTINUOUS SPELL: ${e.name} activates in ${e.lane} - remains active (${e.side})`
        : `${e.name} enters ${e.lane} (${e.side})`;
    case 'SPELL_RESOLVED':
      return `SPELL: ${e.name} activates in ${e.lane}${e.fizzled ? ' (no effect)' : ''} -> Graveyard (${e.side})`;
    case 'SPELL_ZONE_DESTROYED':
      return `${e.name} destroyed -> Graveyard (${e.side}, ${e.lane})`;
    case 'TRIGGER':
      return `${e.sourceName} - ${e.label} (${e.side})`;
    case 'POWER_CHANGED':
      return `${e.name} Power ${e.from} -> ${e.to} [${e.reason}${e.permanent ? '' : ', this round'}]`;
    case 'COMBAT': {
      const p = e.player ? `${e.player.name}(${e.player.power})` : 'empty';
      const en = e.enemy ? `${e.enemy.name}(${e.enemy.power})` : 'empty';
      return `Combat ${e.lane}: ${p} vs ${en} -> ${e.outcome}`;
    }
    case 'DIRECT_DAMAGE':
      return `Direct damage! ${e.side} HP ${e.from} -> ${e.to} (${e.sourceName})`;
    case 'OVERFLOW_DAMAGE':
      return `Overflow! ${e.winnerName}(${e.amount} over ${e.loserName}) -> ${e.side} HP ${e.from} -> ${e.to} (${e.lane})`;
    case 'HEAL':
      return `${e.side} HP ${e.from} -> ${e.to} (${e.sourceName})`;
    case 'HERO_DESTROYED':
      return `${e.name} destroyed -> Graveyard (${e.side}, ${e.lane})`;
    case 'RETURNED_TO_HAND':
      return `${e.name} returned to hand (${e.side})`;
    case 'RETURNED_TO_DECK':
      return `${e.name} returned to Deck (${e.side})`;
    case 'REVIVED':
      return `${e.name} revived into ${e.lane} at ${e.power} Power (${e.side})`;
    case 'DRAW':
      return e.fizzled ? `Draw stopped (deck empty) (${e.side})` : `${e.side} draws ${e.cardName}`;
    case 'TEMP_POWER_EXPIRED':
      return `${e.name} loses ${e.amount} temporary Power at round end`;
    case 'EXILED':
      return `${e.name} exiled from Graveyard - gone for good (${e.side})`;
    case 'SAFEGUARD_TRIPPED':
      return `SAFEGUARD TRIPPED: ${e.reason}`;
    case 'ROUND_END':
      return `Round ${e.round} ends`;
    case 'MATCH_END':
      return `MATCH END - winner: ${e.winner} (${e.reason})`;
    default:
      return JSON.stringify(e);
  }
}

export function EventLogView({ events }: { events: GameEvent[] }) {
  return (
    <div className="log">
      {events.map((e, i) => (
        <div key={i} className={`log-line ${e.type === 'ROUND_START' ? 'round-marker' : ''}`}>
          <span className="idx">#{i}</span> <span className="type">{e.type}</span> {formatEvent(e)}
        </div>
      ))}
    </div>
  );
}
