import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, LaneId, Side } from '../../game/types';
import { ALL_CARDS, getCard } from '../../game/cards';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { battleCopyLineCount, cardCombatBattleEffects, cardCombatEffectLines } from '../../game/cardCombat/cardText';
import { getCombatCard, hasCombatOverride } from '../../game/cardCombat/cards';
import { createCardMatch, passiveEffectStates } from '../../game/cardCombat/engine';
import { BoardChit } from '../BoardChit';
import { HandCard } from '../HandCard';
import { SpellZoneChit } from '../SpellZoneChit';
import { CollectibleCard } from '../CollectibleCard';
import { CombatDisplayContext, type CardCombatDisplay } from '../combatDisplay';
import { BattleCard } from './BattleCard';

// Battle UX pass, task 2: every combat effect is on the card in hand and on the board, so Card Inspect is optional.
// Info layers pass: each effect is a short battle line after its label ("On Play: Adjacent allies +15 ATK."), effects
// that share a label read as one paragraph, and the full rules move to the focus panel (BattleFocusPanel.test.ts).

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

  it('5. in hand: name, ATK and both effects in battle copy after their timing labels, and no HP Contribution', () => {
    const html = inCardCombat(createElement(HandCard, handProps(ROYAL_GUARD)));
    const t = text(html);
    expect(t).toContain('Royal Guard ATK 113');
    expect(t).toContain('On Play: Adjacent allies +15 ATK.');
    expect(t).toContain('Passive: Spell Immune with Kingdom ally.');
    expect(t).not.toContain('+77');
    expect(html).toContain('battle-card v-hand');
    // The full sentences stay in Card Inspect (and the card's accessible label).
    expect(t).not.toContain('for the rest of the battle');
  });

  it('6. on the board: both effects in board wording, current ATK, and whether the immunity is on', () => {
    const guard = unit(ROYAL_GUARD);
    const html = inCardCombat(createElement(BoardChit, { hero: guard, side: 'player', onClick: () => {} }), new Map([[guard.instanceId, new Map([[1, true]])]]));
    const t = text(html);
    expect(t).toContain('Royal Guard ATK 113');
    expect(t).toContain('On Play: Adjacent allies +15 ATK.');
    expect(t).toContain('Passive: Spell Immune with Kingdom ally.');
    expect(html).toContain('bc-state on');
    expect(html).toContain('aria-label="active now"');
    expect(t).not.toContain('Adj+1');
    expect(t).not.toContain('…');
  });

  it('8. the Info button is still on every hand card, and a board card is still a button that opens its details', () => {
    expect(inCardCombat(createElement(HandCard, handProps(ROYAL_GUARD)))).toContain('aria-label="Inspect Royal Guard"');
    const board = inCardCombat(createElement(BoardChit, { hero: unit(ROYAL_GUARD), side: 'enemy', onClick: () => {} }));
    expect(board).toMatch(/^<button type="button" class="zone-card hero-zone-card card-face theirs/);
    expect(board).toContain('Tap for details.');
  });
});

