import { useEconomy } from '../game/economy/useEconomy';

/** The Summon Ticket: a small torn stub, drawn inline like GemIcon/GoldIcon - same "no asset" convention. */
export function TicketIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="ticket-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 1.6 1.6 0 0 0 0 3.2A2 2 0 0 1 19 15.5H5a2 2 0 0 1-2-2 1.6 1.6 0 0 0 0-3.2Z" fill="#e0b8f0" stroke="#5a3468" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 6.5v9" stroke="#5a3468" strokeWidth="1" strokeDasharray="1.6 1.6" opacity="0.7" />
    </svg>
  );
}

/** "+5 Tickets" - the reward strip chip, mirrors GemAmount/GoldAmount. */
export function TicketAmount({ amount }: { amount: number }) {
  return (
    <span className="xp-gain ticket-gain">
      <TicketIcon size={15} />+{amount} Ticket{amount === 1 ? '' : 's'}
    </span>
  );
}

/** Current balance, live - same quiet placement convention as GemBalance/GoldBalance. */
export function TicketBalance({ className = '' }: { className?: string }) {
  const { tickets } = useEconomy();
  return (
    <span className={`ticket-balance ${className}`} aria-label={`${tickets} Summon Tickets`}>
      <TicketIcon size={15} />
      <span>{tickets.toLocaleString()}</span>
    </span>
  );
}
