/** The Fight button's five looks (pressed is CSS :active on top of idle or ready).
 * - disabled: not your planning step (before the match starts, a finished match, a rules mismatch).
 * - idle: you can fight, but nothing is staged yet and you still hold cards (fighting now passes the round).
 * - ready: something is staged and no card is half-placed, or there is nothing left to place. The button invites the tap.
 * - resolving: the round is playing out.
 * - waiting: Friendly; your plays are locked in and the opponent has not submitted yet. */
export type FightButtonState = 'disabled' | 'idle' | 'ready' | 'resolving' | 'waiting';

export interface FightButtonInput {
  /** The match is in the planning step (phase DEPLOY). */
  planning: boolean;
  /** The round is resolving on screen. */
  resolving: boolean;
  /** Friendly: plays submitted, waiting for the other player. */
  waitingForOpponent?: boolean;
  /** The saved match can't be continued under the current rules. */
  blocked?: boolean;
  /** Cards staged on the board this round. */
  stagedCount: number;
  /** A hand card is selected but not yet placed. */
  selecting: boolean;
  /** Cards left in hand that are not staged. */
  handLeft: number;
}

export function fightButtonState(input: FightButtonInput): FightButtonState {
  if (input.resolving) return 'resolving';
  if (input.waitingForOpponent) return 'waiting';
  if (!input.planning || input.blocked) return 'disabled';
  if (input.selecting) return 'idle';
  return input.stagedCount > 0 || input.handLeft === 0 ? 'ready' : 'idle';
}

/** The visible word on the button. "Fight" stays the call to action; the in-between states say what is happening. */
export const FIGHT_BUTTON_LABEL: Record<FightButtonState, string> = {
  disabled: 'Fight',
  idle: 'Fight',
  ready: 'Fight',
  resolving: 'Resolving',
  waiting: 'Waiting',
};

/** Screen-reader name: the label plus what a tap does now. */
export function fightButtonAriaLabel(state: FightButtonState, stagedCount: number): string {
  if (state === 'resolving') return 'Resolving the round';
  if (state === 'waiting') return 'Waiting for your opponent';
  if (state === 'ready') return stagedCount > 0 ? `Fight with ${stagedCount} ${stagedCount === 1 ? 'card' : 'cards'} staged` : 'Fight';
  if (state === 'idle') return 'Fight without playing a card';
  return 'Fight';
}
