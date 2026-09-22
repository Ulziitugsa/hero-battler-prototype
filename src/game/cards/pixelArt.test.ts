import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLAYTEST_ROSTER } from './roster';
import { PIXEL_CARD_ART } from './pixelArt';

describe('playable card artwork', () => {
  it('covers every collectible card, including spells and expanded archetypes', () => {
    for (const id of PLAYTEST_ROSTER) {
      expect(PIXEL_CARD_ART[id], `Missing portrait: ${id}`).toBeDefined();
    }
  });
  it('ships valid PNG sheets and keeps every animation inside its sheet', () => {
    for (const [id, asset] of Object.entries(PIXEL_CARD_ART)) {
      const path = resolve('public', asset.src.slice(1));
      expect(existsSync(path), `${id}: ${path}`).toBe(true);
      const data = readFileSync(path);
      expect(data.subarray(1, 4).toString()).toBe('PNG');
      const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
      expect(Math.abs(width / asset.columns - height / asset.rows)).toBeLessThanOrEqual(1);
      expect(asset.cell).toBeGreaterThanOrEqual(0);
      expect(asset.cell + asset.frames).toBeLessThanOrEqual(asset.columns * asset.rows);
    }
  });
});
