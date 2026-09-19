import { SUMMON_BANNERS, isBannerId } from './banners';

// Which banner the player last looked at - a per-viewer convenience (Home's Summon plate echoes it), not game state.

const KEY = 'skyloom:summonBanner';

export function loadSelectedBanner(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (isBannerId(id)) return id;
  } catch {
    // ignore
  }
  return SUMMON_BANNERS[0].id;
}

export function saveSelectedBanner(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
}