describe('Battle UX: multi-effect cards never drop an effect', () => {
  const cards = ALL_CARDS.filter((c) => !c.id.startsWith('tok-'));

  it('the battle lines are exactly the card-combat effect lines, each with its own short battle copy', () => {
    for (const card of cards) {
      const lines = cardCombatEffectLines(card.id);
      const effects = cardCombatBattleEffects(card.id);
      expect(effects.length, card.id).toBe(lines.length);
      expect(battleCopyLineCount(card.id), card.id).toBe(lines.length);
      const visible = getCombatCard(card.id).abilities.filter((a) => !hasCombatOverride(card.id) || a.text !== '');
      expect(effects.length, card.id).toBe(visible.length);
      for (const e of effects) {
        expect(e.text.length, card.id).toBeGreaterThan(0);
        expect(e.compact.length, card.id).toBeGreaterThan(0);
        expect(e.compact, card.id).not.toMatch(/…|\.\.\./);
        expect(e.compact.length, `${card.id}: ${e.compact}`).toBeLessThanOrEqual(70);
        expect(e.compact.length, `${card.id}: battle copy should be shorter than the Inspect sentence`).toBeLessThanOrEqual(e.text.length);
        expect(e.board.length, `${card.id}: board wording is never longer than the hand's`).toBeLessThanOrEqual(e.compact.length);
        // Short, but never cryptic: no abbreviations beyond ATK and HP, and no symbols for words.
        expect(`${e.chip} ${e.compact}`, card.id).not.toMatch(/\b(Adj|Grv|GY|Dmg|Eff|Imm|Rnd)\b|[≤≥→×]/);
      }
    }
  });

  it('7. every card shows every effect, after its timing label, in hand and on the board or in its Spell zone', () => {
    let multi = 0;
    let grouped = 0;
    for (const card of cards) {
      const effects = cardCombatBattleEffects(card.id);
      if (effects.length > 1) multi++;
      const hand = text(renderToStaticMarkup(createElement(BattleCard, { cardId: card.id, variant: 'hand' })));
      const boardVariant = card.type === 'hero' ? 'board' : 'spell';
      const board = text(renderToStaticMarkup(createElement(BattleCard, { cardId: card.id, variant: boardVariant })));
      // Effects that share a label read as one paragraph under it; a one-time Spell's On Play is what the card is (it
      // happens when played), so it carries no label.
      const paragraphs = (wording: 'compact' | 'board') => {
        const out: string[] = [];
        let last = '';
        for (const e of effects) {
          const implied = card.type === 'spell' && card.spellKind !== 'CONTINUOUS' && e.trigger === 'ON_PLAY';
          const lead = implied ? '' : `${e.chip}: `;
          if (out.length > 0 && lead === last) out[out.length - 1] += ` ${e[wording]}`;
          else out.push(`${lead}${e[wording]}`);
          last = lead;
        }
        return out.map((p) => p.replace(/\s+/g, ' '));
      };
      const handParagraphs = paragraphs('compact');
      if (handParagraphs.length < effects.length) grouped++;
      for (const p of handParagraphs) expect(hand, card.id).toContain(p);
      for (const p of paragraphs(boardVariant === 'board' ? 'board' : 'compact')) expect(board, card.id).toContain(p);
      if (effects.length === 0) expect(board, card.id).toContain('No effect');
    }
    expect(multi).toBeGreaterThanOrEqual(25);
    expect(grouped).toBeGreaterThanOrEqual(5);
  });

  it('effects that share a label read as one paragraph under it', () => {
    const html = renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-light-priest', variant: 'hand' }));
    expect(text(html)).toContain('On Play: Restore 135 HP. Gain a Shield. Your Spell: +15 ATK this round.');
    expect(html.match(/class="bc-when"/g)).toHaveLength(2);
    expect(text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'und-vharos', variant: 'board' })))).toContain('Destroyed: Revive here with 95 ATK. Gain a random Graveyard Undead.');
  });

  it('the board drops a phrase that stops mattering once the card is in play', () => {
    const miraHand = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'und-mira', variant: 'hand' })));
    const miraBoard = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'und-mira', variant: 'board' })));
    expect(miraHand).toContain('On Play: With 4 or fewer in hand, gain weakest Graveyard Undead.');
    expect(miraBoard).toContain('On Play: Gain weakest Graveyard Undead.');
    expect(text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'und-shade-thief', variant: 'hand' })))).toContain('from next round');
    expect(text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'und-shade-thief', variant: 'board' })))).not.toContain('from next round');
  });

  it('reads in the register of the brief: label, colon, a short line', () => {
    const vael = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-archmage-vael', variant: 'hand' })));
    expect(vael).toContain('Passive: Your first one-time Spell each round repeats.');
    expect(vael).toContain('Your 2nd Spell: Deal 90 damage.');
    expect(vael).toContain('Round End: If hand is empty, gain a Graveyard Spell.');
    const runebreaker = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'inf-runebreaker', variant: 'board' })));
    expect(runebreaker).toContain('On Play: Destroy enemy Continuous Spell here. Passive: Spell Immune with Mage Slayer ally. Enemy’s 2nd Spell: Deal 90 damage.');
  });

  it('the Legendary Paladin shows Shield, Guard 3 and its heal, each with its timing', () => {
    const t = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-paladin', variant: 'board' })));
    expect(t).toContain('On Play: Gain a Shield.');
    expect(t).toContain('Guard 3: +45 ATK this round if losing.');
    expect(t).toContain('Enemy Falls: If it fell here, restore 45 HP.');
  });

  it('a Continuous Spell on the board shows its rule in its Spell zone', () => {
    const html = inCardCombat(createElement(SpellZoneChit, { spell: { instanceId: 's1', cardId: 'spl-burning-ground', faction: 'infernal', name: 'Burning Ground', shortName: 'Burning Ground', usedThisRound: false } as never, side: 'enemy', onClick: () => {} }));
    expect(text(html)).toContain('Burning Ground Round End: Enemy here −15 ATK.');
  });

  it('a Spell names its kind where a Unit shows ATK, and a one-time Spell reads without an "On Play" label', () => {
    const fireballHtml = renderToStaticMarkup(createElement(BattleCard, { cardId: 'spl-fireball', variant: 'hand' }));
    const fireball = text(fireballHtml);
    expect(fireball).toContain('Fireball Spell Enemy here −60 ATK. With their Continuous Spell here, it becomes 50 ATK instead.');
    expect(fireball).not.toContain('On Play');
    expect(fireballHtml).not.toContain('bc-atk');
    const ground = renderToStaticMarkup(createElement(BattleCard, { cardId: 'spl-cursed-ground', variant: 'hand' }));
    expect(ground).toMatch(/class="bc-stat bc-kind-stat"><span class="bc-stat-label">Continuous<\/span>/);
    expect(text(ground)).toContain('Enemy Falls: Your Unit here +15 ATK.');
    expect(text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'spl-cursed-ground', variant: 'inspect' })))).toContain('Continuous Spell');
  });

  it('battle wording drops a timing phrase the label already shows, and a keyword label replaces the timing', () => {
    const blood = cardCombatBattleEffects('inf-blood-demon');
    expect(blood[1].label).toBe('On Clash');
    expect(blood[1].text).toBe('If an allied Unit died this round, gain +30 ATK this round.');
    const priest = cardCombatBattleEffects('und-dark-priest')[0];
    expect([priest.chip, priest.text, priest.compact]).toEqual(['Guard 2', 'If this Unit would lose its lane, gain +30 ATK this round.', '+30 ATK this round if losing.']);
    // Card Inspect keeps the keyword in its own line.
    expect(cardCombatEffectLines('und-dark-priest')[0].text).toBe('Guard 2: Before Combat, if this Unit would lose its lane, gain +30 ATK this round.');
    expect(cardCombatBattleEffects('inf-runebreaker')[2].chip).toBe('Enemy’s 2nd Spell');
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
    expect(t).toContain('Spell Immune with Kingdom ally.');
  });
});

describe('Battle UX: Card Inspect density', () => {
  it('the Inspect face is the same card with HP Contribution beside ATK, and Card Inspect lists the full wording under it', () => {
    const face = text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-royal-guard', variant: 'inspect', hpContribution: 77 })));
    expect(face).toContain('Royal Guard HP +77 ATK 113');
    expect(face).toContain('On Play: Adjacent allies +15 ATK. Passive: Spell Immune with Kingdom ally.');
    const full = cardCombatBattleEffects('kng-royal-guard').map((e) => `${e.label} ${e.text}`);
    expect(full).toEqual(['On Play Adjacent allied Units gain +15 ATK for the rest of the battle.', 'Passive While another Kingdom Unit is in play, enemy Spells can’t affect this Unit.']);
    for (const variant of ['hand', 'board'] as const) {
      expect(text(renderToStaticMarkup(createElement(BattleCard, { cardId: 'kng-royal-guard', variant }))), variant).not.toContain('+77');
    }
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
