import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LaneId, Side } from '../../game/types';
import { BattleLogPanel } from './BattleDock';
import { CardFocusPanel } from '../card/CardFocusPanel';
import { battleLogEntries } from './battleLog';
import { cardFocusDetails, focusDetails, type FocusDetails } from './focusDetails';
import { buildBattleScene } from '../../pages/battleScenes';

// The dock over the hand apron in every battle mode: the focus panel (CardFocusPanel, dock layout) and the battle log.

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
const panel = (details: FocusDetails) => renderToStaticMarkup(createElement(CardFocusPanel, { details, layout: 'dock', onClose: () => {}, onInspect: () => {} }));
const unit = (side: Side, lane: LaneId) => focusDetails({ kind: 'unit', side, instanceId: state[side].heroZones[lane]!.instanceId }, state, events, { rules: 'card', hpContribution: () => 77 })!;

describe('focus panel', () => {
  it('Royal Guard on the board reads as one card: ATK, full rules, what is on now', () => {
    const html = panel(unit('player', 'left'));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Royal Guard, Your left lane"');
    expect(text(html)).toContain('Royal Guard Inspect');
    expect(text(html)).toContain('ATK 113');
    expect(text(html)).toContain('HP +77');
    expect(text(html)).toContain('Passive: Allies next to this Unit have +15 ATK.');
    expect(html).toContain('aria-label="Close card details"');
    expect(html).toContain('aria-label="Inspect Royal Guard"');
  });

  it('an enemy Unit is marked as the enemy’s and says how it came back', () => {
    const html = panel(unit('enemy', 'center'));
    expect(html).toContain('card-focus cf-dock battle-dock enemy board');
    expect(html).toContain('aria-label="Vharos, the Undying, Enemy center lane"');
    expect(text(html)).toContain('Enemy');
    expect(text(html)).toContain('Status: Revived at 95 ATK (printed 130).');
  });

  it('an Attached Spell’s bonus and an aura, each by source, and a hand card', () => {
    expect(text(panel(unit('player', 'center')))).toContain('No effect. Current bonuses: +15 ATK from Battle Banner, while it stays; +15 ATK from Royal Guard, while it is in play (printed 128).');
    const vael = text(panel(cardFocusDetails('kng-archmage-vael', { place: 'hand', hpContribution: 98 })));
    expect(vael).toContain('Passive: If the first Spell you cast each round is a one-time Spell, it happens twice.');
    expect(vael).toContain('When you cast a Spell: If it is your 2nd Spell this round, deal 90 damage to the enemy player.');
    expect(vael).toContain('Round End:');
    expect(vael).not.toContain('Current');
    expect(vael).not.toContain('Active now');
  });

  it('a Spell in its zone names its kind, the Unit it is attached to and the Units in its lane', () => {
    const banner = state.player.spellZones.center!;
    const html = panel(focusDetails({ kind: 'spell', side: 'player', instanceId: banner.instanceId }, state, events)!);
    expect(html).toContain('aria-label="Battle Banner, Your Spell, center lane"');
    expect(text(html)).toContain('Attached Spell');
    expect(text(html)).toContain('Passive: The Unit with this Spell has +15 ATK.');
    expect(text(html)).toContain('Attached to: Common Knight. It goes to the Graveyard when that Unit leaves play.');
    expect(text(html)).toContain('In this lane: your Common Knight, enemy Vharos, the Undying.');
  });
});

describe('battle log panel', () => {
  const entries = battleLogEntries(events);

  it('between rounds: the whole match, newest at the bottom, closable', () => {
    const html = renderToStaticMarkup(createElement(BattleLogPanel, { entries, live: false, onClose: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain('Battle log Newest at the bottom');
    expect(html).toContain('aria-label="Close battle log"');
    expect(text(html)).toContain('Battle Banner — Attached: Common Knight has +15 ATK');
    expect(text(html)).toContain('Clash Damage — Center: 50 to Enemy (Common Knight 143 beat Bone Soldier 93)');
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
