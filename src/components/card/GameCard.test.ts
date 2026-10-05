import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, LaneId, Side } from '../../game/types';
import { ALL_CARDS, getCard } from '../../game/cards';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { battleCopyLineCount, cardCombatEffectLines } from '../../game/cardCombat/cardText';
import { getCombatCard } from '../../game/cardCombat/cards';
import { LAUNCH_NEW_CARD_IDS } from '../../game/cards/launchCards';
import { createCardMatch, passiveEffectStates } from '../../game/cardCombat/engine';
import { printedStats } from '../../game/cardCombat/stats';
import { cardEffects, legacyAtk, printedAtk, type CardRules } from '../../game/cards/cardPresentation';
import { BoardChit } from '../BoardChit';
import { HandCard } from '../HandCard';
import { SpellZoneChit } from '../SpellZoneChit';
import { CombatDisplayContext, type BattleCardDisplay } from '../combatDisplay';
import { GameCard, type GameCardDensity } from './GameCard';
import { CardFocusPanel } from './CardFocusPanel';
import { cardFocusDetails } from '../battleInfo/focusDetails';
import { CardInspect } from './CardInspect';
import { CardViewer } from './CardViewer';

// The global card system: one card face (GameCard) in every density, reading one presentation model (cardPresentation.ts)
// for every surface: hand, board, Spell zone, Collection/Deck Builder/Shop tiles and Card Inspect. Every effect is on
// the face in its compact wording; the focus panel and Card Inspect show the full rule.

function battleDisplay(rules: CardRules, passive?: Map<string, Map<number, boolean>>): BattleCardDisplay {
  return {
    rules,
    unitAtk: (u) => (rules === 'card' ? u.power : legacyAtk(u.power)),
    handAtk: () => undefined,
    tempAtk: (u) => (rules === 'card' ? u.tempPower : u.tempPower * 15),
    masteryRank: () => 0,
    hpContribution: rules === 'card' ? () => 77 : undefined,
    passiveStates: (id) => passive?.get(id),
  };
}
const inBattle = (el: ReactElement, rules: CardRules = 'card', passive?: Map<string, Map<number, boolean>>) =>
  renderToStaticMarkup(createElement(CombatDisplayContext.Provider, { value: battleDisplay(rules, passive) }, el));
