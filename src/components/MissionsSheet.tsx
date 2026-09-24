import { useState } from 'react';
import type { MissionPeriod } from '../game/missions/definitions';
import { claimMission, listMissions } from '../game/missions/store';
import { useMissions } from '../game/missions/useMissions';
import { GoldIcon } from './GoldIcon';
import { GemIcon } from './GemIcon';
import { TicketIcon } from './TicketIcon';
import { Icon } from './Icon';
import '../styles/missions.css';

/** Daily/weekly missions - a compact bottom sheet in the same language as GraveyardSheet/HelpModal
 * (mobile-first: a sheet, not a new nav tab). Reachable from Home's footer. */
export function MissionsSheet({ onClose }: { onClose: () => void }) {
  const state = useMissions();
  const [period, setPeriod] = useState<MissionPeriod>('daily');
  const rows = listMissions(period, state);

  return (
    <div className="overlay-backdrop missions-overlay" onClick={onClose}>
      <div className="missions-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="missions-header">
          <span className="missions-title">Missions</span>
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
                  <button type="button" className="missions-claim-btn" disabled={!complete} onClick={() => claimMission(def.id)}>
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
