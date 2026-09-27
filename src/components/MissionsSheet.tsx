import { useEffect, useState } from 'react';
import type { MissionPeriod } from '../game/missions/definitions';
import { claimMission, listMissions } from '../game/missions/store';
import { useMissions } from '../game/missions/useMissions';
import { GoldIcon } from './GoldIcon';
import { GemIcon } from './GemIcon';
import { TicketIcon } from './TicketIcon';
import { Icon } from './Icon';
import { useDialogFocus } from './useDialogFocus';
import '../styles/missions.css';
import { RewardFeedback } from './RewardFeedback';

/** Daily/weekly missions - a compact bottom sheet in the same language as GraveyardSheet/HelpModal
 * (mobile-first: a sheet, not a new nav tab). Reachable from Home's footer. */
export function MissionsSheet({ onClose }: { onClose: () => void }) {
  const dialog = useDialogFocus(onClose);
  const state = useMissions();
  const [period, setPeriod] = useState<MissionPeriod>('daily');
  const [claimed, setClaimed] = useState<string | null>(null);
  useEffect(() => {
    if (!claimed) return;
    const timeout = window.setTimeout(() => setClaimed(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [claimed]);
  const rows = listMissions(period, state);
  const readyCount = rows.filter(({ def, progress }) => !progress.claimed && progress.count >= def.target).length;
  const allClaimed = rows.length > 0 && rows.every(({ progress }) => progress.claimed);

  return (
    <div className="overlay-backdrop missions-overlay" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="missions-sheet" role="dialog" aria-modal="true" aria-labelledby="missions-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="missions-header">
          <span className="missions-title" id="missions-sheet-title">Missions</span>
          <button type="button" className="missions-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="missions-tabs">
          <button type="button" className={`missions-tab ${period === 'daily' ? 'active' : ''}`} onClick={() => setPeriod('daily')}>
            Daily
          </button>
          <button type="button" className={`missions-tab ${period === 'weekly' ? 'active' : ''}`} onClick={() => setPeriod('weekly')}>
            Weekly
          </button>
        </div>

        <p className="missions-summary" role="status">
          {readyCount > 0 ? `${readyCount} ${period} reward${readyCount === 1 ? '' : 's'} ready to claim.` : allClaimed ? `All ${period} rewards claimed.` : 'Complete missions to earn rewards.'}
        </p>
        {claimed && <RewardFeedback tone="small">{claimed}</RewardFeedback>}

        <div className="missions-list">
          {rows.map(({ def, progress }) => {
            const complete = progress.count >= def.target;
            return (
              <div key={def.id} className={`missions-row ${progress.claimed ? 'claimed' : complete ? 'ready' : ''}`}>
                <div className="missions-row-text">
                  <span className="missions-row-title">{def.title}</span>
                  <span className="missions-row-progress">
                    {Math.min(progress.count, def.target)} / {def.target}
                    <span className="missions-row-bar" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (progress.count / def.target) * 100)}%` }} />
                    </span>
                  </span>
                </div>
                <div className="missions-row-reward">
                  {def.rewardGold > 0 && (
                    <span>
                      <GoldIcon size={13} />
                      {def.rewardGold}
                    </span>
                  )}
                  {def.rewardGems > 0 && (
                    <span>
                      <GemIcon size={13} />
                      {def.rewardGems}
                    </span>
                  )}
                  {def.rewardTickets > 0 && (
                    <span>
                      <TicketIcon size={13} />
                      {def.rewardTickets}
                    </span>
                  )}
                </div>
                {progress.claimed ? (
                  <span className="missions-claimed-tag">
                    <Icon name="check" size={12} />
                  </span>
                ) : (
                  <button type="button" className="missions-claim-btn" disabled={!complete} onClick={() => {
                    const result = claimMission(def.id);
                    if (!result.ok) return;
                    const parts = [result.gold > 0 && `+${result.gold.toLocaleString()} Gold`, result.gems > 0 && `+${result.gems} Gems`, result.tickets > 0 && `+${result.tickets} Tickets`].filter(Boolean);
                    setClaimed(parts.join(' · ') || 'Reward claimed');
                  }}>
                    Claim
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
