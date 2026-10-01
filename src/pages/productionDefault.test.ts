import { readFileSync, existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../game/cards/starterDecks';
import { cardEffects } from '../game/cards/cardPresentation';
import { getCard } from '../game/cards';
import { deckSummary } from '../game/decks/deckSummary';
import type { BattleMode } from '../game/events/battleSummary';
import { GamePage } from './GamePage';

// The release's player-facing guarantees, checked on the real screens and files: every battle mode renders card combat
// with the Collection's own effect text, the focus/log affordances are everywhere, the old rules' words are gone from
// the player's screens, and the fonts ship with the app.

const MODES: BattleMode[] = ['quick', 'campaign', 'ranked', 'story'];
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/ /g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('every battle mode plays card combat with the Collection’s numbers', () => {
  for (const mode of MODES) {
    it(`${mode}: Starting HP from the decks, the battle log, and hand cards in the Collection’s exact wording`, () => {
      const html = renderToStaticMarkup(createElement(GamePage, { playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead, playerDeckLabel: 'You', enemyDeckLabel: 'Foe', onExit: () => {}, battleMode: mode }));
      const hp = deckSummary(STARTER_DECKS.kingdom).startingHp;
      expect(html).toContain(`${hp} / ${hp}`);
      expect(html).toContain('aria-label="Battle log"');
      expect(html).not.toContain('20 / 20');
      // The cards in this opening hand (the only named cards on screen at the start): the same compact lines the
      // Collection tile shows for them.
      const body = text(html);
      const inHand = [...new Set(STARTER_DECKS.kingdom)].filter((id) => body.includes(getCard(id).name));
      expect(inHand.length).toBeGreaterThan(0);
      for (const id of inHand) for (const e of cardEffects(id)) expect(body, `${mode} ${id}`).toContain(text(e.compact));
    });
  }

  it('a Campaign boss shows its HP pool on the HP bar', () => {
    const html = renderToStaticMarkup(createElement(GamePage, { playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead, playerDeckLabel: 'You', enemyDeckLabel: 'Vharos', onExit: () => {}, battleMode: 'campaign', startingHpOverride: { enemy: 1200 } }));
    expect(html).toContain('1200 / 1200');
  });
});

describe('the old rules’ words are gone from the player’s screens', () => {
  const FILES = [
    'components/HelpModal.tsx',
    'components/HowToPlaySheet.tsx',
    'components/XpSummary.tsx',
    'components/AppShell.tsx',
    'pages/HomePage.tsx',
    'pages/ProfilePage.tsx',
    'pages/RankedPage.tsx',
    'pages/BattleSetupPage.tsx',
    'pages/decks/DeckSummaryBar.tsx',
    'pages/campaign/StagePreviewSheet.tsx',
    'pages/campaign/StageResultSheet.tsx',
    'pages/heroes/AscensionPanel.tsx',
    'components/card/CardInspect.tsx',
  ];
  it.each(FILES)('%s', (file) => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    // Strings and JSX text only (comments may explain history).
    const shown = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(shown).not.toMatch(/Deck Strength|Roster Power|Hero Power|Legacy Level|Tactic Point|Tactic unlocked|\+1 Power|battles still start at|20 HP|Ascension coming later|classic rules/);
    expect(shown).not.toMatch(/['"`>][^'"`<]*\bPower\b(?! Surge)[^'"`<]*['"`<]/);
  });
});

describe('fonts ship with the app', () => {
  it('index.html loads nothing from Google Fonts, and every face is a bundled OFL package', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    const css = readFileSync(new URL('../styles/fonts.css', import.meta.url), 'utf8');
    const imports = [...css.matchAll(/@import '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBe(11);
    for (const spec of imports) {
      expect(spec).toMatch(/^@fontsource\/(cinzel|alegreya|alegreya-sc|bree-serif|nunito)\/latin-\d00\.css$/);
      const file = new URL(`../../node_modules/${spec}`, import.meta.url);
      expect(existsSync(file), spec).toBe(true);
      expect(readFileSync(file, 'utf8')).toMatch(/url\(\.\/files\/[a-z-]+-latin-\d00-normal\.woff2\)/);
      const family = spec.split('/')[1];
      expect(readFileSync(new URL(`../../node_modules/@fontsource/${family}/LICENSE`, import.meta.url), 'utf8')).toMatch(/SIL Open Font License/);
    }
    const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/import '\.\/styles\/fonts\.css'/);
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
    for (const f of ['cinzel', 'alegreya', 'alegreya-sc', 'bree-serif', 'nunito']) expect(pkg.dependencies[`@fontsource/${f}`]).toBeTruthy();
  });
});
