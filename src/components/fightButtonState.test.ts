import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FightSeal } from './FightSeal';
import { FIGHT_BUTTON_LABEL, fightButtonAriaLabel, fightButtonState, type FightButtonInput } from './fightButtonState';

const base: FightButtonInput = { planning: true, resolving: false, stagedCount: 0, selecting: false, handLeft: 4 };

describe('Fight button state', () => {
  it('planning with nothing staged is idle (still tappable: fighting passes the round)', () => {
    expect(fightButtonState(base)).toBe('idle');
  });
  it('a staged card makes it ready; a half-placed card keeps it idle until it lands', () => {
    expect(fightButtonState({ ...base, stagedCount: 1, handLeft: 3 })).toBe('ready');
    expect(fightButtonState({ ...base, stagedCount: 1, handLeft: 3, selecting: true })).toBe('idle');
  });
  it('an empty hand is ready: there is nothing left to place', () => {
    expect(fightButtonState({ ...base, handLeft: 0 })).toBe('ready');
  });
  it('resolving and waiting win over everything else', () => {
    expect(fightButtonState({ ...base, resolving: true, stagedCount: 2 })).toBe('resolving');
    expect(fightButtonState({ ...base, planning: false, waitingForOpponent: true })).toBe('waiting');
  });
  it('outside planning, or on a match the current rules can’t continue, it is disabled', () => {
    expect(fightButtonState({ ...base, planning: false })).toBe('disabled');
    expect(fightButtonState({ ...base, blocked: true, stagedCount: 2 })).toBe('disabled');
  });
  it('copy: "Fight" stays the call to action; the in-between states say what is happening', () => {
    expect(FIGHT_BUTTON_LABEL).toEqual({ disabled: 'Fight', idle: 'Fight', ready: 'Fight', resolving: 'Resolving', waiting: 'Waiting' });
    expect(fightButtonAriaLabel('ready', 2)).toBe('Fight with 2 cards staged');
    expect(fightButtonAriaLabel('idle', 0)).toBe('Fight without playing a card');
  });
});

describe('Fight button markup', () => {
  const render = (state: Parameters<typeof FightSeal>[0]['state'], stagedCount = 0) => renderToStaticMarkup(createElement(FightSeal, { state, stagedCount, onFight: () => {} }));
  it('idle and ready are enabled; disabled, resolving and waiting are not', () => {
    for (const s of ['idle', 'ready'] as const) expect(render(s)).not.toMatch(/disabled=""/);
    for (const s of ['disabled', 'resolving', 'waiting'] as const) expect(render(s)).toMatch(/disabled=""/);
  });
  it('carries its state for styling and says it is busy while resolving', () => {
    expect(render('ready', 1)).toContain('fight-seal-mount is-ready');
    expect(render('ready', 1)).toContain('aria-label="Fight with 1 card staged"');
    expect(render('resolving')).toContain('aria-busy="true"');
    expect(render('resolving')).toContain('>Resolving<');
  });
});

describe('Fight button mobile layout', () => {
  const hosts = readFileSync(new URL('../styles/battleCardHosts.css', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
  it('is a wide, low plate that fits the clash gap between the Unit rows at any phone width', () => {
    const rule = hosts.match(/\.fight-seal-mount \{([^}]*)\}/)![1];
    const width = Number(rule.match(/width: ([\d.]+)%/)![1]);
    const ratio = Number(rule.match(/aspect-ratio: ([\d.]+)/)![1]);
    // The scene is 390x844 scaled to the screen; the gap between the enemy Unit row (ends 39.82%) and the player's (starts 46.45%).
    const heightPx = (width / 100) * 390 / ratio;
    const gapPx = (46.45 - 39.82) / 100 * 844;
    expect(heightPx).toBeLessThanOrEqual(gapPx - 12);
    expect(width).toBeLessThan(45); // clear of the side lanes' cards and the clash call-outs
  });
  it('motion is restrained: only the ready state breathes, and reduced motion stops it', () => {
    expect(css).toMatch(/\.fight-seal-mount\.is-ready::before \{[^}]*animation: fight-breathe 2\.8s/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.fight-seal-mount\.is-ready::before \{ animation: none/);
  });
});
