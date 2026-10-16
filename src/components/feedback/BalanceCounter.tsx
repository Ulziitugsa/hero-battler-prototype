import type { ReactNode } from 'react';
import type { RewardKind } from './rewardBus';
import { useCountUp } from './useCountUp';
import { useRewardTarget } from './useRewardTarget';

/**
 * A live currency balance that is also a reward landing spot: flights of its kind fly to it, it swells when they land,
 * and gains roll up instead of jumping (spending shows at once). The accessible label always carries the real value,
 * never the rolling one. Markup matches the original balance chips (icon + number span), so existing styles apply.
 */
export function BalanceCounter({ kind, value, icon, label, className, id, text, arriving = 0 }: { kind: RewardKind; value: number; icon: ReactNode; label: string; className: string; id?: string; text?: string; arriving?: number }) {
  // `arriving`: the part of `value` still on its way here (a flight announced as this counter opens) - shown last.
  const { display, counting } = useCountUp(value, { kind, startFrom: arriving > 0 ? value - arriving : undefined });
  const ref = useRewardTarget<HTMLSpanElement>(kind);
  return (
    <span ref={ref} id={id} className={className} aria-label={label} data-reward-target={kind}>
      {icon}
      <span className={counting ? 'mw-counting' : undefined}>{text ?? display.toLocaleString()}</span>
    </span>
  );
}
