import { useEconomy, useUnlimitedGems } from '../game/economy/useEconomy';

/** The Gem: one small faceted stone, drawn inline so it takes no asset and reads at 12-20px. */
export function GemIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="gem-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 20 9l-8 12.5L4 9l8-6.5Z" fill="#8fd8e8" stroke="#1d5568" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 9h16M12 2.5 9 9l3 12.5M12 2.5 15 9l-3 12.5" fill="none" stroke="#1d5568" strokeWidth="1" strokeLinejoin="round" opacity="0.7" />
      <path d="M12 2.5 9 9h6l-3-6.5Z" fill="#e6fbff" opacity="0.75" />
    </svg>
  );
}

/** "+20 Gems" - the reward strip chip on result sheets. */
export function GemAmount({ amount }: { amount: number }) {
  return (
    <span className="xp-gain gem-gain">
      <GemIcon size={15} />+{amount} Gems
    </span>
  );
}

/** Current balance, live: gem + number. Quiet by design - shown on Home and the Summon screen only. */
export function GemBalance({ className = '' }: { className?: string }) {
  const { gems } = useEconomy();
  const unlimited = useUnlimitedGems(); // dev-only flag; always false in production
  return (
    <span className={`gem-balance ${className}`} aria-label={unlimited ? 'Unlimited Gems (dev)' : `${gems} Gems`}>
      <GemIcon size={15} />
      <span>{unlimited ? '∞' : gems.toLocaleString()}</span>
    </span>
  );
}
