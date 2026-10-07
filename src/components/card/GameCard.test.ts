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
  it('in hand: name, ATK and both effects as whole sentences that say when they happen, and no HP Contribution', () => {
    const html = inBattle(createElement(HandCard, handProps(CAPTAIN)));
    const t = text(html);
    expect(t).toContain('Battle Captain ATK 102');
    expect(t).toContain('Before lanes fight, allies next to this get +15 ATK this round.');
    expect(t).toContain('While you have another Knight, enemy Unit effects can’t affect this.');
    expect(html).not.toContain('class="gc-when"');
    expect(t).not.toContain('+77');
    expect(html).toContain('game-card d-hand');
  });

  it('on the board: both effects, current ATK, whether the immunity is on, and no Unit health', () => {
    const captain = unit(CAPTAIN);
    const html = inBattle(createElement(BoardChit, { hero: captain, side: 'player', onClick: () => {} }), 'card', new Map([[captain.instanceId, new Map([[1, true]])]]));
    const t = text(html);
    expect(t).toContain('Battle Captain ATK 113');
    expect(t).toContain('Before lanes fight, allies next to this get +15 ATK this round.');
    expect(t).toContain('While you have another Knight, enemy Unit effects can’t affect this.');
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
    expect(tile).toContain('Before lanes fight, allies next to this get +15 ATK this round. While you have another Knight, enemy Unit effects can’t affect this.');
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
        // Grave Tyrant is the longest single sentence (two halves in one effect).
        expect(e.compact.length, `${card.id}: ${e.compact}`).toBeLessThanOrEqual(130);
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
          expect(e.compact.length, `${card.id}: ${e.compact}`).toBeLessThanOrEqual(130);
          expect(e.compact, card.id).not.toMatch(/…|\.\.\./);
        }
      }
    }
  });

  /** Effects that share a label read as one paragraph under it; a card-combat face (no label) and a one-time Spell's effect (Cast) print alone. */
  function paragraphs(cardId: string, wording: 'compact' | 'board', rules: CardRules = 'card') {
    const card = getCard(cardId);
    const out: string[] = [];
    let last = '';
    for (const e of cardEffects(cardId, { rules })) {
      const implied = card.type === 'spell' && card.spellKind !== 'CONTINUOUS' && (e.trigger === 'CAST' || e.trigger === 'ON_PLAY');
      const lead = implied || e.keyword || !e.faceLabel ? '' : `${e.faceLabel}: `;
      if (out.length > 0 && lead !== '' && lead === last && !e.keyword) out[out.length - 1] += ` ${e[wording]}`;
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
        for (const p of paragraphs(card.id, 'board', rules)) expect(board, `${card.id} ${rules}`).toContain(p);
        if (effects.length === 0) expect(board, card.id).toContain('No effect');
      }
    }
    expect(multi).toBeGreaterThanOrEqual(24);
    expect(grouped).toBe(0);
  });

  it('each effect is one sentence that says when it happens, with no timing label on the face', () => {
    const html = face('kng-light-priest', 'hand');
    expect(text(html)).toContain('Survives destruction once. At the end of each round, restore 45 HP. When you cast a Spell, this gets +15 ATK this round.');
    expect(html).not.toContain('class="gc-when"');
    expect(text(face('und-vharos', 'board'))).toContain('When this is destroyed, revive it in this lane with 95 ATK. Only once. When this is destroyed, return your strongest other Undead to your hand.');
    // Legacy battles (old replays) keep their timing labels.
    expect(face('kng-light-priest', 'hand', { rules: 'legacy' })).toContain('class="gc-when"');
  });

  it('the board drops a phrase that stops mattering once the card is in play', () => {
    expect(text(face('und-shade-thief', 'hand'))).toContain('If you have a Spell in play, this attacks the enemy player directly, starting next round.');
    expect(text(face('und-shade-thief', 'board'))).toContain('If you have a Spell in play, this attacks the enemy player directly.');
    expect(text(face('und-shade-thief', 'board'))).not.toContain('starting next round');
  });

  it('the card face is short battle text; the panels keep the full plain-English line', () => {
    const vael = text(face('kng-archmage-vael', 'hand'));
    expect(vael).toContain('If your first Spell each round is one-time, it happens twice. When you cast your 2nd Spell in a round, deal 90 damage to the enemy player. At the end of each round, if your hand is empty, return a random Spell to your hand.');
    expect(cardEffects('kng-archmage-vael').map((e) => `${e.label}: ${e.full}`)).toEqual([
      'Passive: If the first Spell you cast each round is a one-time Spell, it happens twice.',
      'When you cast a Spell: If it is your 2nd Spell this round, deal 90 damage to the enemy player.',
      'Round End: If your hand is empty, return a random Spell from your Graveyard to your hand.',
    ]);
    expect(text(face('inf-runebreaker', 'board'))).toContain('Before lanes fight, destroy the enemy Spell in this lane. While you have another Mage Slayer, enemy Spells can’t affect this. When the enemy casts their 2nd Spell in a round, deal 90 damage to the enemy player.');
    expect(text(face('kng-royal-guard', 'hand'))).toContain('Allies next to this get +15 ATK.');
    expect(text(face('spl-grave-totem', 'hand'))).toContain('Before lanes fight, if the enemy cast or has a Spell, your Unit in this lane gets +30 ATK this round. When your Unit in this lane is destroyed, return it to your hand. Once per battle.');
  });

  it('the Dawnshield Paladin shows Shield, its lift for losing allies and its heal, each with its timing', () => {
    const t = text(face('kng-paladin', 'board'));
    expect(t).toContain('Survives destruction once.');
    expect(t).toContain('Before lanes fight, allies next to this that would lose their lane get +15 ATK this round.');
    expect(t).toContain('When an enemy Unit is destroyed, if it was in this lane, restore 45 HP. Once per round.');
  });

  it('a keyword prints alone on the card and its label replaces the timing; the panels say what it does', () => {
    const blood = cardEffects('inf-blood-demon');
    expect(blood[1].label).toBe('Clash');
    expect(blood[1].full).toBe('If one of your Units was destroyed this round, give this Unit +30 ATK this round.');
    const priest = cardEffects('und-dark-priest')[0];
    expect([priest.label, priest.timing, priest.full, priest.compact, priest.keyword]).toEqual(['Guard 2', 'Clash', 'If this Unit would lose its lane, give it +30 ATK this round.', 'If this would lose its lane, it gets +30 ATK this round.', true]);
    expect(text(face('und-dark-priest', 'hand'))).toContain('If this would lose its lane, it gets +30 ATK this round. Before lanes fight, if your Graveyard has 3+ cards, this gets +15 ATK this round.');
    expect([cardEffects('inf-runebreaker')[2].label, cardEffects('inf-runebreaker')[2].faceLabel]).toEqual(['When the enemy casts a Spell', '']);
  });
});

