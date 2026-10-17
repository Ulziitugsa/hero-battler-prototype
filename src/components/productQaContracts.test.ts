/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HowToPlaySheet } from './HowToPlaySheet';

// Polish Pass 5: final mobile product QA. Regression guards for the defects it fixed (the Campaign starter-progress fix
// is covered in game/campaign/rewards.test.ts, the drag fixes in feedback/interactionContracts.test.ts).

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

describe('sheets are dialogs a keyboard (and Android back) can leave', () => {
  it('How to play is a labelled modal dialog wired to the shared focus hook', () => {
    const html = renderToStaticMarkup(createElement(HowToPlaySheet, { onClose: () => {} }));
    expect(html).toMatch(/class="how-to-play-sheet" role="dialog" aria-modal="true" aria-labelledby="how-to-play-title"/);
    expect(html).toContain('id="how-to-play-title"');
    expect(read('./HowToPlaySheet.tsx')).toContain('useDialogFocus(onClose)');
  });

  it('the focus hook runs once per sheet: a parent re-render with a new close handler does not pull focus back to the start', () => {
    const src = read('./useDialogFocus.ts');
    expect(src).toContain('const escape = useRef(onEscape);');
    expect(src).toMatch(/escape\.current\(\);[\s\S]*\}, \[\]\);\n  return ref;/);
    expect(src).not.toContain('[onEscape]');
  });

  it('keys still reach the topmost sheet when focus fell out of it (a claimed reward\'s button disabled under the finger)', () => {
    const src = read('./useDialogFocus.ts');
    expect(src).toContain("document.addEventListener('keydown', stray);");
    expect(src).toContain("document.removeEventListener('keydown', stray);");
    expect(src).toContain('if (open.at(-1) !== dialog) return;');
  });
});

describe('developer tools stay out of battles with stakes in a production build', () => {
  it('New match and the developer panel show in Quick Battle (and any development build) only', () => {
    const src = read('../pages/GamePage.tsx');
    expect(src).toContain("const devToolsShown = import.meta.env.DEV || (battleMode === 'quick' && !remoteOpponent);");
    expect(src).toContain('hideNewMatch={!!remoteOpponent || !devToolsShown}');
    expect(src).toContain('{devToolsShown && <button type="button" className="mobile-debug-toggle"');
    // The side panel a desktop (900px+) shows beside the battle, with its "reveal hand" toggle.
    expect(src).toContain('{devToolsShown && <DebugPanel seed={seed} state={gameState} lastAiAction={lastAiAction} fullLog={fullLog} />}');
    expect(src.match(/<DebugPanel /g)).toHaveLength(2);
  });
});

describe('visual consistency', () => {
  const css = read('../styles/identity.css');
  it('sheets laid over a screen are opaque, so the screen beneath does not read through them', () => {
    expect(css).toContain('--mw-surface-sheet: linear-gradient(180deg, rgb(33, 62, 71), rgb(13, 34, 46));');
    for (const sel of ['.moon-game .missions-sheet {', '.moon-game .campaign-sheet {', '.moon-game .how-to-play-sheet {', '.moon-game .campaign-result-sheet']) {
      const block = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
      expect(block, sel).toContain('var(--mw-surface-sheet)');
    }
  });
  it('Friendly Battle uses the shared Moonwater materials', () => {
    expect(css).toMatch(/\.moon-game :is\(\.friendly-panel, \.friendly-invite, \.friendly-seats > div\) \{[^}]*border-radius: var\(--mw-radius\)/);
    expect(css).toMatch(/\.moon-game \.friendly-page \.moon-primary \{[^}]*var\(--mw-gold-face\)/);
  });
  it('small battle and Home controls take a finger-sized press without changing their look', () => {
    expect(css).toMatch(/\.side-header-pill\.interactive, \.home-shop-gift-link, \.home-collection-link, \.event-row-state > button\)::after \{ content: ''; position: absolute; inset: -8px -4px; \}/);
  });
});
