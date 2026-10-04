import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../game/cards/starterDecks';
import { deckSummary } from '../game/decks/deckSummary';
import { GamePage } from './GamePage';
import { ENEMY_DECK, PLAYER_DECK, buildBattleScene } from './battleScenes';

// The battle screen itself: by default (no combat model asked for) it plays card combat, so the HP meters show each
// deck's own Starting HP (the Deck Builder's number). The legacy resolver is reachable only by asking for it (dev).

const render = (combatModel?: 'card' | 'legacy') =>
  renderToStaticMarkup(createElement(GamePage, { playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead, playerDeckLabel: 'You', enemyDeckLabel: 'Undead', onExit: () => {}, combatModel }));

describe('Quick Battle screen', () => {
  it('card combat: both HP meters start at the decks’ own Starting HP, and hand cards show ATK only', () => {
    const html = render('card');
    const player = deckSummary(STARTER_DECKS.kingdom).startingHp;
    const enemy = deckSummary(STARTER_DECKS.undead).startingHp;
    expect(html).toContain(`${player} / ${player}`);
    expect(html).toContain(`${enemy} / ${enemy}`);
    expect(html).not.toContain('20 / 20');
    expect(html).not.toContain('card-stats-chip hp');
  });

  it('the default is card combat: no combat model asked for still starts at the decks’ Starting HP, never 20', () => {
    const html = render();
    const player = deckSummary(STARTER_DECKS.kingdom).startingHp;
    expect(html).toContain(`${player} / ${player}`);
    expect(html).not.toContain('20 / 20');
    expect(html).toContain('gc-');
  });

  it('a historical legacy battle (dev only) still renders at its fixed 20 HP', () => {
    expect(render('legacy')).toContain('20 / 20');
  });

  it('every battle mode has the battle log a tap away; the dock opens only on a tap', () => {
    expect(render('card')).toContain('aria-label="Battle log"');
    expect(render()).toContain('aria-label="Battle log"');
    expect(render('legacy')).toContain('aria-label="Battle log"');
    const { state, events } = buildBattleScene('3');
    const html = renderToStaticMarkup(createElement(GamePage, { playerDeck: PLAYER_DECK, enemyDeck: ENEMY_DECK, playerDeckLabel: 'Kingdom', enemyDeckLabel: 'Undead', onExit: () => {}, combatModel: 'card', initialState: state, initialEvents: events }));
    expect(html).not.toContain('battle-dock');
    expect(html).not.toContain('hand-fan readable peek');
    // A board card says what a tap does.
    expect(html).toContain('Common Knight, 158 ATK. Tap for details.');
    expect(html).toContain('Battle Banner, Attached Spell. Tap for details.');
  });

  it('a legacy battle shows the same card faces, in ATK, with no HP Contribution and no Power', () => {
    const html = render('legacy');
    expect(html).toContain('game-card d-hand');
    expect(html).not.toContain('gc-hpc');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\bPower\b(?! Surge)/);
  });
});