const face = (cardId: string, density: GameCardDensity, props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(GameCard, { cardId, density, ...props }));
/** Visible text of the markup, entities decoded, with the tags dropped. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

function unit(cardId: string, overrides: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: `u-${cardId}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: 113, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, ...overrides };
}

const handProps = (cardId: string) => ({ hand: { handId: 'h1', cardId }, selected: false, style: {}, onSelect: () => {}, onInspect: () => {}, onDragStart: () => {}, onDragEnd: () => {} });
const ROYAL_GUARD = 'kng-royal-guard';
const CAPTAIN = 'kng-battle-captain';
const cards = ALL_CARDS.filter((c) => !c.id.startsWith('tok-'));

describe('a two-effect Unit reads without Card Inspect (Battle Captain)', () => {
  it('in hand: name, ATK and both effects after their timing labels, and no HP Contribution', () => {
    const html = inBattle(createElement(HandCard, handProps(CAPTAIN)));
    const t = text(html);
    expect(t).toContain('Battle Captain ATK 102');
    expect(t).toContain('Clash: Adjacent allies +15 ATK this round.');
    expect(t).toContain('Passive: Immune to Unit effects with Knight ally.');
    expect(t).not.toContain('+77');
    expect(html).toContain('game-card d-hand');
    // The full sentences live in the focus panel and Card Inspect.
    expect(t).not.toContain('adjacent allied Units');
  });

  it('on the board: both effects, current ATK, whether the immunity is on, and no Unit health', () => {
    const captain = unit(CAPTAIN);
    const html = inBattle(createElement(BoardChit, { hero: captain, side: 'player', onClick: () => {} }), 'card', new Map([[captain.instanceId, new Map([[1, true]])]]));
    const t = text(html);
    expect(t).toContain('Battle Captain ATK 113');
    expect(t).toContain('Clash: Adjacent allies +15 ATK this round.');
    expect(t).toContain('Passive: Immune to Unit effects with Knight ally.');
    expect(html).toContain('gc-state on');
    expect(html).toContain('aria-label="active now"');
    expect(t).not.toMatch(/\bHP\b/);
    expect(t).not.toContain('…');
  });

  it('a hand card keeps its Inspect button, and a board card is a button that opens its details', () => {
    expect(inBattle(createElement(HandCard, handProps(ROYAL_GUARD)))).toContain('aria-label="Inspect Royal Guard"');
    const board = inBattle(createElement(BoardChit, { hero: unit(ROYAL_GUARD), side: 'enemy', onClick: () => {} }));
    expect(board).toMatch(/^<button type="button" class="zone-card hero-zone-card card-face theirs/);
    expect(board).toContain('Tap for details.');
  });

  it('the Collection tile is the same card, with HP Contribution beside ATK', () => {
    const hpc = printedStats(getCard(CAPTAIN))!.hpc;
    const tile = text(face(CAPTAIN, 'tile', { hpContribution: hpc }));
    expect(tile).toContain(`Battle Captain HP +${hpc} ATK 102`);
    expect(tile).toContain('Clash: Adjacent allies +15 ATK this round. Passive: Immune to Unit effects with Knight ally.');
    const inspect = text(face(CAPTAIN, 'inspect', { hpContribution: hpc }));
    expect(inspect).toContain(`HP +${hpc} ATK 102`);
    for (const density of ['hand', 'board'] as const) expect(text(face(CAPTAIN, density)), density).not.toContain(`+${hpc}`);
  });
});

describe('every surface shares one effect model and never drops an effect', () => {
  it('the card-combat effects are exactly the card-combat rule lines, each with its own compact copy', () => {
    for (const card of cards) {
      const lines = cardCombatEffectLines(card.id);
      const effects = cardEffects(card.id);
      expect(effects.length, card.id).toBe(lines.length);
      expect(battleCopyLineCount(card.id), card.id).toBe(lines.length);
      const visible = getCombatCard(card.id).abilities.filter((a) => a.text !== '');
      expect(effects.length, card.id).toBe(visible.length);
      for (const e of effects) {
        expect(e.full.length, card.id).toBeGreaterThan(0);
        expect(e.compact.length, card.id).toBeGreaterThan(0);
        expect(e.compact, card.id).not.toMatch(/…|\.\.\./);
        expect(e.compact.length, `${card.id}: ${e.compact}`).toBeLessThanOrEqual(70);
        expect(e.compact.length, `${card.id}: compact copy should be shorter than the full rule`).toBeLessThanOrEqual(e.full.length);
        expect(e.board.length, `${card.id}: board wording is never longer than the hand's`).toBeLessThanOrEqual(e.compact.length);
        // Short, but never cryptic: no abbreviations beyond ATK and HP, and no symbols for words.
        expect(`${e.label} ${e.compact}`, card.id).not.toMatch(/\b(Adj|Grv|GY|Dmg|Eff|Imm|Rnd)\b|[≤≥→×]/);
      }
    }
  });

  it('the legacy rules list one effect per live ability (Card Mastery ones included), each with compact and full copy', () => {
    // The cards new in the launch set have no legacy rules: they read their card-combat rules on every surface.
    for (const card of cards.filter((c) => !LAUNCH_NEW_CARD_IDS.has(c.id))) {
      for (const rank of [0, 1, 2, 3]) {
        const effects = cardEffects(card.id, { rules: 'legacy', masteryRank: rank });
        expect(effects.length, `${card.id} rank ${rank}`).toBeGreaterThanOrEqual(card.abilities.length);
        for (const e of effects) {
          expect(e.compact.length, card.id).toBeGreaterThan(0);
          expect(e.full.length, card.id).toBeGreaterThan(0);
          expect(e.compact.length, `${card.id}: ${e.compact}`).toBeLessThanOrEqual(80);
          expect(e.compact, card.id).not.toMatch(/…|\.\.\./);
        }
      }
    }
  });

  /** Effects that share a label read as one paragraph under it; a one-time Spell's effect (Cast) carries no label. */
  function paragraphs(cardId: string, wording: 'compact' | 'board', rules: CardRules = 'card') {
    const card = getCard(cardId);
    const out: string[] = [];
    let last = '';
    for (const e of cardEffects(cardId, { rules })) {
      const implied = card.type === 'spell' && card.spellKind !== 'CONTINUOUS' && (e.trigger === 'CAST' || e.trigger === 'ON_PLAY');
      const lead = implied ? '' : `${e.label}: `;
      if (out.length > 0 && lead === last) out[out.length - 1] += ` ${e[wording]}`;
      else out.push(`${lead}${e[wording]}`);
      last = lead;
    }
    return out.map((p) => p.replace(/\s+/g, ' '));
  }

  it('every card shows every effect in hand, on the board or in its Spell zone, and on its Collection tile', () => {
    let multi = 0;
    let grouped = 0;
    for (const card of cards) {
      for (const rules of ['card', 'legacy'] as const) {
        const effects = cardEffects(card.id, { rules });
        if (rules === 'card' && effects.length > 1) multi++;
        const hand = text(face(card.id, 'hand', { rules }));
        const tile = text(face(card.id, 'tile', { rules }));
        const boardDensity = card.type === 'hero' ? 'board' : 'spell';
        const board = text(face(card.id, boardDensity, { rules }));
        const handParagraphs = paragraphs(card.id, 'compact', rules);
        if (rules === 'card' && handParagraphs.length < effects.length) grouped++;
        for (const p of handParagraphs) {
          expect(hand, `${card.id} ${rules}`).toContain(p);
          expect(tile, `${card.id} ${rules}`).toContain(p);
        }
        for (const p of paragraphs(card.id, boardDensity === 'board' ? 'board' : 'compact', rules)) expect(board, `${card.id} ${rules}`).toContain(p);
        if (effects.length === 0) expect(board, card.id).toContain('No effect');
      }
    }
    expect(multi).toBeGreaterThanOrEqual(24);
    expect(grouped).toBeGreaterThanOrEqual(5);
  });

  it('effects that share a label read as one paragraph under it', () => {
    const html = face('kng-light-priest', 'hand');
    expect(text(html)).toContain('Shield: Survives being destroyed once. Round End: Restore 45 HP. Your Spell: +15 ATK this round.');
    expect(html.match(/class="gc-when"/g)).toHaveLength(3);
    expect(text(face('und-vharos', 'board'))).toContain('Destroyed: Revive here with 95 ATK. Gain your strongest other Graveyard Undead.');
  });

  it('the board drops a phrase that stops mattering once the card is in play', () => {
    expect(text(face('und-mira', 'hand'))).toContain('Destroyed: Gain your weakest other Graveyard Undead.');
    expect(text(face('und-shade-thief', 'hand'))).toContain('from next round');
    expect(text(face('und-shade-thief', 'board'))).not.toContain('from next round');
  });

  it('reads in the register of the brief: label, colon, a short line', () => {
    const vael = text(face('kng-archmage-vael', 'hand'));
    expect(vael).toContain('Passive: Your first one-time Spell each round repeats.');
    expect(vael).toContain('Your 2nd Spell: Deal 90 damage.');
    expect(vael).toContain('Round End: If hand is empty, gain a Graveyard Spell.');
    expect(text(face('inf-runebreaker', 'board'))).toContain('Clash: Destroy enemy Continuous Spell here. Passive: Spell Immune with Mage Slayer ally. Enemy’s 2nd Spell: Deal 90 damage.');
    expect(text(face('kng-royal-guard', 'hand'))).toContain('Passive: Adjacent allies +15 ATK.');
  });

  it('the Dawnshield Paladin shows Shield, its lift for losing allies and its heal, each with its timing', () => {
    const t = text(face('kng-paladin', 'board'));
    expect(t).toContain('Shield: Survives being destroyed once.');
    expect(t).toContain('Clash: Adjacent allies that would lose +15 ATK this round.');
    expect(t).toContain('Enemy Falls: If it fell here, restore 45 HP.');
  });

  it('a keyword label replaces the timing, and the full rule drops what the label already says', () => {
    const blood = cardEffects('inf-blood-demon');
    expect(blood[1].label).toBe('Clash');
    expect(blood[1].full).toBe('If an allied Unit died this round, gain +30 ATK this round.');
    const priest = cardEffects('und-dark-priest')[0];
    expect([priest.label, priest.timing, priest.full, priest.compact]).toEqual(['Guard 2', 'Clash', 'If this Unit would lose its lane, gain +30 ATK this round.', '+30 ATK this round if losing.']);
    expect(cardEffects('inf-runebreaker')[2].label).toBe('Enemy’s 2nd Spell');
  });
});

