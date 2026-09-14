import { Icon } from './Icon';

/** The Fight seal, set into a stone lintel at the clash line between the two hero rows (Battle
 * Screen v8) - 62px, smaller than Home's seal, so it stops crowding the gap between the front lines.
 * During resolution it desaturates to cold metal and its glow stops; there is no second confirm. */
export function FightSeal({ canFight, fighting, onFight }: { canFight: boolean; fighting: boolean; onFight: () => void }) {
  return (
    <div className="fight-seal-mount">
      <span className="fight-seal-lintel" />
      <button type="button" className={`fight-seal-battle ${fighting ? 'resolving' : ''}`} disabled={!canFight} onClick={onFight} aria-label="Fight">
        <span className="fight-seal-glow" />
        <span className="fight-seal-core">
          {fighting ? <span className="fight-seal-label">Resolving</span> : <Icon name="battle" size={16} />}
          {!fighting && <span className="fight-seal-label">Fight</span>}
        </span>
      </button>
    </div>
  );
}
