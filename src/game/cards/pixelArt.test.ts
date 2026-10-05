import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardArtwork } from '../../components/CardArtwork';
import { BoxArtwork } from '../../components/BoxArtwork';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLAYTEST_ROSTER } from './roster';
import { PIXEL_CARD_ART } from './pixelArt';
import { LAUNCH_CARD_IDS } from './launchRoster';
import { SHARED_CARD_ART, LAUNCH_PORTRAITS } from './launchArt';
import { TOKEN_CARDS } from './tokens';
import { getCard } from './index';
import { ARCHETYPE_BOXES } from '../box/archetypeBoxes';
import { BOX_ART } from '../box/boxArt';
import { cardArtUrl } from './art';

describe('playable card artwork', () => {
  it('covers all 116 launch cards, including Core, Structure Decks and event cards, plus tokens', () => {
    expect(LAUNCH_CARD_IDS).toHaveLength(116);
    for (const id of [...PLAYTEST_ROSTER, ...TOKEN_CARDS.map(c => c.id)]) {
      expect(PIXEL_CARD_ART[id], `Missing portrait: ${id}`).toBeDefined();
      expect(cardArtUrl(id), id).toBe(PIXEL_CARD_ART[id].src);
      const html = renderToStaticMarkup(createElement(CardArtwork, { cardId: id }));
      expect(html, id).toContain('<canvas');
      expect(html, id).not.toContain('moon-rune');
    }
  });
  it('keeps each Legendary identity distinct and excludes Legendaries from shared placeholders', () => {
    const legendary = LAUNCH_CARD_IDS.filter(id => getCard(id).rarity === 'legendary');
    const identities = legendary.map(id => `${PIXEL_CARD_ART[id].src}#${PIXEL_CARD_ART[id].cell}`);
    expect(new Set(identities).size).toBe(legendary.length);
    for (const [id, source] of Object.entries(SHARED_CARD_ART)) {
      expect(getCard(id).rarity, id).not.toBe('legendary');
      expect(getCard(source).rarity, source).not.toBe('legendary');
      expect(PIXEL_CARD_ART[id].src, id).toBe(PIXEL_CARD_ART[source].src);
      expect(PIXEL_CARD_ART[id].frames, id).toBe(1);
    }
    for (const id of LAUNCH_PORTRAITS) expect(PIXEL_CARD_ART[id].src).toBe(`/art/pixel/launch/${id}.png`);
  });
  it('retains the sigil fallback for non-launch experimental cards without art', () => {
    const html = renderToStaticMarkup(createElement(CardArtwork, { cardId: 'wld-forest-wolf' }));
    expect(html).toContain('moon-rune');
    expect(html).not.toMatch(/<img|<canvas/);
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
  it('ships nine distinct local Box illustrations and renders them through the product component', () => {
    expect(new Set(Object.values(BOX_ART)).size).toBe(9);
    for (const box of ARCHETYPE_BOXES) {
      const src = BOX_ART[box.id];
      expect(src.startsWith('/art/pixel/boxes/')).toBe(true);
      const data = readFileSync(resolve('public', src.slice(1)));
      expect(data.subarray(1, 4).toString()).toBe('PNG');
      expect(data.readUInt32BE(16)).toBe(480);
      expect(data.readUInt32BE(20)).toBe(320);
      expect(data.length).toBeLessThan(250_000);
      expect(renderToStaticMarkup(createElement(BoxArtwork, { boxId: box.id }))).toContain(`src="${src}"`);
    }
  });
});
