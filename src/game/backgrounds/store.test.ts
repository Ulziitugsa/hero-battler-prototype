import { beforeEach, describe, expect, it } from 'vitest';
import { BACKGROUND_STORAGE_KEY, getSelectedBackgroundId, resetBackgroundForTests, selectBackground } from './store';
import { DEFAULT_BACKGROUND_ID } from './definitions';

function installLocalStorage() {
  const values = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

beforeEach(() => {
  installLocalStorage();
  localStorage.clear();
  resetBackgroundForTests();
});

describe('background selection', () => {
  it('persists available selections and rejects locked or unknown ones', () => {
    expect(getSelectedBackgroundId()).toBe(DEFAULT_BACKGROUND_ID);
    expect(selectBackground('emerald-canopy')).toBe(false);
    expect(selectBackground('not-a-background', 12)).toBe(false);
    expect(selectBackground('emerald-canopy', 3)).toBe(true);
    expect(getSelectedBackgroundId()).toBe('emerald-canopy');
    expect(localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe('emerald-canopy');
  });

  it('keeps the default available without campaign progress', () => {
    expect(selectBackground(DEFAULT_BACKGROUND_ID)).toBe(true);
    expect(getSelectedBackgroundId()).toBe(DEFAULT_BACKGROUND_ID);
  });

  it('allows any defined background with the test override and persists the choice', () => {
    expect(selectBackground('violet-grove', 0, true)).toBe(true);
    expect(getSelectedBackgroundId()).toBe('violet-grove');
    expect(localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe('violet-grove');
  });
});
