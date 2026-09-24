import { MASTERIES } from '../game/mastery/definitions';
import type { XpGrantResult } from '../game/progression/types';
import { Icon } from './Icon';
import { GemAmount } from './GemIcon';
import { GoldAmount } from './GoldIcon';
import '../styles/rewardCard.css';

/** Compact "what did that match give my account" strip, shared by the Campaign result sheet and the Quick Battle summary: +XP, a level-up, any Mastery unlocked, any Mastery Point earned. One line each, only when they apply. */
export function XpSummary({ xp, gems = 0, gold = 0 }: { xp: XpGrantResult | null; gems?: number; gold?: number }) {
  const hasXp = !!xp && xp.gained > 0;
  const totalGems = gems + (xp?.gemsGained ?? 0);
  if (!hasXp && totalGems <= 0 && gold <= 0) return null;
  const levelUp = hasXp && xp.levelsGained.length > 0;
  return (
    <div className="xp-summary" aria-live="polite">
      {hasXp && (
        <span className="xp-gain">
          <Icon name="power" size={13} />+{xp.gained} XP
        </span>
      )}
      {totalGems > 0 && <GemAmount amount={totalGems} />}
      {gold > 0 && <GoldAmount amount={gold} />}
      {levelUp && (
        <span className="xp-pill level">
          <Icon name="trophy" size={13} />
          Level up · Level {xp.levelAfter}
        </span>
      )}
      {hasXp && xp.masteriesUnlocked.map((id) => (
        <span key={id} className="xp-pill mastery">
          <Icon name="hero" size={13} />
          {MASTERIES[id].name} unlocked
        </span>
      ))}
      {hasXp && xp.masteryPointsGained > 0 && (
        <span className="xp-pill point">
          <Icon name="plus" size={13} />
          {xp.masteryPointsGained} Mastery Point{xp.masteryPointsGained === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