describe('Spells use the same card', () => {
  it('a Continuous Spell on the board shows its rule in its Spell zone', () => {
    const html = inBattle(createElement(SpellZoneChit, { spell: { instanceId: 's1', cardId: 'spl-burning-ground', faction: 'infernal', name: 'Burning Ground', shortName: 'Burning Ground', usedThisRound: false } as never, side: 'enemy', onClick: () => {} }));
    expect(text(html)).toContain('Burning Ground Round End: Enemy here −15 ATK.');
    expect(html).toContain('game-card d-spell');
  });

  it('a Spell names its kind where a Unit shows ATK, and a one-time Spell reads without a timing label', () => {
    const fireballHtml = face('spl-fireball', 'hand');
    const fireball = text(fireballHtml);
    expect(fireball).toContain('Fireball Spell Enemy here −60 ATK. With their Continuous Spell here, it becomes 50 ATK instead.');
    expect(fireball).not.toMatch(/On Play|Cast:/);
    expect(fireballHtml).not.toContain('gc-atk');
    expect(face('spl-fireball', 'tile')).not.toContain('gc-hpc');
    const ground = face('spl-cursed-ground', 'hand');
    expect(ground).toMatch(/class="gc-stat gc-kind-stat"><span class="gc-stat-label">Continuous<\/span>/);
    expect(text(ground)).toContain('Passive: Your Unit here +15 ATK. Enemy Falls: Your Unit here gains +15 ATK.');
    expect(text(face('spl-cursed-ground', 'inspect'))).toContain('Continuous Spell');
    expect(text(face('spl-battle-banner', 'tile'))).toContain('Attached Passive: Attached Unit +15 ATK.');
    expect(text(face('spl-battle-banner', 'inspect'))).toContain('Attached Spell');
  });
});

