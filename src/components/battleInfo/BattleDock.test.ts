import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LaneId, Side } from '../../game/types';
import { BattleFocusPanel, BattleLogPanel } from './BattleDock';
import { battleLogEntries } from './battleLog';
import { focusDetails, handCardDetails, type FocusDetails } from './focusDetails';
import { buildBattleScene } from '../../pages/battleScenes';

// The dock over card combat's hand apron (Info layers pass): the focus panel and the battle log, rendered.

const { state, events } = buildBattleScene('3');
/** The rendered text, a space between elements (none before punctuation). */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .trim();
const panel = (details: FocusDetails) => renderToStaticMarkup(createElement(BattleFocusPanel, { details, onClose: () => {}, onInspect: () => {} }));
const unit = (side: Side, lane: LaneId) => focusDetails({ kind: 'unit', side, instanceId: state[side].heroZones[lane]!.instanceId }, state, events, () => 77)!;

describe('focus panel', () => {
  it('Royal Guard on the board reads as one card: ATK, full rules, what is on now, and where its bonus comes from', () => {
    const html = panel(unit('player', 'center'));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Royal Guard, Your center lane"');
    expect(text(html)).toContain('Royal Guard Inspect');
    expect(text(html)).toContain('ATK 128');
    expect(text(html)).toContain('HP +77');
    expect(text(html)).toContain('On Play: Adjacent allied Units gain +15 ATK for the rest of the battle.');
    expect(text(html)).toContain('Passive: While another Kingdom Unit is in play, enemy Spells can’t affect this Unit. Active now.');
    expect(text(html)).toContain('Current bonus: +15 ATK from Battle Banner, while it stays (printed 113).');
    expect(html).toContain('aria-label="Close card details"');
    expect(html).toContain('aria-label="Inspect Royal Guard"');
  });

  it('an enemy Unit is marked as the enemy’s and says how it came back', () => {
    const html = panel(unit('enemy', 'left'));
    expect(html).toContain('bd-focus enemy board');
    expect(html).toContain('aria-label="Vharos, Enemy left lane"');
    expect(text(html)).toContain('Enemy');
    expect(text(html)).toContain('Status: Revived at 95 ATK (printed 130).');
  });

  it('a lasting bonus and a hand card', () => {
    expect(text(panel(unit('player', 'left')))).toContain('No effect. Current bonus: +15 ATK from Royal Guard (printed 128).');
    const vael = text(panel(handCardDetails('kng-archmage-vael', 98)));
    expect(vael).toContain('Passive: The first one-time Spell you cast each round resolves twice.');
    expect(vael).toContain('Your 2nd Spell:');
    expect(vael).toContain('Round End:');
    expect(vael).not.toContain('Current');
    expect(vael).not.toContain('Active now');
  });

  it('a Spell in its zone names its kind and the Units in its lane', () => {
    const banner = state.player.spellZones.center!;
    const html = panel(focusDetails({ kind: 'spell', side: 'player', instanceId: banner.instanceId }, state, events)!);
    expect(html).toContain('aria-label="Battle Banner, Your Spell, center lane"');
    expect(text(html)).toContain('Continuous Spell');
    expect(text(html)).toContain('Passive: Your Unit in this lane has +15 ATK.');
    expect(text(html)).toContain('In this lane: your Royal Guard.');
  });
});

describe('battle log panel', () => {
  const entries = battleLogEntries(events);

  it('between rounds: the whole match, newest at the bottom, closable', () => {
    const html = renderToStaticMarkup(createElement(BattleLogPanel, { entries, live: false, onClose: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain('Battle log Newest at the bottom');
    expect(html).toContain('aria-label="Close battle log"');
    expect(text(html)).toContain('Royal Guard — On Play: Common Knight and Light Priest +15 ATK');
    expect(text(html)).toContain('Clash Damage — Left: 35 to Enemy (Common Knight 128 beat Bone Soldier 93)');
    expect(html).toContain('bd-log-row player clash');
    expect(html).toContain('bd-log-row enemy clash');
  });

  it('while a round resolves: the round so far, as a live region with no close button', () => {
    const html = renderToStaticMarkup(createElement(BattleLogPanel, { entries: entries.slice(0, 3), live: true, round: 3 }));
    expect(html).toContain('role="log"');
    expect(text(html)).toContain('Round 3 Resolving');
    expect(html).not.toContain('Close battle log');
    expect(text(renderToStaticMarkup(createElement(BattleLogPanel, { entries: [], live: true, round: 3 })))).toContain('Cards reveal…');
    expect(text(renderToStaticMarkup(createElement(BattleLogPanel, { entries: [], live: false })))).toContain('Nothing yet.');
  });
});
