import { FIGHT_BUTTON_LABEL, fightButtonAriaLabel, type FightButtonState } from './fightButtonState';

/** The Fight button: a low, wide moonlit plate set into the clash line between the two Unit rows, so it reads as the
 * battle's one call to action without covering either front line. Navy with a double gold edge; when the plan is
 * ready its edge brightens and breathes slowly, while resolving it turns cold silver and says so. Pressed sinks 1px. */
export function FightSeal({ state, stagedCount = 0, onFight }: { state: FightButtonState; stagedCount?: number; onFight: () => void }) {
  const enabled = state === 'idle' || state === 'ready';
  return (
    <div className={`fight-seal-mount is-${state}`}>
      <span className="fight-seal-lintel" aria-hidden="true" />
      <button
        type="button"
        className={`fight-cta is-${state}`}
        data-state={state}
        disabled={!enabled}
        aria-disabled={!enabled}
        aria-busy={state === 'resolving' || state === 'waiting'}
        onClick={onFight}
        aria-label={fightButtonAriaLabel(state, stagedCount)}
      >
        <span className="fight-cta-plate">
          <span className="fight-cta-moon" aria-hidden="true" />
          <span className="fight-cta-label">{FIGHT_BUTTON_LABEL[state]}</span>
          <span className="fight-cta-moon flip" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
