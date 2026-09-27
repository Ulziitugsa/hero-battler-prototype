import { track } from '../../analytics/track';
import { backgroundIsUnlocked, DEFAULT_BACKGROUND_ID, BACKGROUNDS, getBackground } from './definitions';

export const BACKGROUND_STORAGE_KEY = 'moonwater:selected-background';
const BACKGROUND_TEST_KEY = 'moonwater:dev:all-backgrounds';
const listeners = new Set<() => void>();
let snapshot: string | null = null;

export function getSelectedBackgroundId(): string {
  if (snapshot !== null) return snapshot;
  try {
    const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    snapshot = saved && BACKGROUNDS.some((background) => background.id === saved) ? saved : DEFAULT_BACKGROUND_ID;
  } catch {
    snapshot = DEFAULT_BACKGROUND_ID;
  }
  return snapshot;
}

export function subscribeBackground(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function backgroundTestingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('debug')) return true;
  if (!import.meta.env.DEV) return false;
  try { return localStorage.getItem(BACKGROUND_TEST_KEY) === '1'; } catch { return false; }
}

export function setBackgroundTestingEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  try { localStorage.setItem(BACKGROUND_TEST_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  for (const listener of [...listeners]) listener();
}

export function selectBackground(id: string, clearedNodes: number = 0, allowLocked = backgroundTestingEnabled()): boolean {
  if (!BACKGROUNDS.some((background) => background.id === id) || (!allowLocked && !backgroundIsUnlocked(getBackground(id), clearedNodes))) return false;
  try { localStorage.setItem(BACKGROUND_STORAGE_KEY, id); } catch { return false; }
  snapshot = id;
  for (const listener of [...listeners]) listener();
  track('background_selected', { backgroundId: id, source: 'profile' });
  return true;
}

export function resetBackgroundForTests(): void {
  snapshot = null;
  try { localStorage.removeItem(BACKGROUND_STORAGE_KEY); } catch { /* ignore */ }
  for (const listener of [...listeners]) listener();
}
