import type { PlayerAction } from '../../src/game/types';

/** RPCs are callable directly, so validate stored JSON as well as HTTP input. */
export function isActionShape(value: unknown): value is PlayerAction {
  if (!value || typeof value !== 'object' || !('plays' in value) || !Array.isArray(value.plays) || value.plays.length > 6) return false;
  return value.plays.every(play => play && typeof play === 'object'
    && typeof play.handId === 'string' && play.handId.length <= 128
    && typeof play.cardId === 'string' && play.cardId.length <= 128
    && ['left', 'center', 'right'].includes(play.lane));
}
