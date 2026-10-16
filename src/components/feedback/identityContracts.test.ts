/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldBackdrop } from '../WorldBackdrop';
import { HowToPlaySheet } from '../HowToPlaySheet';
import { StagePreviewSheet } from '../../pages/campaign/StagePreviewSheet';
import { RankedPage } from '../../pages/RankedPage';
import { CHAPTER_1 } from '../../game/campaign/chapter1';
import { resetRankedForTests } from '../../game/ranked/store';

// Polish Pass 3, the visual identity layer (styles/identity.css, docs/design/VISUAL-IDENTITY.md).

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const identity = read('../../styles/identity.css');
// The rules alone, without the comments that explain what they replaced.
const rules = identity.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the identity layer settles the cascade', () => {
  it('is the last stylesheet App imports, so it lands after every screen sheet App pulls in', () => {
    const app = read('../../App.tsx');
    const imports = [...app.matchAll(/^import .*$/gm)].map((m) => m[0]);
    expect(imports.at(-1)).toBe("import './styles/identity.css';");
  });
  it('scopes every rule to the game shell or its own backdrop layers, and loads nothing from elsewhere', () => {
    const selectors = [...rules.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter((s) => !/^(from|to|\d+%)/.test(s));
    expect(selectors.length).toBeGreaterThan(50);
    for (const selector of selectors) expect(selector, selector).toMatch(/\.moon-game|\.moon-world-/);
    expect(rules).not.toMatch(/url\(/);
    // One reading voice: no terminal face comes back through this layer.
    expect(rules).not.toMatch(/var\(--mono\)|Consolas|Georgia/);
  });
});

describe('atmosphere and transitions stay cheap and respect reduced motion', () => {
  const reduced = identity.slice(identity.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  it('the mist moves by transform alone, never by a filter, and stops under reduced motion and under a battle', () => {
    const drift = identity.slice(identity.indexOf('@keyframes mwMistDrift')).split('\n')[0];
    expect(drift).toMatch(/transform: translate3d/);
    // No blur anywhere in this layer: a blurred backdrop is re-filtered every frame something moves over it.
    expect(rules).not.toMatch(/filter:\s*blur/);
    expect(reduced).toContain('.moon-world-mist i { animation: none; }');
    expect(identity).toContain('.moon-game:has(.battle-stage) .moon-world-mist { display: none; }');
  });
  it('a screen change fades by opacity only, at zero specificity, so a screen\'s own entrance and its sheets are untouched', () => {
    expect(identity).toContain('@keyframes mwScreenIn { from { opacity: 0; } }');
    expect(identity).toMatch(/^:where\(\.moon-game \.app-frame-content > \*\) \{ animation: mwScreenIn/m);
    expect(reduced).toContain(':where(.moon-game .app-frame-content > *) { animation: none; }');
    expect(reduced).toContain('.moon-game .how-to-play-sheet { animation: none; }');
  });
  it('the backdrop draws its new layers as decoration only', () => {
    const html = renderToStaticMarkup(createElement(WorldBackdrop));
    expect(html).toMatch(/^<div class="moon-world"[^>]*aria-hidden="true"/);
    for (const layer of ['moon-world-halo', 'moon-world-mist', 'moon-world-vignette']) expect(html).toContain(`class="${layer}"`);
  });
});

describe('screens brought onto the shared surfaces show real content only', () => {
  it('a stage sheet shows the portrait its encounter names (it used to draw an empty frame)', () => {
    const node = CHAPTER_1.nodes.find((n) => n.encounter)!;
    const html = renderToStaticMarkup(createElement(StagePreviewSheet, { node, cleared: false, onFight: () => {}, onClose: () => {} }));
    expect(html).toMatch(/class="campaign-sheet-foe-portrait [a-z]+"><canvas[^>]*class="moon-art /);
  });
  it('How to play keeps its three steps and its one action, with Pip beside the title', () => {
    const html = renderToStaticMarkup(createElement(HowToPlaySheet, { onClose: () => {} }));
    expect(html).toContain('class="how-to-play-guide" aria-hidden="true"');
    expect(html.match(/class="how-to-play-step"/g)).toHaveLength(3);
    expect(html).toContain('>Got it</button>');
  });
  it('Ranked says plainly that no trials are recorded yet, instead of leaving the section out', () => {
    resetRankedForTests();
    const html = renderToStaticMarkup(createElement(RankedPage, { onBattle: () => {} }));
    expect(html).toContain('<h2>Recent trials</h2><p class="ranked-history-empty">No trials yet.');
  });
});
