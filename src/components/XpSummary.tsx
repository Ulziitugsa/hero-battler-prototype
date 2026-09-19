import { MASTERIES } from '../game/mastery/definitions';
import type { XpGrantResult } from '../game/progression/types';
import { Icon } from './Icon';
import '../styles/rewardCard.css';

/** Compact "what did that match give my account" strip, shared by the Campaign result sheet and the Quick Battle summary: +XP, a level-up, any Mastery unlocked, any Mastery Point earned. One line each, only when they apply. */
export function XpSummary({ xp }: { xp: XpGrantResult | null }) {
  if (!xp || xp.gained <= 0) return null;
  const levelUp = xp.levelsGained.length > 0;
  return (
    <div className="xp-summary" aria-live="polite">
      <span className="xp-gain">
        <Icon name="power" size={13} />+{xp.gained} XP
      </span>
      {levelUp && (
        <span className="xp-pill level">
          <Icon name="trophy" size={13} />
          Level up · Level {xp.levelAfter}
        </span>
      )}
      {xp.masteriesUnlocked.map((id) => (
        <span key={id} className="xp-pill mastery">
          <Icon name="hero" size={13} />
          {MASTERIES[id].name} unlocked
        </span>
      ))}
      {xp.masteryPointsGained > 0 && (
        <span className="xp-pill point">
          <Icon name="plus" size={13} />
          {xp.masteryPointsGained} Mastery Point{xp.masteryPointsGained === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
