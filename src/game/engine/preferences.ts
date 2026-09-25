import type { StarterFaction } from '../cards/starterDecks';

// Remembers the player's last-picked deck + opponent across screens/sessions, purely so the Home
// screen can show "your currently selected deck" without a real player-profile backend. localStorage
// only, best-effort - never throws, defaults are always sane.

const STORAGE_KEY = 'skyloom:preferences';

export interface Preferences {
  selectedDeckId: string;
  opponentFaction: StarterFaction;
}

const DEFAULTS: Preferences = { selectedDeckId: 'starter-kingdom', opponentFaction: 'undead' };

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort only
  }
}

/** Dev/playtest only. See game/devReset.ts's resetEverything (Commercial Prototype Phase 11). */
export function resetPreferences(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
