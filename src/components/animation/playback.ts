import type { GameEvent, GameState } from '../../game/types';
import { applyEvent, replayUpTo } from '../../game/engine/replay';
import type { AnimationStep } from './types';

/**
 * The board as it stands once the first `completedSteps` steps of a round have played: the pure half of
 * useAnimationController's commit model, shared with the tests and anything else that replays a round.
 *
 * A step commits every event up to its `maxEventIndex` (a running max, so the committed events are always a prefix
 * of the real log) plus its `commitIndices`. The extra indices are how card combat's clash losers leave the board
 * as soon as their own lane resolves, before the log's later lanes are committed. Events are still applied in log
 * order, so the state after the last step is exactly the full replay of the round.
 */
export function stateAfterSteps(base: GameState, events: GameEvent[], steps: readonly AnimationStep[], completedSteps: number): GameState {
  if (completedSteps <= 0) return base;
  if (completedSteps >= steps.length) return replayUpTo(base, events, events.length - 1);
  let prefix = -1;
  const extra = new Set<number>();
  for (let i = 0; i < completedSteps; i++) {
    prefix = Math.max(prefix, steps[i].maxEventIndex);
    for (const idx of steps[i].commitIndices ?? []) extra.add(idx);
  }
  if (extra.size === 0) return replayUpTo(base, events, prefix);
  let s = base;
  for (let i = 0; i < events.length; i++) if (i <= prefix || extra.has(i)) s = applyEvent(s, events[i]);
  return s;
}