describe('Spells use the same card', () => {
  it('a Continuous Spell on the board shows its rule in its Spell zone', () => {
    const html = inBattle(createElement(SpellZoneChit, { spell: { instanceId: 's1', cardId: 'spl-burning-ground', faction: 'infernal', name: 'Burning Ground', shortName: 'Burning Ground', usedThisRound: false } as never, side: 'enemy', onClick: () => {} }));
    expect(text(html)).toContain('Burning Ground At the end of each round, enemy Unit in this lane loses 15 ATK until the battle ends.');
    expect(html).toContain('game-card d-spell');
  });

  it('a Spell names its kind where a Unit shows ATK, and a one-time Spell reads without a timing label', () => {
    const fireballHtml = face('spl-fireball', 'hand');
    const fireball = text(fireballHtml);
    expect(fireball).toContain('Fireball Spell Enemy Unit in this lane loses 60 ATK until the battle ends. Then, if the enemy has a Spell in this lane, set that Unit’s ATK to 50 until the battle ends.');
    expect(fireball).not.toMatch(/On Play|Cast:/);
    expect(fireballHtml).not.toContain('gc-atk');
    expect(face('spl-fireball', 'tile')).not.toContain('gc-hpc');
    const ground = face('spl-cursed-ground', 'hand');
    expect(ground).toMatch(/class="gc-stat gc-kind-stat"><span class="gc-stat-label">Lane<\/span>/);
    expect(text(ground)).toContain('Your Unit in this lane gets +15 ATK. When an enemy Unit is destroyed, your Unit in this lane gets +15 ATK until the battle ends, up to +45.');
    expect(text(face('spl-cursed-ground', 'inspect'))).toContain('Lane Spell');
    expect(text(face('spl-battle-banner', 'tile'))).toContain('The Unit with this Spell gets +15 ATK.');
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
    expect(t).toContain('While you have another Knight, enemy Unit effects can’t affect this.');
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
    expect(t).toContain('Allies next to this Unit have +15 ATK.');
    expect(t).toContain('+15 ATK from Battle Banner, until the battle ends');
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
    expect(t).toContain('Allies next to this Unit have +15 ATK.');
    expect(t).toContain('Inspect');
  });

  it('Card Inspect is the deepest layer: the card, ATK, HP Contribution and full rules, with no Card Mastery upgrade', () => {
    const hpc = printedStats(getCard(ROYAL_GUARD))!.hpc;
    const t = text(renderToStaticMarkup(createElement(CardInspect, { cardId: ROYAL_GUARD, context: 'collection', onClose: () => {} })));
    expect(t).toContain('Royal Guard');
    expect(t).toContain('113 ATK');
    expect(t).toContain(`+${hpc} HP`);
    expect(t).toContain('HP Contribution');
    expect(t).toContain('Allies next to this Unit have +15 ATK.');
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
