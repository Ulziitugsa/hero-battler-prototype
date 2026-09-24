import type { CombatOutcome, GameEvent, GameState, PlayerAction, Side } from '../types/index.js';
import { opposite } from './board.js';
import { redactEventsForViewer, redactStateForViewer } from './redact.js';

/**
 * The engine is hard-wired around canonical `player`/`enemy` - in Friendly Battle the host is always
 * canonical `player` and the guest is always canonical `enemy`, for the life of a match. GamePage,
 * however, is written entirely in "`.player` = me, `.enemy` = opponent" terms, and nothing about it
 * should change for PvP. So a guest's client is handed a VIEWPOINT-FLIPPED copy of the canonical
 * state/events (its own data relabeled under `.player`) - this module is the only place that flip
 * happens. A host's viewpoint is the canonical one unchanged (beyond redaction).
 */

function flipCombatOutcome(outcome: CombatOutcome): CombatOutcome {
  switch (outcome) {
    case 'PLAYER_WINS':
      return 'ENEMY_WINS';
    case 'ENEMY_WINS':
      return 'PLAYER_WINS';
    case 'PLAYER_DIRECT':
      return 'ENEMY_DIRECT';
    case 'ENEMY_DIRECT':
      return 'PLAYER_DIRECT';
    default:
      return outcome; // TIE, EMPTY, STALLED are symmetric
  }
}

/**
 * Flips every side-carrying field on one event for the guest's viewpoint. Most events carry a plain
 * top-level `side: Side` (handled generically in the `default` branch below); a handful have a
 * different shape and are special-cased - found by walking every variant of the GameEvent union
 * (src/game/types/index.ts) rather than assumed:
 *  - REVEAL carries side on nested `handRemovals`/`placements` entries, not on itself.
 *  - COMBAT carries `player`/`enemy` object keys instead of `side` - AND its `outcome` string
 *    ('PLAYER_WINS', 'PLAYER_DIRECT', ...) semantically encodes a side, which drives which side's
 *    board flashes/streaks in the animation layer (see buildAnimationSteps.ts) - both must flip together.
 *  - MATCH_END's `winner` is `Side | 'draw'` - flip the Side case, leave 'draw' alone.
 *  - ROUND_START, ROUND_END, SAFEGUARD_TRIPPED carry no side at all.
 */
function flipEvent(event: GameEvent): GameEvent {
  switch (event.type) {
    case 'ROUND_START':
    case 'ROUND_END':
    case 'SAFEGUARD_TRIPPED':
      return event;
    case 'REVEAL':
      return {
        ...event,
        handRemovals: event.handRemovals.map((r) => ({ ...r, side: opposite(r.side) })),
        placements: event.placements.map((p) => ({ ...p, side: opposite(p.side) })),
      };
    case 'COMBAT':
      return { ...event, player: event.enemy, enemy: event.player, outcome: flipCombatOutcome(event.outcome) };
    case 'MATCH_END':
      return { ...event, winner: event.winner === 'draw' ? 'draw' : opposite(event.winner) };
    default:
      return { ...event, side: opposite(event.side) };
  }
}

/**
 * Full per-viewer treatment of the event log: redact the true opponent's hidden draws first (against the
 * real canonical side), then - only for the guest - relabel every event as if the guest's own side were
 * canonical `player`. A host's viewpoint needs redaction only; it IS the canonical labeling already.
 */
export function orientEventsForViewer(events: GameEvent[], viewerCanonicalSide: Side): GameEvent[] {
  const redacted = redactEventsForViewer(events, viewerCanonicalSide);
  if (viewerCanonicalSide === 'player') return redacted;
  return redacted.map(flipEvent);
}

function flipSideKeyedRecord<T>(record: Partial<Record<Side, T>> | undefined): Partial<Record<Side, T>> | undefined {
  if (!record) return record;
  const flipped: Partial<Record<Side, T>> = {};
  if (record.player !== undefined) flipped.enemy = record.player;
  if (record.enemy !== undefined) flipped.player = record.enemy;
  return flipped;
}

/** Same treatment as orientEventsForViewer, but for a whole GameState snapshot. */
export function orientStateForViewer(state: GameState, viewerCanonicalSide: Side): GameState {
  const redacted = redactStateForViewer(state, viewerCanonicalSide);
  if (viewerCanonicalSide === 'player') return redacted;
  return {
    ...redacted,
    player: redacted.enemy,
    enemy: redacted.player,
    masteries: flipSideKeyedRecord(redacted.masteries),
    ascensions: flipSideKeyedRecord(redacted.ascensions),
    heroLevels: flipSideKeyedRecord(redacted.heroLevels),
  };
}

/**
 * A DeployPlay ({handId, cardId, lane}) is already side-agnostic: a hand id is only ever unique within
 * the hand it came from, and a lane is symmetric board geometry, not side-relative - so a viewer's own
 * locally-built PlayerAction needs no translation before being submitted under its canonical side. This
 * is intentionally an identity function; it exists as one named, tested seam asserting that invariant
 * explicitly rather than leaving "no translation needed" unstated - if a future card ever introduces a
 * side-relative lane or hand concept, this is the one place that would need to change.
 */
export function toCanonicalAction(_viewerCanonicalSide: Side, action: PlayerAction): PlayerAction {
  return action;
}
