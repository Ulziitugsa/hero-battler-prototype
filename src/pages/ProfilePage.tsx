import { useState } from 'react';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { HelpModal } from '../components/HelpModal';

/**
 * Placeholder player identity + settings + developer tools. There's no account system yet (see
 * README "Things explicitly not built") - name/level/avatar are static placeholders so the shell
 * reads as a real game, not a promise this pass doesn't build.
 */
export function ProfilePage({ onOpenStats }: { onOpenStats: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="screen-shell">
      <TopBar title="Profile" />

      <div className="profile-card panel-raised">
        <div className="profile-avatar" />
        <div>
          <div className="profile-name">Wanderer</div>
          <div className="profile-level">Level 1 · Playtester</div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">Support</div>
        <button type="button" className="profile-row" onClick={() => setHelpOpen(true)}>
          <Icon name="help" />
          <span>How to Play</span>
        </button>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">Developer Tools</div>
        <button type="button" className="profile-row" onClick={onOpenStats}>
          <Icon name="bug" />
          <span>Playtest Stats</span>
        </button>
      </div>

      <div className="profile-footer">Hero Battler · Card Set v0.1 prototype</div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
