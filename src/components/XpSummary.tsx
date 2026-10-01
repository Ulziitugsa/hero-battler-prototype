import type { XpGrantResult } from '../game/progression/types';
import { Icon } from './Icon';
import { GemAmount } from './GemIcon';
import { GoldAmount } from './GoldIcon';
import '../styles/rewardCard.css';

/** Compact "what did that match give my account" strip, shared by the Campaign result sheet and the Quick Battle summary: +XP, Gems, Gold and a level-up. One line each, only when they apply. (Account Tactics belong to the legacy resolver and are no longer shown.) */
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
          Account Level up · {xp.levelAfter}
        </span>
      )}
    </div>
  );
}
