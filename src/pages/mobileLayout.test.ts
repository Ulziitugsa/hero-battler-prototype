/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Responsive rules are CSS, so the important ones are pinned by reading the stylesheets: a regression that
// re-derives page WIDTH from viewport HEIGHT (what shrank Battle/Campaign on iPhone Safari) fails here.

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const css = (file: string): string => read(`../styles/${file}`);
const heroesPageSrc = read('./HeroesPage.tsx');

/** Splits a stylesheet into top-level chunks: plain rules, and @media blocks tagged with their query. */
function topLevelBlocks(source: string): { query: string | null; text: string }[] {
  const out: { query: string | null; text: string }[] = [];
  let i = 0;
  let plainStart = 0;
  while (i < source.length) {
    if (source.startsWith('@media', i)) {
      out.push({ query: null, text: source.slice(plainStart, i) });
      const open = source.indexOf('{', i);
      const query = source.slice(i + 6, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === '{') depth++;
        else if (source[j] === '}') depth--;
        j++;
      }
      out.push({ query, text: source.slice(open + 1, j - 1) });
      i = j;
      plainStart = j;
    } else {
      i++;
    }
  }
  out.push({ query: null, text: source.slice(plainStart) });
  return out;
}

describe('page width is never derived from viewport height (iPhone Safari dvh shrink)', () => {
  it('global.css uses `(100dvh - ...) * 390 / 844` only inside the desktop min-width query', () => {
    const blocks = topLevelBlocks(css('global.css'));
    const offenders = blocks.filter((b) => b.text.includes('* 390 / 844'));
    expect(offenders.length).toBeGreaterThan(0); // the desktop phone frame still exists
    for (const b of offenders) expect(b.query, 'height-derived width outside a desktop query').toMatch(/min-width:\s*900px/);
  });
  it('Battle and Campaign stages default to the full screen width', () => {
    const plain = topLevelBlocks(css('global.css')).filter((b) => b.query === null).map((b) => b.text).join('\n');
    for (const sel of ['.battle-stage', '.campaign-world-stage']) {
      const rule = plain.slice(plain.indexOf(`${sel} {`)).split('}')[0];
      expect(rule, sel).toMatch(/width:\s*100%/);
      expect(rule, sel).toMatch(/max-width:\s*480px/);
      expect(rule, sel).not.toMatch(/dvh\)?\s*-/);
    }
  });
  it('the pack-opening ceremony lays out inside a phone-width canvas, not the whole viewport', () => {
    expect(css('revealRitual.css')).toMatch(/\.ritual-canvas \{[^}]*width:\s*min\(100%,\s*480px\)/);
  });
});

describe('Heroes grid', () => {
  it('is three columns, matching Decks density', () => {
    expect(css('heroes.css')).toMatch(/\.hr-grid \{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });
  it('the tile is the shared standard card face - no separate role/faction wording line', () => {
    const tile = heroesPageSrc.slice(heroesPageSrc.indexOf('function HeroTile'), heroesPageSrc.indexOf('export function HeroesPage'));
    expect(tile).not.toContain('hr-card-role');
    expect(tile).toContain('<GameCard');
    expect(tile).toContain('density="tile"');
  });
});
