import { useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { HelpModal } from '../components/HelpModal';
import { MAX_LEVEL, xpToNextLevel } from '../game/progression/config';
import { useAccount } from '../game/progression/useAccount';
import { resetEverything } from '../game/devReset';
import '../styles/profile.css';
import { BACKGROUNDS, backgroundIsUnlocked, getBackground } from '../game/backgrounds/definitions';
import { backgroundTestingEnabled, getSelectedBackgroundId, selectBackground, setBackgroundTestingEnabled, subscribeBackground } from '../game/backgrounds/store';
import { CHAPTER_1 } from '../game/campaign/chapter1';
import { isNodeCleared, loadProgress } from '../game/campaign/progress';
import { track } from '../analytics/track';

/**
 * Profile: Account Level + XP, backgrounds, Support and Developer Tools. The account Tactics (stored as "masteries"
 * internally) belonged to the legacy resolver and do nothing in card combat, so they are no longer shown; their save
 * data is kept untouched. Progression state comes from game/progression/account.ts and updates live.
 */
export function ProfilePage({ onOpenStats, onOpenCombatLab }: { onOpenStats: () => void; onOpenCombatLab?: () => void }) {
  const account = useAccount();
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [testBackgrounds, setTestBackgrounds] = useState(() => backgroundTestingEnabled());
  const canToggleBackgroundTest = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
  const selectedBackgroundId = useSyncExternalStore(subscribeBackground, getSelectedBackgroundId, getSelectedBackgroundId);
  const selectedBackground = getBackground(selectedBackgroundId);
  const campaignProgress = loadProgress();
  const clearedNodes = CHAPTER_1.nodes.filter((node) => isNodeCleared(node.id, campaignProgress)).length;

  const atMax = account.level >= MAX_LEVEL;
  const need = xpToNextLevel(account.level);
  const pct = atMax ? 100 : Math.round((account.xp / need) * 100);

  return (
    <div className="profile-screen">
      <h1 className="pf-title">Profile</h1>

      <section className="pf-account">
        <span className="pf-level-medal" aria-label={`Account level ${account.level}`}>
          <span aria-hidden="true">☾</span>
          <i>{account.level}</i>
        </span>
        <div className="pf-account-body">
          <span className="pf-account-kicker">MOONWATER ACCOUNT</span>
          <span className="pf-name">Wanderer</span>
          <span className="pf-level-line">Wayfarer · Account Level {account.level}</span>
          <span className="pf-xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={account.xp}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="pf-xp-text">{atMax ? 'Max level' : `${account.xp} / ${need} XP to Level ${account.level + 1}`}</span>
        </div>
      </section>


      <section className="profile-section pf-background-section" aria-labelledby="pf-background-title">
        <div className="profile-section-title">PERSONALIZATION</div>
        <div className="pf-background-current">
          <span className="pf-background-preview" style={{ backgroundImage: `url("${selectedBackground.asset}")` }} />
          <span className="pf-background-copy"><strong id="pf-background-title">{selectedBackground.name}</strong><small>Home background · your selection is saved</small></span>
          <button type="button" className="pf-background-open" onClick={() => { setBackgroundPickerOpen((open) => !open); track('background_customization_opened', { source: 'profile' }); }}>{backgroundPickerOpen ? 'Done' : 'Change'}</button>
        </div>
        {backgroundPickerOpen && <div className="pf-background-grid" role="group" aria-label="Choose a Home background">
          {canToggleBackgroundTest && <label className="pf-background-test"><input type="checkbox" checked={testBackgrounds} onChange={event => { const next=event.currentTarget.checked; setTestBackgrounds(next); setBackgroundTestingEnabled(next); }} /> Unlock all backgrounds for testing</label>}
          {BACKGROUNDS.map((background) => {
            const normallyUnlocked = backgroundIsUnlocked(background, clearedNodes);
            const unlocked = normallyUnlocked || testBackgrounds;
            const selected = selectedBackgroundId === background.id;
            const unlockText = background.unlockType === 'future' ? 'Future cosmetic reward' : background.unlockType === 'event' ? `${background.eventName ?? 'Event'} reward` : background.unlockType === 'progression' ? `Clear ${background.clearedNodesRequired} Campaign stages` : 'Available';
            return <button type="button" key={background.id} className={`pf-background-option ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`} disabled={!unlocked} aria-pressed={selected} onClick={() => selectBackground(background.id, clearedNodes, testBackgrounds)}>
              <span className="pf-background-thumb" style={{ backgroundImage: `url("${background.asset}")` }} />
              <span className="pf-background-option-copy"><strong>{background.name}</strong><small>{selected ? 'Selected' : testBackgrounds && !normallyUnlocked ? `Available for testing · normally ${unlockText.toLowerCase()}` : unlockText}</small></span>
              {selected && <Icon name="check" size={16} />}
              {!unlocked && <Icon name="lock" size={14} />}
            </button>;
          })}
        </div>}
      </section>

      <div className="profile-section">
        <div className="profile-section-title">Support</div>
        <button type="button" className="profile-row" onClick={() => setHelpOpen(true)}>
          <Icon name="help" />
          <span>How to Play</span>
        </button>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">Developer Tools</div>
        {import.meta.env.DEV && onOpenCombatLab && <button type="button" className="profile-row" onClick={onOpenCombatLab}><Icon name="battle" /><span>Combat V2 Lab · experimental (dev only)</span></button>}
        <button type="button" className="profile-row" onClick={onOpenStats}>
          <Icon name="bug" />
          <span>Playtest Stats</span>
        </button>
        {confirmingReset ? (
          <div className="profile-row profile-reset-confirm" role="alertdialog" aria-label="Confirm reset">
            <span>Erase all local progress? This cannot be undone.</span>
            <span className="profile-reset-confirm-btns">
              <button type="button" onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  resetEverything();
                  window.location.reload();
                }}
              >
                Erase everything
              </button>
            </span>
          </div>
        ) : (
          <button type="button" className="profile-row" onClick={() => setConfirmingReset(true)}>
            <Icon name="warning" />
            <span>Reset Progress (Playtest)</span>
          </button>
        )}
      </div>

      <div className="profile-footer">Moonwater · Playtest build</div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
