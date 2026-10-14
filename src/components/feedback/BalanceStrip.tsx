import { GemBalance } from '../GemIcon';
import { GoldBalance } from '../GoldIcon';
import { TicketBalance } from '../TicketIcon';

/**
 * The player's balances inside a reward sheet (Missions, Journey). A sheet covers the screen's own header, so it
 * carries its own live counters: a claimed reward flies to these, in view, instead of to a counter behind the backdrop.
 */
export function BalanceStrip() {
  return (
    <div className="mw-balance-strip" role="group" aria-label="Balances">
      <GoldBalance />
      <GemBalance />
      <TicketBalance />
    </div>
  );
}
