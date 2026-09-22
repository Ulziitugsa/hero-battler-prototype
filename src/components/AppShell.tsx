import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { WaxDot } from '../pages/home/HomeSections';
import { navDots } from '../game/home/hubState';
import { useCollection } from '../game/collection/useCollection';
import { useAccount } from '../game/progression/useAccount';
import { masteryPointsAvailable } from '../game/progression/account';
import { anyAscensionReady } from '../game/home/hubState';

// Battle is no longer a HUD destination - it's reached via the Fight seal on Home, which is built
// into that screen rather than the arc (see Home Screen v3). Battle Setup renders full-screen,
// outside this shell, same as an in-progress match.
export type TabId = 'home' | 'heroes' | 'decks' | 'profile';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'heroes', label: 'Heroes', icon: 'heroes' },
  { id: 'decks', label: 'Decks', icon: 'decks' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

/**
 * The persistent app frame: content area + a carved wooden HUD arc (Embervale design source of
 * truth section 5). Only wraps the 4 main tab screens - an in-progress Battle, Battle Setup, and
 * modals render full-screen outside this shell, since combat shouldn't compete with navigation
 * chrome for vertical space on a small phone.
 */
export function AppShell({ active, onNavigate, children }: { active: TabId; onNavigate: (tab: TabId) => void; children: ReactNode }) {
  // Wax dots only where something is genuinely waiting: a duplicate ready to Ascend (Heroes), an unspent Mastery Point (Profile).
  const owned = useCollection();
  const account = useAccount();
  const dots = navDots({ canSummon: false, masteryPoint: masteryPointsAvailable(account) > 0, ascensionReady: anyAscensionReady(owned) });
  const dotFor: Partial<Record<TabId, string>> = { heroes: dots.heroes ? 'Ascension available' : '', profile: dots.profile ? 'Mastery Point available' : '' };
  return (
    <div className="app-frame">
      <div className="app-frame-content">{children}</div>
      <nav className="hud-arc" aria-label="Main navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`hud-medallion ${active === tab.id ? 'active' : ''}`}
            onClick={() => onNavigate(tab.id)}
          >
            <span className="hud-medallion-chip">
              <Icon name={tab.icon} size={19} />
              {dotFor[tab.id] && <WaxDot label={dotFor[tab.id]!} />}
            </span>
            <span className="hud-medallion-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
