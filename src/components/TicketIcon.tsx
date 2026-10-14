import { useEconomy } from '../game/economy/useEconomy';
import { BalanceCounter } from './feedback/BalanceCounter';

/** The Pull Ticket (1 Ticket = 1 pull = 1 card from a Box): a small torn stub, drawn inline like GemIcon/GoldIcon - same "no asset" convention. */
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
      <TicketIcon size={15} />+{amount} Pull Ticket{amount === 1 ? '' : 's'}
    </span>
  );
}

/** Current balance, live - same quiet placement convention as GemBalance/GoldBalance. Ticket rewards fly here. */
export function TicketBalance({ className = '', id }: { className?: string; id?: string }) {
  const { tickets } = useEconomy();
  return <BalanceCounter kind="tickets" value={tickets} id={id} className={`ticket-balance ${className}`} label={`${tickets} Pull ${tickets === 1 ? 'Ticket' : 'Tickets'}`} icon={<TicketIcon size={15} />} />;
}
