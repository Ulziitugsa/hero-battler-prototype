import { useEconomy } from '../game/economy/useEconomy';
import { BalanceCounter } from './feedback/BalanceCounter';

/** The Gold coin: one small stamped disc, drawn inline like GemIcon - same "no asset" convention. */
export function GoldIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="gold-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="#e8c15a" stroke="#8a5a1e" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#8a5a1e" strokeWidth="1" opacity="0.6" />
      <path d="M9 13.2c.3 1 1.2 1.6 2.6 1.6 1.6 0 2.6-.7 2.6-1.7 0-2.5-5.2-1-5.2-3.6 0-1 1-1.7 2.5-1.7 1.3 0 2.2.5 2.5 1.4" fill="none" stroke="#8a5a1e" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** "+30 Gold" - the reward strip chip, mirrors GemAmount. */
export function GoldAmount({ amount }: { amount: number }) {
  return (
    <span className="xp-gain gold-gain">
      <GoldIcon size={15} />+{amount} Gold
    </span>
  );
}

/** Current balance, live - same quiet placement convention as GemBalance. Gold rewards fly here and roll up. */
export function GoldBalance({ className = '', id, arriving }: { className?: string; id?: string; arriving?: number }) {
  const { gold } = useEconomy();
  return <BalanceCounter kind="gold" value={gold} id={id} arriving={arriving} className={`gold-balance ${className}`} label={`${gold} Gold`} icon={<GoldIcon size={15} />} />;
}
