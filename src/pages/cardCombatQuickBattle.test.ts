import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../game/cards/starterDecks';
import { deckSummary } from '../game/decks/deckSummary';
import { GamePage } from './GamePage';

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
});
