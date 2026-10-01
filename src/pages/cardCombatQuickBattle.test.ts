import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../game/cards/starterDecks';
import { deckSummary } from '../game/decks/deckSummary';
import { GamePage } from './GamePage';
import { ENEMY_DECK, PLAYER_DECK, buildBattleScene } from './battleScenes';

// The battle screen itself, rendered once per combat model: the HP meters must show each deck's own
// Starting HP in card combat (the Deck Builder's number), and the legacy 20 everywhere else.

const render = (combatModel?: 'card') =>
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

  it('legacy: unchanged 20 HP', () => {
    const html = render();
    expect(html).toContain('20 / 20');
  });

  it('card combat has the battle log a tap away; the dock opens only on a tap (Info layers pass)', () => {
    expect(render('card')).toContain('aria-label="Battle log"');
    expect(render()).not.toContain('aria-label="Battle log"');
    const { state, events } = buildBattleScene('3');
    const html = renderToStaticMarkup(createElement(GamePage, { playerDeck: PLAYER_DECK, enemyDeck: ENEMY_DECK, playerDeckLabel: 'Kingdom', enemyDeckLabel: 'Undead', onExit: () => {}, combatModel: 'card', initialState: state, initialEvents: events }));
    expect(html).not.toContain('battle-dock');
    expect(html).not.toContain('hand-fan readable peek');
    // A board card says what a tap does.
    expect(html).toContain('Royal Guard, 128 ATK. Tap for details.');
    expect(html).toContain('Battle Banner, Continuous. Tap for details.');
  });
});
