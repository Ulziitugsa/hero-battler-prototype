import { JOURNEY_DAYS } from '../game/journey/definitions';
import { getCard } from '../game/cards';
import { claimJourneyDay } from '../game/journey/store';
import { useJourney } from '../game/journey/useJourney';
import { useEffect, useState } from 'react';
import { GoldIcon } from './GoldIcon';
import { GemIcon } from './GemIcon';
import { TicketIcon } from './TicketIcon';
import { Icon } from './Icon';
import { useDialogFocus } from './useDialogFocus';
import '../styles/missions.css';
import '../styles/journey.css';
import { RewardFeedback } from './RewardFeedback';

/** The 7-day new-player journey - a compact strip, same sheet footprint discipline as MissionsSheet. Days
 * may be claimed out of order and a missed day is never lost (see game/journey/store.ts). */
export function JourneySheet({ onClose }: { onClose: () => void }) {
  const journey = useJourney();
  const [claimed, setClaimed] = useState<string | null>(null);
  const dialog = useDialogFocus(onClose);
  useEffect(() => {
    if (!claimed) return;
    const timeout = window.setTimeout(() => setClaimed(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [claimed]);

  return (
    <div className="overlay-backdrop missions-overlay" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="missions-sheet journey-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="missions-header">
          <span className="missions-title" id="journey-sheet-title">Your first week</span>
          <button type="button" className="missions-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="journey-summary" role="status">
          <strong>{journey.complete ? 'Journey complete' : `Day ${journey.currentDay} of 7`}</strong>
          <span>{journey.claimedDays.length} of 7 rewards claimed</span>
        </div>
        <p className="journey-note">{journey.complete ? 'You have claimed every reward. Your first week is complete.' : 'Open days stay available. Claim them whenever you are ready.'}</p>
        {claimed && <RewardFeedback tone={claimed.includes('added to your collection') ? 'major' : 'small'}>{claimed}</RewardFeedback>}

        <div className="journey-strip">
          {JOURNEY_DAYS.map((def) => {
            const claimed = journey.claimedDays.includes(def.day);
            const unlocked = def.day <= journey.currentDay;
            const claimable = unlocked && !claimed;
            const featured = def.day === 7;
            return (
              <div key={def.day} className={`journey-day ${claimed ? 'claimed' : claimable ? 'ready' : unlocked ? '' : 'locked'} ${def.day === journey.currentDay && !journey.complete ? 'current' : ''} ${featured ? 'featured' : ''}`}>
                <span className="journey-day-num">Day {def.day}{def.day === journey.currentDay && !journey.complete && <small>Today</small>}{featured && <small>Final reward</small>}</span>
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
                  {def.rewardCardId && <span>{getCard(def.rewardCardId).name}</span>}
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
                      const result = claimJourneyDay(def.day);
                      if (result.ok) {
                        const parts = [result.gold > 0 && `+${result.gold.toLocaleString()} Gold`, result.gems > 0 && `+${result.gems} Gems`, result.tickets > 0 && `+${result.tickets} Tickets`, result.cardGranted && `${getCard(result.cardGranted).name} added to your collection`].filter(Boolean);
                        setClaimed(parts.join(' · ') || 'Journey reward claimed');
                      }
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
