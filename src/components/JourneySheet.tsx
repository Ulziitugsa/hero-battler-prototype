import { JOURNEY_DAYS } from '../game/journey/definitions';
import { claimJourneyDay } from '../game/journey/store';
import { useJourney } from '../game/journey/useJourney';
import { GoldIcon } from './GoldIcon';
import { GemIcon } from './GemIcon';
import { TicketIcon } from './TicketIcon';
import { Icon } from './Icon';
import '../styles/missions.css';
import '../styles/journey.css';

/** The 7-day new-player journey - a compact strip, same sheet footprint discipline as MissionsSheet. Days
 * may be claimed out of order and a missed day is never lost (see game/journey/store.ts). */
export function JourneySheet({ onClose }: { onClose: () => void }) {
  const journey = useJourney();

  return (
    <div className="overlay-backdrop missions-overlay" onClick={onClose}>
      <div className="missions-sheet journey-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="missions-header">
          <span className="missions-title">Your first week</span>
          <button type="button" className="missions-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="journey-strip">
          {JOURNEY_DAYS.map((def) => {
            const claimed = journey.claimedDays.includes(def.day);
            const unlocked = def.day <= journey.currentDay;
            const claimable = unlocked && !claimed;
            return (
              <div key={def.day} className={`journey-day ${claimed ? 'claimed' : claimable ? 'ready' : unlocked ? '' : 'locked'}`}>
                <span className="journey-day-num">Day {def.day}</span>
                <span className="journey-day-title">{def.title}</span>
                <span className="journey-day-reward">
                  {def.rewardGold > 0 && (
                    <span>
                      <GoldIcon size={12} />
                      {def.rewardGold}
                    </span>
                  )}
                  {def.rewardGems > 0 && (
                    <span>
                      <GemIcon size={12} />
                      {def.rewardGems}
                    </span>
                  )}
                  {def.rewardTickets > 0 && (
                    <span>
                      <TicketIcon size={12} />
                      {def.rewardTickets}
                    </span>
                  )}
                  {def.rewardCardId && <span>1 Hero</span>}
                </span>
                {claimed ? (
                  <span className="missions-claimed-tag">
                    <Icon name="check" size={12} />
                  </span>
                ) : unlocked ? (
                  <button
                    type="button"
                    className="missions-claim-btn"
                    onClick={() => {
                      claimJourneyDay(def.day);
                      journey.refresh();
                    }}
                  >
                    Claim
                  </button>
                ) : (
                  <span className="journey-day-lock">
                    <Icon name="lock" size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
