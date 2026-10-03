/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, LaneId, PlayerAction, Side } from '../types/index.js';
import { ALL_CARDS, getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { cardEffects } from '../cards/cardPresentation.js';
import { BATTLE_LINES } from './cardText.js';
import { TIMING_CLEANUP_IDS, getCombatCard, isAttachedSpell, spellBinding } from './cards.js';
import { beginCardRound, cardAtk, createCardMatch, effectiveAtk, resolveCardRound, validateCardDeployment, withEffectiveAtk } from './engine.js';
import { battleLogEntries } from '../../components/battleInfo/battleLog.js';

// The timing cleanup (docs/CARD-COMBAT-DESIGN.md section 18): On Play is retired as a timing, Continuous Spells say
// whether they are bound to a Unit or a lane, and an Attached Spell leaves with its Unit.

const KNIGHT = 'kng-common-knight'; // vanilla: no effect
const NONE: PlayerAction = { plays: [] };

function blankMatch(): GameState {
  const s = createCardMatch({ seed: 11, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  return s;
}

let uid = 0;
function put(s: GameState, side: Side, lane: LaneId, cardId: string, atk = cardAtk(cardId), extra: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  const unit: HeroInstance = { instanceId: `tc-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk, ...extra };
  s[side].heroZones[lane] = unit;
  return unit;
}
function hand(s: GameState, side: Side, cardId: string) {
  const h = { handId: `h-${side}-${uid++}`, cardId };
  s[side].hand.push(h);
  return h;
}
const triggers = (events: readonly GameEvent[], sourceName: string, trigger: string) => events.filter((e) => e.type === 'TRIGGER' && e.sourceName === sourceName && e.trigger === trigger).length;

describe('On Play is retired', () => {
  it('no production card has an On Play effect in card combat (one-time Spells resolve on Cast)', () => {
    for (const card of ALL_CARDS) expect(getCombatCard(card.id).abilities.map((a) => a.trigger), card.id).not.toContain('ON_PLAY');
    expect(getCombatCard('spl-war-cry').abilities[0].trigger).toBe('CAST');
  });
  it('no card text, battle line or Help rule says On Play, when played, when summoned or on summon', () => {
    const banned = /\bOn Play\b|when (it is )?played|when summoned|on summon/i;
    for (const card of ALL_CARDS) {
      for (const e of cardEffects(card.id)) for (const text of [e.label, e.timing, e.compact, e.board, e.full]) expect(text, card.id).not.toMatch(banned);
      for (const line of BATTLE_LINES[card.id] ?? []) expect(JSON.stringify(line), card.id).not.toMatch(banned);
    }
    const help = readFileSync(new URL('../../components/HelpModal.tsx', import.meta.url), 'utf8');
    expect(help).not.toMatch(banned);
  });
  it('the changed cards are exactly the ones listed for the report, each with an authored replacement', () => {
    expect([...TIMING_CLEANUP_IDS].sort()).toEqual(['inf-hellhound', 'inf-infernal-lord', 'inf-runebreaker', 'kng-light-priest', 'kng-paladin', 'kng-royal-guard', 'spl-battle-banner', 'spl-fortify', 'und-crypt-warden', 'und-grave-sage', 'und-mira', 'wld-forest-wolf']);
  });
});

describe('Passive effects switch on and off with the board', () => {
  it('Forest Wolf has +30 ATK only while the enemy has no Unit in its lane', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'wld-forest-wolf');
    const base = cardAtk('wld-forest-wolf');
    expect(effectiveAtk(s, 'player', 'left')).toBe(base + 30);
    put(s, 'enemy', 'left', KNIGHT);
    expect(effectiveAtk(s, 'player', 'left')).toBe(base);
    s.enemy.heroZones.left = null;
    expect(effectiveAtk(s, 'player', 'left')).toBe(base + 30);
  });
  it('Royal Guard gives adjacent allies +15 ATK while it is in play, and nothing once it is gone', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'kng-royal-guard');
    put(s, 'player', 'center', KNIGHT);
    put(s, 'player', 'right', KNIGHT);
    expect(effectiveAtk(s, 'player', 'center')).toBe(cardAtk(KNIGHT) + 15);
    expect(effectiveAtk(s, 'player', 'right')).toBe(cardAtk(KNIGHT)); // not adjacent
    s.player.heroZones.left = null;
    expect(effectiveAtk(s, 'player', 'center')).toBe(cardAtk(KNIGHT));
  });
  it('a silenced Royal Guard gives nothing that round', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'kng-royal-guard', undefined, { silenced: true });
    put(s, 'player', 'center', KNIGHT);
    expect(effectiveAtk(s, 'player', 'center')).toBe(cardAtk(KNIGHT));
  });
});

describe('Round End fires exactly once per round; Destroyed fires once', () => {
  it('Light Priest restores 45 HP at each Round End, once', () => {
    const s = blankMatch();
    s.player.hp -= 200;
    put(s, 'player', 'right', 'kng-light-priest');
    put(s, 'enemy', 'right', KNIGHT, 10); // loses, so the Priest stays
    const hp = s.player.hp;
    const r = resolveCardRound(s, NONE, NONE);
    expect(triggers(r.events, 'Light Priest', 'ROUND_END')).toBe(1);
    expect(r.events.filter((e) => e.type === 'HEAL' && e.sourceName === 'Light Priest')).toEqual([expect.objectContaining({ amount: 45 })]);
    expect(r.nextState.player.hp).toBe(hp + 45);
    const next = resolveCardRound(beginCardRound(r.nextState).nextState, NONE, NONE);
    expect(triggers(next.events, 'Light Priest', 'ROUND_END')).toBe(1);
  });
  it('Fortify’s attached Unit gains +15 ATK at Round End, once per round', () => {
    const s = blankMatch();
    const knight = put(s, 'player', 'left', KNIGHT);
    put(s, 'enemy', 'left', KNIGHT, 10);
    const fortify = hand(s, 'player', 'spl-fortify');
    const r = resolveCardRound(s, { plays: [{ handId: fortify.handId, cardId: 'spl-fortify', lane: 'left' }] }, NONE);
    expect(triggers(r.events, 'Fortify', 'ROUND_END')).toBe(1);
    expect(r.nextState.player.heroZones.left?.instanceId).toBe(knight.instanceId);
    expect(r.nextState.player.heroZones.left?.power).toBe(cardAtk(KNIGHT) + 15);
  });
  it('Royal Guard’s When Destroyed fires once and gives adjacent allies a lasting +15 ATK', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'kng-royal-guard', 10);
    put(s, 'player', 'center', KNIGHT);
    put(s, 'enemy', 'left', KNIGHT, 300);
    const r = resolveCardRound(s, NONE, NONE);
    expect(triggers(r.events, 'Royal Guard', 'ON_DEATH')).toBe(1);
    expect(r.nextState.player.heroZones.center?.power).toBe(cardAtk(KNIGHT) + 15);
  });
  it('Infernal Lord’s When Destroyed gives every enemy Unit −15 ATK, once', () => {
    const s = blankMatch();
    put(s, 'enemy', 'left', 'inf-infernal-lord', 10);
    put(s, 'player', 'left', KNIGHT, 300);
    put(s, 'player', 'right', KNIGHT);
    const r = resolveCardRound(s, NONE, NONE);
    expect(triggers(r.events, 'Infernal Lord', 'ON_DEATH')).toBe(1);
    expect(r.nextState.player.heroZones.right?.power).toBe(cardAtk(KNIGHT) - 15);
  });
});

describe('printed Shields: once per Unit in play, never doubled', () => {
  it('Paladin survives its first destruction and falls to the second', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'kng-paladin', 60);
    put(s, 'enemy', 'left', KNIGHT, 400);
    expect(withEffectiveAtk(s, 'player').heroZones.left?.shielded).toBe(true);
    const first = resolveCardRound(s, NONE, NONE);
    expect(first.events.filter((e) => e.type === 'SHIELD_CONSUMED')).toHaveLength(1);
    expect(first.nextState.player.heroZones.left?.cardId).toBe('kng-paladin');
    expect(withEffectiveAtk(first.nextState, 'player').heroZones.left?.shielded).toBe(false);
    const second = resolveCardRound(beginCardRound(first.nextState).nextState, NONE, NONE);
    expect(second.events.filter((e) => e.type === 'SHIELD_CONSUMED')).toHaveLength(0);
    expect(second.nextState.player.heroZones.left).toBeNull();
  });
  it('a revived Unit is a new Unit in play, so its printed Shield is fresh', () => {
    const revive = ALL_CARDS.find((c) => c.abilities.some((a) => a.actions.some((x) => x.type === 'REVIVE_TO_LANE')))!;
    const s = blankMatch();
    s.player.graveyard = ['und-crypt-warden', 'und-bone-soldier', 'und-cursed-warrior'];
    s.cardCombat!.graveMarks.player = [false, false, false];
    const spell = hand(s, 'player', revive.id);
    const r = resolveCardRound(s, { plays: [{ handId: spell.handId, cardId: revive.id, lane: 'center' }] }, NONE);
    const revived = r.events.find((e) => e.type === 'REVIVED');
    expect(revived).toBeDefined();
    const unit = r.nextState.player.heroZones.center!;
    expect(unit.printedShieldUsed).toBeFalsy();
    if (unit.cardId === 'und-crypt-warden') expect(withEffectiveAtk(r.nextState, 'player').heroZones.center?.shielded).toBe(r.nextState.player.graveyard.length >= 2);
  });
});

describe('Attached Spells (Unit-bound)', () => {
  it('every Continuous Spell declares Unit or Lane binding explicitly', () => {
    for (const card of ALL_CARDS.filter((c) => c.type === 'spell' && c.spellKind === 'CONTINUOUS')) expect(spellBinding(card.id), card.id).toMatch(/^(UNIT|LANE)$/);
    expect(isAttachedSpell('spl-battle-banner')).toBe(true);
    expect(isAttachedSpell('spl-fortify')).toBe(true);
    expect(isAttachedSpell('spl-burning-ground')).toBe(false);
  });
  it('needs your Unit in its lane, already there or played alongside it', () => {
    const s = blankMatch();
    const banner = hand(s, 'player', 'spl-battle-banner');
    expect(validateCardDeployment(s, 'player', { plays: [{ handId: banner.handId, cardId: 'spl-battle-banner', lane: 'left' }] }).legal).toBe(false);
    const knight = hand(s, 'player', KNIGHT);
    expect(validateCardDeployment(s, 'player', { plays: [{ handId: knight.handId, cardId: KNIGHT, lane: 'left' }, { handId: banner.handId, cardId: 'spl-battle-banner', lane: 'left' }] }).legal).toBe(true);
  });
  it('when its Unit is destroyed it expires at once: SPELL_EXPIRED right after the Unit, Graveyard, lane free, one log line', () => {
    const s = blankMatch();
    const knight = put(s, 'player', 'left', KNIGHT, 60);
    put(s, 'enemy', 'left', KNIGHT, 300);
    const banner = hand(s, 'player', 'spl-battle-banner');
    const r = resolveCardRound(s, { plays: [{ handId: banner.handId, cardId: 'spl-battle-banner', lane: 'left' }] }, NONE);
    const entered = r.events.find((e) => e.type === 'SPELL_ENTERED');
    expect(entered).toMatchObject({ name: 'Battle Banner', attachedTo: { instanceId: knight.instanceId } });
    const died = r.events.findIndex((e) => e.type === 'HERO_DESTROYED' && e.instanceId === knight.instanceId);
    expect(r.events[died + 1]).toMatchObject({ type: 'SPELL_EXPIRED', name: 'Battle Banner', unitName: knight.name });
    expect(r.events.filter((e) => e.type === 'SPELL_EXPIRED')).toHaveLength(1);
    expect(r.nextState.player.spellZones.left).toBeNull();
    expect(r.nextState.player.graveyard).toEqual(expect.arrayContaining([KNIGHT, 'spl-battle-banner']));
    const lines = battleLogEntries(r.events, s).map((e) => `${e.who} — ${e.label ? `${e.label}: ` : ''}${e.text}`);
    expect(lines.filter((t) => t.startsWith(`Battle Banner — Expired: Its Unit left play (${knight.name})`))).toHaveLength(1);
  });
  it('a Lane-bound Continuous Spell stays when the Unit in its lane is destroyed', () => {
    const s = blankMatch();
    put(s, 'player', 'left', KNIGHT, 60);
    put(s, 'enemy', 'left', KNIGHT, 300);
    const ground = hand(s, 'player', 'spl-burning-ground');
    const r = resolveCardRound(s, { plays: [{ handId: ground.handId, cardId: 'spl-burning-ground', lane: 'left' }] }, NONE);
    expect(r.events.some((e) => e.type === 'SPELL_EXPIRED')).toBe(false);
    expect(r.nextState.player.spellZones.left?.cardId).toBe('spl-burning-ground');
  });
  it('a Shield that saves the Unit keeps its Attached Spell in play', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'kng-paladin', 60);
    put(s, 'enemy', 'left', KNIGHT, 400);
    const banner = hand(s, 'player', 'spl-battle-banner');
    const r = resolveCardRound(s, { plays: [{ handId: banner.handId, cardId: 'spl-battle-banner', lane: 'left' }] }, NONE);
    expect(r.events.some((e) => e.type === 'SPELL_EXPIRED')).toBe(false);
    expect(r.nextState.player.spellZones.left?.cardId).toBe('spl-battle-banner');
  });
});
