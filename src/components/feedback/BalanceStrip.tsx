import { useEconomy } from '../../game/economy/useEconomy';
import { GemBalance } from '../GemIcon';
import { GoldBalance } from '../GoldIcon';
import { TicketBalance } from '../TicketIcon';

/**
 * The player's balances inside a reward sheet (Missions, Journey). A sheet covers the screen's own header, so it
 * carries its own live counters: a claimed reward flies to these, in view, instead of to a counter behind the backdrop.
 * Pull Tickets follow Home's header and hide at zero, unless a reward in the sheet that can be claimed now pays Tickets
 * (`ticketReward`): then the chip is there for that reward to land on.
 */
export function BalanceStrip({ ticketReward = false }: { ticketReward?: boolean }) {
  const { tickets } = useEconomy();
  return (
    <div className="mw-balance-strip" role="group" aria-label="Balances">
      <GoldBalance />
      <GemBalance />
      {(tickets > 0 || ticketReward) && <TicketBalance />}
    </div>
  );
}
