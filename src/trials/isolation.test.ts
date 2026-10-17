import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ALL_CARDS, getCard, isExperimentalCardId } from '../game/cards';
import { LAUNCH_DECKS, launchDeckList } from '../game/cards/launchDecks';
import { LAUNCH_ROSTER } from '../game/cards/launchRoster';
import { installStorageGuard } from '../lab/storageGuard';
import { TRIALS_PARAM, isTrialsUrl } from './access';
import { EXPERIMENTAL_CARDS } from './cards';

// Part G: the experiment is disposable and cannot reach real player data or the production game. (This file never
// registers the experimental cards: it checks the game as a production page load sees it.)

const IDS = EXPERIMENTAL_CARDS.map((c) => c.id);

describe('experimental cards stay out of the game', () => {
  it('no list the game reads holds an experimental card: catalogue, roster (so no Box), reference decks', () => {
    const lists = [ALL_CARDS.map((c) => c.id), LAUNCH_ROSTER.map((r) => r.id), ...LAUNCH_DECKS.map((d) => launchDeckList(d))];
    for (const list of lists) for (const id of IDS) expect(list).not.toContain(id);
  });

  it('unregistered, an experimental card does not exist (a production page load never registers them)', () => {
    for (const id of IDS) {
      expect(isExperimentalCardId(id)).toBe(false);
      expect(() => getCard(id)).toThrow(/Unknown card id/);
    }
  });

  it('every experimental id is marked as one and clashes with no real card', () => {
    for (const card of EXPERIMENTAL_CARDS) {
      expect(card.id.startsWith('xp-')).toBe(true);
      expect(card.tags).toContain('Experimental');
      expect(ALL_CARDS.some((c) => c.id === card.id || c.name === card.name)).toBe(false);
    }
  });

  it('nothing outside src/trials imports the trials or names an experimental card, except main.tsx', () => {
    const offenders: string[] = [];
    const walk = (dir: URL, rel: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name !== 'trials') walk(new URL(`${entry.name}/`, dir), `${rel}${entry.name}/`);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || rel + entry.name === 'main.tsx') continue;
        const text = readFileSync(new URL(entry.name, dir), 'utf8');
        if (/from '[^']*trials\//.test(text) || /import\('[^']*trials\//.test(text) || IDS.some((id) => text.includes(`'${id}'`))) offenders.push(rel + entry.name);
      }
    };
    walk(new URL('../', import.meta.url), '');
    expect(offenders).toEqual([]);
  });

  it('main.tsx opens the trials only behind the build gate and the ?trials parameter', () => {
    const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/if \(__CARD_LAB__ && trialsGuard\)/);
    expect(main).toMatch(/import\('\.\/trials\/mountTrials'\)/);
    expect(isTrialsUrl(`?${TRIALS_PARAM}`)).toBe(true);
    expect(isTrialsUrl('?lab')).toBe(false);
    expect(isTrialsUrl('')).toBe(false);
  });
});

describe('the save guard', () => {
  it('refuses every write to the guarded storage and counts them; reads still work; other storage is untouched', () => {
    const store = new Map<string, string>([['moonwater:save', 'kept']]);
    // A minimal Storage: methods on a prototype, like the browser's.
    class FakeStorage {
      getItem(k: string) {
        return store.get(k) ?? null;
      }
      setItem(k: string, v: string) {
        store.set(k, v);
      }
      removeItem(k: string) {
        store.delete(k);
      }
      clear() {
        store.clear();
      }
    }
    const guarded = new FakeStorage() as unknown as Storage;
    const other = new FakeStorage() as unknown as Storage;
    const guard = installStorageGuard(guarded);
    try {
      guarded.setItem('moonwater:save', 'changed');
      guarded.removeItem('moonwater:save');
      guarded.clear();
      expect(guarded.getItem('moonwater:save')).toBe('kept');
      expect(guard.blocked).toEqual(['setItem moonwater:save', 'removeItem moonwater:save', 'clear']);
      other.setItem('scratch', '1');
      expect(store.get('scratch')).toBe('1');
    } finally {
      guard.uninstall();
    }
  });
});
