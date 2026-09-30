import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, LaneId, Side } from '../../game/types';
import { ALL_CARDS, getCard } from '../../game/cards';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { cardCombatBattleEffects, cardCombatEffectLines } from '../../game/cardCombat/cardText';
import { getCombatCard, hasCombatOverride } from '../../game/cardCombat/cards';
import { createCardMatch, passiveEffectStates } from '../../game/cardCombat/engine';
import { BoardChit } from '../BoardChit';
import { HandCard } from '../HandCard';
import { SpellZoneChit } from '../SpellZoneChit';
import { CollectibleCard } from '../CollectibleCard';
import { CombatDisplayContext, type CardCombatDisplay } from '../combatDisplay';
import { BattleCard } from './BattleCard';

// Battle UX pass, task 2: every combat effect is on the card in hand and on the board, so Card Inspect is optional.

const display = (passive?: Map<string, Map<number, boolean>>): CardCombatDisplay => ({
  hpContribution: () => 77,
  masteryStage: () => 1,
  passiveStates: (id) => passive?.get(id),
});
const inCardCombat = (el: ReactElement, passive?: Map<string, Map<number, boolean>>) => renderToStaticMarkup(createElement(CombatDisplayContext.Provider, { value: display(passive) }, el));
/** Visible text of the markup, entities decoded, with the tags dropped. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

function unit(cardId: string, overrides: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: `u-${cardId}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: 113, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, ...overrides };
}

const handProps = (cardId: string) => ({ hand: { handId: 'h1', cardId }, selected: false, style: {}, onSelect: () => {}, onInspect: () => {}, onDragStart: () => {}, onDragEnd: () => {} });

describe('Battle UX: Royal Guard is readable without Card Inspect', () => {
  const ROYAL_GUARD = 'kng-royal-guard';

  it('5. in hand: both effects, with their timing, in full wording, and no HP Contribution', () => {
    const html = inCardCombat(createElement(HandCard, handProps(ROYAL_GUARD)));
    const t = text(html);
    expect(t).toContain('Royal Guard');
    expect(t).toContain('On Play');
    expect(t).toContain('Adjacent allied Units gain +15 ATK for the rest of the battle.');
    expect(t).toContain('Passive');
    expect(t).toContain('While another Kingdom Unit is in play, enemy Spells can’t affect this Unit.');
    expect(t).toContain('113');
    expect(t).not.toContain('+77');
    expect(html).toContain('battle-card v-hand');
  });

  it('6. on the board: both effects in board wording, current ATK, and whether the immunity is on', () => {
    const guard = unit(ROYAL_GUARD);
    const html = inCardCombat(createElement(BoardChit, { hero: guard, side: 'player', onClick: () => {} }), new Map([[guard.instanceId, new Map([[1, true]])]]));
    const t = text(html);
    expect(t).toContain('On Play');
    expect(t).toContain('Adjacent allies +15 ATK for the rest of the battle.');
    expect(t).toContain('Passive');
    expect(t).toContain('Spell Immune while another Kingdom Unit is in play.');
    expect(t).toContain('active');
    expect(t).not.toContain('Adj+1');
    expect(t).not.toContain('…');
  });

  it('8. the Info button is still on every hand card, and a board card is still a button that opens Card Inspect', () => {
    expect(inCardCombat(createElement(HandCard, handProps(ROYAL_GUARD)))).toContain('aria-label="Inspect Royal Guard"');
    const board = inCardCombat(createElement(BoardChit, { hero: unit(ROYAL_GUARD), side: 'enemy', onClick: () => {} }));
    expect(board).toMatch(/^<button type="button" class="zone-card hero-zone-card card-face theirs/);
    expect(board).toContain('Tap to inspect.');
  });
});

describe('Battle UX: multi-effect cards never drop an effect', () => {
  const cards = ALL_CARDS.filter((c) => !c.id.startsWith('tok-'));

  it('the battle lines are exactly the card-combat effect lines, with a board wording for each', () => {
    for (const card of cards) {
      const lines = cardCombatEffectLines(card.id);
      const effects = cardCombatBattleEffects(card.id);
      expect(effects.length, card.id).toBe(lines.length);
      const visible = getCombatCard(card.id).abilities.filter((a) => !hasCombatOverride(card.id) || a.text !== '');
      expect(effects.length, card.id).toBe(visible.length);
      for (const e of effects) {
        expect(e.text.length, card.id).toBeGreaterThan(0);
        expect(e.compact.length, card.id).toBeGreaterThan(0);
        expect(e.compact, card.id).not.toMatch(/…|\.\.\./);
        expect(e.compact.length, `${card.id}: ${e.compact}`).toBeLessThanOrEqual(95);
      }
    }
  });

  it('7. every card shows every effect: all full lines in hand, all board lines on the board or in its Spell zone', () => {
    let multi = 0;
    for (const card of cards) {
      const effects = cardCombatBattleEffects(card.id);
      if (effects.length > 1) multi++;
      const hand = text(renderToStaticMarkup(createElement(BattleCard, { cardId: card.id, variant: 'hand' })));
      const board = text(renderToStaticMarkup(createElement(BattleCard, { cardId: card.id, variant: card.type === 'hero' ? 'board' : 'spell' })));
      for (const e of effects) {
        expect(hand, card.id).toContain(e.text.replace(/\s+/g, ' '));
        expect(hand, card.id).toContain(e.compact.replace(/\s+/g, ' '));
        expect(board, card.id).toContain(e.compact.replace(/\s+/g, ' '));
        expect(board, card.id).toContain(e.label);
      }
      if (effects.length === 0) expect(board, card.id).toContain('No effect');
    }
    expect(multi).toBeGreaterThanOrEqual(25);
  });

  it('the Legendary Paladin shows Shield, Guard 3 and its heal, each with its timing', () => {
    const t = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-paladin', variant: 'board' })));
    expect(t).toContain('On Play This Unit gains a Shield.');
    expect(t).toContain('On Clash Guard 3: +45 ATK this round if it would lose its lane.');
    expect(t).toContain('Enemy Destroyed · once per round');
    expect(t).toContain('restore 45 HP to your player.');
  });

  it('a Continuous Spell on the board shows its rule in its Spell zone', () => {
    const html = inCardCombat(createElement(SpellZoneChit, { spell: { instanceId: 's1', cardId: 'spl-burning-ground', faction: 'infernal', name: 'Burning Ground', shortName: 'Burning Ground', usedThisRound: false } as never, side: 'enemy', onClick: () => {} }));
    expect(text(html)).toContain('Round End Enemy Unit here: −15 ATK for the rest of the battle.');
  });

  it('battle wording drops a timing phrase the label already shows, and keeps Guard', () => {
    const blood = cardCombatBattleEffects('inf-blood-demon');
    expect(blood[1].label).toBe('On Clash');
    expect(blood[1].text).toBe('If an allied Unit died this round, gain +30 ATK this round.');
    expect(cardCombatBattleEffects('und-dark-priest')[0].text).toBe('Guard 2: if this Unit would lose its lane, gain +30 ATK this round.');
  });
});

describe('Battle UX: live ATK and effect state', () => {
  it('9. a buffed Unit shows its current ATK, with the printed ATK beside it', () => {
    const html = renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-royal-guard', variant: 'board', atk: 128, tempAtk: 15 }));
    expect(html).toContain('bc-atk up');
    expect(html).toContain('<strong>128</strong>');
    expect(html).toContain('<s class="bc-atk-printed">113</s>');
    expect(text(html)).toContain('+15 this round');
    const weak = renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-royal-guard', variant: 'board', atk: 68 }));
    expect(weak).toContain('bc-atk down');
    const plain = renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-royal-guard', variant: 'board' }));
    expect(plain).toContain('<strong>113</strong>');
    expect(plain).not.toContain('bc-atk-printed');
  });

  it('a board chit reads the ATK GamePage passes it (base + this round + Continuous Spells)', () => {
    const html = inCardCombat(createElement(BoardChit, { hero: unit('kng-royal-guard', { power: 143, tempPower: 15 }), side: 'player', onClick: () => {} }));
    expect(html).toContain('<strong>143</strong>');
    expect(html).toContain('bc-atk up');
  });

  function boardWith(units: { side: Side; lane: LaneId; cardId: string; silenced?: boolean }[]): GameState {
    const s = createCardMatch({ seed: 1, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
    for (const u of units) s[u.side].heroZones[u.lane] = unit(u.cardId, { instanceId: `${u.side}-${u.lane}`, silenced: !!u.silenced });
    return s;
  }

  it('Royal Guard’s Spell immunity reads active only while another Kingdom Unit is in play, and never while silenced', () => {
    expect(passiveEffectStates(boardWith([{ side: 'player', lane: 'center', cardId: 'kng-royal-guard' }]), 'player').get('player-center')?.get(1)).toBe(false);
    const both = boardWith([
      { side: 'player', lane: 'center', cardId: 'kng-royal-guard' },
      { side: 'player', lane: 'left', cardId: 'kng-common-knight' },
    ]);
    expect(passiveEffectStates(both, 'player').get('player-center')?.get(1)).toBe(true);
    const hushed = boardWith([
      { side: 'player', lane: 'center', cardId: 'kng-royal-guard', silenced: true },
      { side: 'player', lane: 'left', cardId: 'kng-common-knight' },
    ]);
    expect(passiveEffectStates(hushed, 'player').get('player-center')?.get(1)).toBe(false);
    // Unconditional or non-passive effects carry no state tag.
    expect(passiveEffectStates(both, 'player').get('player-left')).toBeUndefined();
  });

  it('a silenced Unit keeps its rules visible and says they are off', () => {
    const t = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-royal-guard', variant: 'board', silenced: true })));
    expect(t).toContain('Silenced this round');
    expect(t).toContain('Spell Immune while another Kingdom Unit is in play.');
  });
});

describe('Battle UX: other screens keep their cards', () => {
  it('outside card combat, hand cards are still the collectible battle face', () => {
    const html = renderToStaticMarkup(createElement(HandCard, handProps('kng-royal-guard')));
    expect(html).toContain('data-mode="battle"');
    expect(html).not.toContain('battle-card');
    expect(renderToStaticMarkup(createElement(CollectibleCard, { cardId: 'kng-royal-guard' }))).not.toContain('battle-card');
  });

  it('outside card combat, a board chit keeps its legacy face', () => {
    const html = renderToStaticMarkup(createElement(BoardChit, { hero: unit('kng-royal-guard', { power: 5 }), side: 'player', onClick: () => {} }));
    expect(html).not.toContain('battle-card');
    expect(html).toContain('zone-card-footer');
  });
});