describe('live ATK and effect state', () => {
  it('a buffed Unit shows its current ATK, with the printed ATK beside it', () => {
    const html = face(ROYAL_GUARD, 'board', { atk: 128, tempAtk: 15 });
    expect(html).toContain('gc-atk up');
    expect(html).toContain('<strong>128</strong>');
    expect(html).toContain('<s class="gc-atk-printed">113</s>');
    expect(text(html)).toContain('+15 this round');
    expect(face(ROYAL_GUARD, 'board', { atk: 68 })).toContain('gc-atk down');
    const plain = face(ROYAL_GUARD, 'board');
    expect(plain).toContain('<strong>113</strong>');
    expect(plain).not.toContain('gc-atk-printed');
  });

  it('a board card reads the ATK the battle passes it (base + this round + Continuous Spells)', () => {
    const html = inBattle(createElement(BoardChit, { hero: unit(ROYAL_GUARD, { power: 143, tempPower: 15 }), side: 'player', onClick: () => {} }));
    expect(html).toContain('<strong>143</strong>');
    expect(html).toContain('gc-atk up');
  });

  function boardWith(units: { side: Side; lane: LaneId; cardId: string; silenced?: boolean }[]): GameState {
    const s = createCardMatch({ seed: 1, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
    for (const u of units) s[u.side].heroZones[u.lane] = unit(u.cardId, { instanceId: `${u.side}-${u.lane}`, silenced: !!u.silenced });
    return s;
  }

  it('Battle Captain’s immunity reads active only while another Knight is in play, and never while silenced', () => {
    // Battle Captain's immunity is its second ability (index 1): Clash aura, Passive immunity.
    expect(passiveEffectStates(boardWith([{ side: 'player', lane: 'center', cardId: CAPTAIN }]), 'player').get('player-center')?.get(1)).toBe(false);
    const both = boardWith([
      { side: 'player', lane: 'center', cardId: CAPTAIN },
      { side: 'player', lane: 'left', cardId: 'kng-common-knight' },
    ]);
    expect(passiveEffectStates(both, 'player').get('player-center')?.get(1)).toBe(true);
    const hushed = boardWith([
      { side: 'player', lane: 'center', cardId: CAPTAIN, silenced: true },
      { side: 'player', lane: 'left', cardId: 'kng-common-knight' },
    ]);
    expect(passiveEffectStates(hushed, 'player').get('player-center')?.get(1)).toBe(false);
    expect(passiveEffectStates(both, 'player').get('player-left')).toBeUndefined();
  });

  it('a silenced Unit keeps its rules visible and says they are off', () => {
    const t = text(face(CAPTAIN, 'board', { silenced: true }));
    expect(t).toContain('Silenced this round');
    expect(t).toContain('Immune to Unit effects with Knight ally.');
  });
});

describe('legacy battles use the same card with the numbers that battle plays', () => {
  it('a board Unit shows its Power band as ATK and the legacy rules, never an HP Contribution', () => {
    const html = inBattle(createElement(BoardChit, { hero: unit('kng-light-priest', { power: 3 }), side: 'player', onClick: () => {} }), 'legacy');
    const t = text(html);
    expect(html).toContain('game-card d-board');
    expect(t).toContain(`ATK ${legacyAtk(3)}`);
    expect(t).toContain('Restore 3 HP.');
    expect(t).not.toContain('135 HP');
    expect(t).not.toMatch(/\bPower\b/);
  });

  it('a hand card in a legacy battle is the same face, with the legacy ATK', () => {
    const html = inBattle(createElement(HandCard, handProps('kng-paladin')), 'legacy');
    expect(html).toContain('game-card d-hand');
    expect(text(html)).toContain(`ATK ${printedAtk('kng-paladin', 'legacy')}`);
    expect(text(html)).toContain('Guard 4: +60 ATK this round if losing.');
  });

  it('a Card Mastery effect shows on the legacy face and is marked', () => {
    const html = face(ROYAL_GUARD, 'board', { rules: 'legacy', masteryRank: 1 });
    expect(text(html)).toContain('Spell Immune with another ally.');
    expect(html).toContain('is-mastery');
    expect(text(face(ROYAL_GUARD, 'board', { rules: 'card', masteryRank: 3 }))).not.toContain('Spell Immune with another ally.');
  });
});

describe('the focused card detail', () => {
  it('shows the full rules, current and printed ATK, HP Contribution and the current bonus', () => {
    const details = cardFocusDetails(ROYAL_GUARD, { rules: 'card', place: 'card', hpContribution: 77 });
    const t = text(
      renderToStaticMarkup(
        createElement(CardFocusPanel, {
          details: { ...details, atk: 128, changes: [{ amount: 15, source: 'Battle Banner', lasts: 'battle' }] },
          layout: 'sheet',
          onClose: () => {},
          onInspect: () => {},
        }),
      ),
    );
    expect(t).toContain('Royal Guard');
    expect(t).toContain('128');
    expect(t).toContain('113');
    expect(t).toContain('HP Contribution');
    expect(t).toContain('+77');
    expect(t).toContain('Adjacent allied Units have +15 ATK.');
    expect(t).toContain('Battle Banner');
    expect(t).toContain('Inspect');
  });

  it('every card’s focus detail lists every effect’s full rule', () => {
    for (const card of cards) {
      const t = text(renderToStaticMarkup(createElement(CardFocusPanel, { details: cardFocusDetails(card.id, { rules: 'card', place: 'hand' }), layout: 'dock', onClose: () => {}, onInspect: () => {} })));
      for (const e of cardEffects(card.id)) expect(t, card.id).toContain(e.full.replace(/\s+/g, ' '));
    }
  });
});

describe('Card Inspect and the card viewer', () => {
  it('outside battle a tap opens the focused detail, with an Inspect action', () => {
    const t = text(renderToStaticMarkup(createElement(CardViewer, { cardId: ROYAL_GUARD, context: 'collection', onClose: () => {} })));
    expect(t).toContain('Royal Guard');
    expect(t).toContain('Adjacent allied Units have +15 ATK.');
    expect(t).toContain('Inspect');
  });

  it('Card Inspect is the deepest layer: the card, ATK, HP Contribution and full rules, with no Card Mastery upgrade', () => {
    const hpc = printedStats(getCard(ROYAL_GUARD))!.hpc;
    const t = text(renderToStaticMarkup(createElement(CardInspect, { cardId: ROYAL_GUARD, context: 'collection', onClose: () => {} })));
    expect(t).toContain('Royal Guard');
    expect(t).toContain('113 ATK');
    expect(t).toContain(`+${hpc} HP`);
    expect(t).toContain('HP Contribution');
    expect(t).toContain('Adjacent allied Units have +15 ATK.');
    expect(t).not.toContain('Card Mastery');
    expect(t).not.toMatch(/Mastery [IV]+|\+(5|10|15|20)%|never changes ATK|Next Mastery/);
    expect(t).not.toMatch(/\bPower\b|\bHero\b/);
  });

  it('Card Inspect in a legacy battle says HP Contribution is not used there, and shows the legacy ATK', () => {
    const t = text(renderToStaticMarkup(createElement(CardInspect, { cardId: 'kng-light-priest', context: 'battle', battle: { rules: 'legacy', owner: 'player' }, onClose: () => {} })));
    expect(t).toContain(`${legacyAtk(3)} ATK`);
    expect(t).toContain('Not used in this battle');
    expect(t).toContain('Restore 3 HP');
  });

  it('opens on Inspect directly when asked', () => {
    const html = renderToStaticMarkup(createElement(CardViewer, { cardId: 'spl-fireball', context: 'pack', startWith: 'inspect', onClose: () => {} }));
    expect(html).toContain('card-inspect');
  });
});
