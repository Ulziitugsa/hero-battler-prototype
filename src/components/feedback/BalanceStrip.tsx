import { useEconomy } from '../../game/economy/useEconomy';
import { GemBalance } from '../GemIcon';
import { GoldBalance } from '../GoldIcon';
import { TicketBalance } from '../TicketIcon';

/**
 * The player's balances inside a reward sheet (Missions, Journey). A sheet covers the screen's own header, so it
 * carries its own live counters: a claimed reward flies to these, in view, instead of to a counter behind the backdrop.
 * Pull Tickets follow Home's header and hide at zero, unless a reward in the sheet that can be claimed now pays Tickets
 * (`ticketReward`): then the chip is there for that reward to land on.
 *
 * `arriving`: rewards granted just before the strip opened (a battle result) and flying to it now. Those counters open
 * on the balance before the reward and roll up as it lands.
 */
export function BalanceStrip({ ticketReward = false, arriving = {} }: { ticketReward?: boolean; arriving?: { gold?: number; gems?: number } }) {
  const { tickets } = useEconomy();
  return (
    <div className="mw-balance-strip" role="group" aria-label="Balances">
      <GoldBalance arriving={arriving.gold} />
      <GemBalance arriving={arriving.gems} />
      {(tickets > 0 || ticketReward) && <TicketBalance />}
    </div>
  );
}
