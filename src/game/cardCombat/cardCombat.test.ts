/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, LaneId, PlayerAction, Side } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { STARTING_HP } from '../engine/constants.js';
import { createMatch } from '../engine/match.js';
import { applyEvent } from '../engine/replay.js';
import { deckSummary } from '../decks/deckSummary.js';
import { COMBAT_MODEL_ROLE, PRODUCTION_COMBAT_MODEL, resolveCombatModel } from '../combat/combatModel.js';
import { CONTINUABLE_CARD_RESOLVER_VERSIONS, isCurrentCardResolver, matchResolver, PRODUCTION_RULES, sameRules } from '../combat/resolver.js';
import { withCardOverrides } from '../cardSim/cardSource.js';
import { getVariant } from '../cardSim/balance/differenceDamage.js';
import { choosePlays } from '../cardSim/ai.js';
import { playMatch } from '../cardSim/engine.js';
import { cardJitter, getStatModel } from '../cardSim/statModels.js';
import { chooseCardAiAction } from './ai.js';
import { CARD_COMBAT_OVERRIDE_IDS, getCombatCard } from './cards.js';
import { CARD_MAX_ROUNDS, CARD_RESOLVER_VERSION, beginCardRound, cardAtk, createCardMatch, matchHpContribution, resolveCardRound, type CardMatchSetup } from './engine.js';
import { ATK_OFFSET, GROWTH_CAP_ATK, atkFromPower, deckStartingHp, hpContribution, printedStats } from './stats.js';

const KNIGHT = 'kng-common-knight'; // vanilla: no effect, ATK 128
const NONE: PlayerAction = { plays: [] };

/** A fresh card-combat match with empty decks and hands, for hand-built positions. */
function blankMatch(playerDeck: string[] = STARTER_DECKS.kingdom, enemyDeck: string[] = STARTER_DECKS.undead): GameState {
  const s = createCardMatch({ seed: 7, playerDeck, enemyDeck }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    const p = s[side];
    p.hand = [];
    p.deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  return s;
}

let uid = 0;
function put(s: GameState, side: Side, lane: LaneId, cardId: string, atk = cardAtk(cardId), extra: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  const unit: HeroInstance = { instanceId: `test-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk, ...extra };
  s[side].heroZones[lane] = unit;
  return unit;
}

function hand(s: GameState, side: Side, cardId: string, returned = false) {
  const h = { handId: `h-${side}-${uid++}`, cardId, ...(returned ? { returned: true } : {}) };
  s[side].hand.push(h);
  return h;
}

const unitIdsOf = (deck: string[]) => deck.filter((id) => getCard(id).type === 'hero');
const sumHpc = (deck: string[]) => unitIdsOf(deck).reduce((hp, id) => hp + (printedStats(id)?.hpc ?? 0), 0);

/** Plays a whole card-combat match with the card AI on both sides, the way GamePage drives it. */
function autoMatch(seed: number, playerDeck: string[], enemyDeck: string[]) {
  let { nextState: state, events } = createCardMatch({ seed, playerDeck, enemyDeck });
  const log: GameEvent[] = [...events];
  while (state.status === 'IN_PROGRESS') {
    const p = chooseCardAiAction(state, 'player', state.rngState);
    const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
    const r = resolveCardRound(state, p.action, e.action, e.nextRngState);
    log.push(...r.events);
    state = r.nextState;
    if (state.status !== 'IN_PROGRESS') break;
    const b = beginCardRound(state);
    log.push(...b.events);
    state = b.nextState;
  }
  return { state, log };
}

describe('card combat: Starting HP', () => {
  it('1. Starting HP is the sum of the deck’s Unit HP Contributions', () => {
    const { nextState: s, events } = createCardMatch({ seed: 1, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead });
    expect(s.player.hp).toBe(sumHpc(STARTER_DECKS.kingdom));
    expect(s.player.maxHp).toBe(s.player.hp);
    expect(s.enemy.hp).toBe(sumHpc(STARTER_DECKS.undead));
    expect(s.enemy.maxHp).toBe(s.enemy.hp);
    const start = events.find((e) => e.type === 'STARTING_HP' && e.side === 'player');
    expect(start).toMatchObject({ hp: s.player.hp, units: 11 });
    expect(start).not.toHaveProperty('masteryBonus');
    // The formula, for one card of each rarity: HPC = max(45, round(0.75 x (210 - ATK))) + rarity premium.
    expect(printedStats('kng-common-knight')).toEqual({ atk: 128, hpc: 62 });
    expect(printedStats('kng-royal-guard')).toEqual({ atk: 113, hpc: 73 + 4 });
    expect(printedStats('wld-titanroot')).toEqual({ atk: 157, hpc: 40 + 11 });
  });

  it('2. Spells contribute 0 HP', () => {
    const units = [KNIGHT, KNIGHT, 'und-bone-soldier'];
    const withSpells = [...units, 'spl-fireball', 'spl-battle-banner', 'spl-arcane-bolt'];
    expect(deckStartingHp(withSpells).total).toBe(deckStartingHp(units).total);
    expect(deckStartingHp(['spl-fireball', 'spl-war-cry'])).toMatchObject({ total: 0, units: 0, spells: 2 });
    expect(printedStats('spl-fireball')).toBeNull();
  });

  it('17. Deck Builder Starting HP equals the battle’s Starting HP: the printed HP Contributions', () => {
    const deck = STARTER_DECKS.kingdom;
    const builder = deckSummary(deck).startingHp;
    const battle = createCardMatch({ seed: 99, playerDeck: deck, enemyDeck: STARTER_DECKS.infernal }).nextState;
    expect(battle.player.hp).toBe(builder);
    expect(battle.player.maxHp).toBe(builder);
    expect(builder).toBe(sumHpc(deck));
    expect(battle.enemy.maxHp).toBe(deckSummary(STARTER_DECKS.infernal).startingHp);
  });

  it('never uses the legacy 20 HP', () => {
    const s = createCardMatch({ seed: 3, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.infernal }).nextState;
    expect(s.player.maxHp).not.toBe(STARTING_HP);
    expect(s.enemy.maxHp).not.toBe(STARTING_HP);
    // No literal 20 and no STARTING_HP anywhere in the resolver's source.
    for (const file of ['engine.ts', 'stats.ts', 'cards.ts', 'ai.ts']) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/engine\/constants|[^'"]STARTING_HP/);
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/(?<![\w.])20(?![\w.%])/);
    }
  });
});

describe('card combat: no combat Card Mastery (printed cards only)', () => {
  it('3. HP Contribution is always the printed value; match setup takes no progression', () => {
    for (const id of [KNIGHT, 'kng-paladin', 'wld-titanroot', 'und-bone-soldier']) {
      expect(hpContribution(id), id).toBe(printedStats(id)!.hpc);
      expect(matchHpContribution(id), id).toBe(printedStats(id)!.hpc);
    }
    expect(hpContribution('spl-fireball')).toBe(0);
    // A caller that still passes the old v2 Mastery fields (e.g. a stale build or a hand-written setup) gets the exact
    // same match: the resolver has no input for them.
    const deck = [KNIGHT, KNIGHT, 'kng-paladin', 'und-bone-soldier', 'und-bone-soldier', 'kng-royal-guard', 'kng-royal-guard', 'kng-archer'];
    const plain = createCardMatch({ seed: 5, playerDeck: deck, enemyDeck: deck });
    const stale = createCardMatch({ seed: 5, playerDeck: deck, enemyDeck: deck, playerMastery: { 'kng-paladin': 5, [KNIGHT]: 5 }, enemyMastery: { [KNIGHT]: 4 } } as unknown as CardMatchSetup);
    expect(stale).toEqual(plain);
    expect(plain.nextState.cardCombat).not.toHaveProperty('masteryStage');
    expect(plain.nextState.player.maxHp).toBe(deckStartingHp(deck).total);
  });

  it('4. A historical v2 Mastery table in a stored match changes nothing: same ATK, same events, same HP', () => {
    const base = blankMatch();
    const h = hand(base, 'player', KNIGHT);
    put(base, 'enemy', 'left', 'und-crypt-warden', 90);
    const run = (table?: Record<Side, Record<string, number>>) => {
      const s = structuredClone(base);
      if (table) s.cardCombat!.masteryStage = table;
      const r = resolveCardRound(s, { plays: [{ handId: h.handId, cardId: KNIGHT, lane: 'left' }] }, NONE);
      const { masteryStage: _ignored, ...meta } = r.nextState.cardCombat!;
      return { events: r.events, hp: [r.nextState.player.hp, r.nextState.enemy.hp], meta };
    };
    const printed = run();
    const reveal = printed.events.find((e) => e.type === 'REVEAL');
    expect(reveal && reveal.type === 'REVEAL' && reveal.placements[0].power).toBe(128);
    expect(run({ player: { [KNIGHT]: 5 }, enemy: { 'und-crypt-warden': 5 } })).toEqual(printed);
  });
});

describe('card combat: clashes and direct hits', () => {
  it('5 and 8. Higher ATK wins and the winner is unchanged; the loser’s player takes the ATK difference', () => {
    const s = blankMatch();
    const winner = put(s, 'player', 'left', KNIGHT, 120);
    put(s, 'enemy', 'left', KNIGHT, 104);
    const hp = { player: s.player.hp, enemy: s.enemy.hp };
    const r = resolveCardRound(s, NONE, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_WINS', player: { name: winner.name, power: 120 }, enemy: expect.objectContaining({ power: 104 }) }));
    expect(r.nextState.enemy.heroZones.left).toBeNull();
    expect(r.nextState.player.heroZones.left?.power).toBe(120);
    expect(r.nextState.player.hp).toBe(hp.player);
    expect(r.nextState.enemy.hp).toBe(hp.enemy - 16);
    expect(r.events.some((e) => e.type === 'OVERFLOW_DAMAGE' || e.type === 'DIRECT_DAMAGE' || e.type === 'HERO_DAMAGE')).toBe(false);
  });

  it('6. A tie destroys both Units', () => {
    const s = blankMatch();
    put(s, 'player', 'center', KNIGHT, 104);
    put(s, 'enemy', 'center', KNIGHT, 104);
    const r = resolveCardRound(s, NONE, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'center', outcome: 'TIE' }));
    expect(r.nextState.player.heroZones.center).toBeNull();
    expect(r.nextState.enemy.heroZones.center).toBeNull();
    expect(r.nextState.player.graveyard).toEqual([KNIGHT]);
    expect(r.nextState.enemy.graveyard).toEqual([KNIGHT]);
  });

  it('7. An unopposed Unit hits the enemy player for its full ATK', () => {
    const s = blankMatch();
    put(s, 'player', 'right', KNIGHT, 118);
    const before = s.enemy.hp;
    const r = resolveCardRound(s, NONE, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'DIRECT_DAMAGE', side: 'enemy', amount: 118, from: before, to: before - 118 }));
    expect(r.nextState.enemy.hp).toBe(before - 118);
    expect(r.nextState.player.heroZones.right?.power).toBe(118);
  });

  it('Before Combat follows initiative: the last word on a Guard contest alternates by round', () => {
    const WARDEN = 'und-crypt-warden'; // Guard 2: +30 ATK if it would lose its lane
    const contest = (round: number) => {
      const s = blankMatch(STARTER_DECKS.undead, STARTER_DECKS.undead);
      s.round = round;
      put(s, 'player', 'left', WARDEN, 100);
      put(s, 'enemy', 'left', WARDEN, 115);
      return resolveCardRound(s, NONE, NONE).events.find((e) => e.type === 'COMBAT' && e.lane === 'left');
    };
    // Round 1, player first: player 100 -> 130, then the enemy is losing and answers 115 -> 145.
    expect(contest(1)).toMatchObject({ outcome: 'ENEMY_WINS' });
    // Round 2, enemy first: the enemy is ahead so its Guard holds; the player's Guard then takes the lane 130 vs 115.
    expect(contest(2)).toMatchObject({ outcome: 'PLAYER_WINS' });
  });

  it('no Unit ever carries personal HP', () => {
    const { state, log } = autoMatch(11, STARTER_DECKS.kingdom, STARTER_DECKS.undead);
    for (const side of ['player', 'enemy'] as Side[]) for (const unit of Object.values(state[side].heroZones)) if (unit) expect(unit.hp ?? unit.maxHp).toBeUndefined();
    expect(log.some((e) => e.type === 'HERO_DAMAGE' || e.type === 'HERO_HEAL' || e.type === 'OVERFLOW_DAMAGE' || e.type === 'V2_CLASH' as never)).toBe(false);
  });

  it('converts a Player-HP effect at 45 HP per legacy point (Arcane Bolt 135, +90 after another Spell)', () => {
    const s = blankMatch();
    const a = hand(s, 'player', 'spl-arcane-bolt');
    const before = s.enemy.hp;
    const r = resolveCardRound(s, { plays: [{ handId: a.handId, cardId: 'spl-arcane-bolt', lane: 'left' }] }, NONE);
    expect(r.nextState.enemy.hp).toBe(before - 135);
  });
});

/** One opposed clash in the left lane at fixed ATK, resolved through a whole round. */
function clash(playerAtk: number | null, enemyAtk: number | null, setup: (s: GameState) => void = () => {}) {
  const s = blankMatch();
  if (playerAtk !== null) put(s, 'player', 'left', KNIGHT, playerAtk);
  if (enemyAtk !== null) put(s, 'enemy', 'left', KNIGHT, enemyAtk);
  setup(s);
  const hp = { player: s.player.hp, enemy: s.enemy.hp };
  const r = resolveCardRound(s, NONE, NONE);
  const record = r.events.find((e) => e.type === 'CLASH_DAMAGE' && e.lane === 'left') as Extract<GameEvent, { type: 'CLASH_DAMAGE' }> | undefined;
  return { s, r, hp, record, taken: { player: hp.player - r.nextState.player.hp, enemy: hp.enemy - r.nextState.enemy.hp } };
}

describe('card combat: ATK difference Clash Damage', () => {
  it('D1. 145 vs 85: the 85 is destroyed, the 145 remains, the defending player takes 60', () => {
    const { r, taken, record } = clash(145, 85);
    expect(r.nextState.enemy.heroZones.left).toBeNull();
    expect(r.nextState.player.heroZones.left?.power).toBe(145);
    expect(taken).toEqual({ player: 0, enemy: 60 });
    expect(record).toMatchObject({ side: 'enemy', winner: 'player', playerAtk: 145, enemyAtk: 85, clashDamage: 60, amount: 60 });
  });

  it('D2. 145 vs 140: the player takes 5', () => {
    expect(clash(140, 145).taken).toEqual({ player: 5, enemy: 0 });
  });

  it('D3. 120 vs 120: both destroyed, 0 Player damage', () => {
    const { r, taken, record } = clash(120, 120);
    expect(r.nextState.player.heroZones.left).toBeNull();
    expect(r.nextState.enemy.heroZones.left).toBeNull();
    expect(taken).toEqual({ player: 0, enemy: 0 });
    expect(record).toMatchObject({ side: null, winner: 'tie', clashDamage: 0, amount: 0 });
    expect(record!.destroyed.map((d) => d.side).sort()).toEqual(['enemy', 'player']);
  });

  it('D4. 145 into an empty lane: a direct hit for 145', () => {
    const { r, taken, record } = clash(145, null);
    expect(taken.enemy).toBe(145);
    expect(record).toBeUndefined();
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'DIRECT_DAMAGE', side: 'enemy', amount: 145 }));
  });

  it('D5. Clash Damage is never negative and never exceeds the defending player’s HP', () => {
    for (const [a, b] of [[80, 81], [81, 80], [200, 36], [36, 200]]) {
      const { record, taken } = clash(a, b);
      expect(record!.clashDamage).toBe(Math.abs(a - b));
      expect(record!.amount).toBeGreaterThanOrEqual(0);
      expect(taken.player + taken.enemy).toBe(Math.abs(a - b));
    }
    const low = clash(200, 40, (s) => (s.enemy.hp = 50));
    expect(low.r.nextState.enemy.hp).toBe(0);
    expect(low.record).toMatchObject({ clashDamage: 160, amount: 50, from: 50, to: 0 });
  });

  it('D6. An ATK buff changes Clash Damage: Power Surge (+45) turns a 60-point loss into a 15-point win', () => {
    const s = blankMatch();
    put(s, 'player', 'left', KNIGHT, 85);
    put(s, 'enemy', 'left', KNIGHT, 115);
    const surge = hand(s, 'player', 'spl-power-surge');
    const hp = s.enemy.hp;
    const r = resolveCardRound(s, { plays: [{ handId: surge.handId, cardId: 'spl-power-surge', lane: 'left' }] }, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'CLASH_DAMAGE', winner: 'player', playerAtk: 130, enemyAtk: 115, clashDamage: 15 }));
    expect(r.nextState.enemy.hp).toBe(hp - 15);
  });

  it('D7. An ATK debuff changes Clash Damage: Weakness (−45) on the winner cuts 60 to 15', () => {
    const s = blankMatch();
    put(s, 'player', 'left', KNIGHT, 85);
    put(s, 'enemy', 'left', KNIGHT, 145);
    const weak = hand(s, 'player', 'spl-weakness');
    const hp = s.player.hp;
    const r = resolveCardRound(s, { plays: [{ handId: weak.handId, cardId: 'spl-weakness', lane: 'left' }] }, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'CLASH_DAMAGE', winner: 'enemy', playerAtk: 85, enemyAtk: 100, clashDamage: 15 }));
    expect(r.nextState.player.hp).toBe(hp - 15);
  });

  it('D8. A historical Mastery V record never changes ATK, so it never changes Clash Damage', () => {
    const run = (stage: number) => {
      const s = blankMatch();
      s.cardCombat!.masteryStage = { player: { [KNIGHT]: stage }, enemy: { 'und-crypt-warden': stage } };
      const k = hand(s, 'player', KNIGHT);
      put(s, 'enemy', 'left', 'und-crypt-warden', 90);
      const record = resolveCardRound(s, { plays: [{ handId: k.handId, cardId: KNIGHT, lane: 'left' }] }, NONE).events.find((e) => e.type === 'CLASH_DAMAGE');
      return record && record.type === 'CLASH_DAMAGE' ? { atk: [record.playerAtk, record.enemyAtk], clashDamage: record.clashDamage, amount: record.amount } : null;
    };
    expect(run(1)).toEqual({ atk: [128, 120], clashDamage: 8, amount: 8 }); // the Warden's Guard: 90 + 30
    expect(run(5)).toEqual(run(1));
  });

  it('D9. Replay reproduces every Clash Damage number and the HP it moved, exactly', () => {
    const { log } = autoMatch(20260929, STARTER_DECKS.infernal, STARTER_DECKS.kingdom);
    const clashes = log.filter((e): e is Extract<GameEvent, { type: 'CLASH_DAMAGE' }> => e.type === 'CLASH_DAMAGE');
    expect(clashes.length).toBeGreaterThan(3);
    for (const c of clashes) {
      expect(c.clashDamage).toBe(Math.abs(c.playerAtk - c.enemyAtk));
      if (c.side === null) expect(c.amount).toBe(0);
      else expect(c.to).toBe(c.from! - c.amount);
      expect(c.amount).toBe(Math.min(c.from ?? 0, c.clashDamage - c.reduced - c.prevented));
    }
    // Replay each round's log on the state it started from: the Player HP it lands on is the resolver's own.
    let { nextState: state } = createCardMatch({ seed: 20260929, playerDeck: STARTER_DECKS.infernal, enemyDeck: STARTER_DECKS.kingdom });
    while (state.status === 'IN_PROGRESS') {
      const p = chooseCardAiAction(state, 'player', state.rngState);
      const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
      const r = resolveCardRound(state, p.action, e.action, e.nextRngState);
      const replayed = r.events.reduce(applyEvent, state);
      expect({ player: replayed.player.hp, enemy: replayed.enemy.hp }).toEqual({ player: r.nextState.player.hp, enemy: r.nextState.enemy.hp });
      if (r.nextState.status !== 'IN_PROGRESS') break;
      state = beginCardRound(r.nextState).nextState;
    }
  });

  it('D10. Guard (+ATK when it would lose) makes its blocker absorb more: 145 vs Crypt Warden 98 + 30 lets 17 through', () => {
    const s = blankMatch(STARTER_DECKS.undead, STARTER_DECKS.undead);
    put(s, 'player', 'left', KNIGHT, 145);
    put(s, 'enemy', 'left', 'und-crypt-warden', 98);
    const hp = s.enemy.hp;
    const r = resolveCardRound(s, NONE, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'CLASH_DAMAGE', playerAtk: 145, enemyAtk: 128, clashDamage: 17 }));
    expect(r.nextState.enemy.hp).toBe(hp - 17);
  });

  it('Aegis Ward’s “prevent the next damage” also covers Clash Damage, and says so in the log', () => {
    const s = blankMatch();
    put(s, 'player', 'left', KNIGHT, 85);
    put(s, 'enemy', 'left', KNIGHT, 145);
    const ward = hand(s, 'player', 'spl-aegis-ward');
    const hp = s.player.hp;
    const r = resolveCardRound(s, { plays: [{ handId: ward.handId, cardId: 'spl-aegis-ward', lane: 'center' }] }, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'CLASH_DAMAGE', clashDamage: 60, prevented: 60, amount: 0 }));
    expect(r.nextState.player.hp).toBe(hp);
  });

  it('blocking quality: against 145 / 110 / 85, the best lanes for 130 / 95 / 70 let 45 through, the worst 90, the old rule 0', () => {
    const lanes: LaneId[] = ['left', 'center', 'right'];
    const damage = (order: number[]) => {
      const s = blankMatch();
      [145, 110, 85].forEach((atk, i) => put(s, 'enemy', lanes[i], KNIGHT, atk));
      order.forEach((atk, i) => put(s, 'player', lanes[i], KNIGHT, atk));
      const hp = s.player.hp;
      return hp - resolveCardRound(s, NONE, NONE).nextState.player.hp;
    };
    const perms = [[130, 95, 70], [130, 70, 95], [95, 130, 70], [95, 70, 130], [70, 130, 95], [70, 95, 130]];
    const all = perms.map(damage);
    expect(all).toEqual([45, 55, 65, 90, 75, 90]);
    expect(Math.min(...all)).toBe(45);
    expect(Math.max(...all)).toBe(90);
  });
});

describe('card combat: Graveyard, growth and tokens', () => {
  it('9. Each card copy returns from the Graveyard once per match', () => {
    // Cursed Warrior: "When Destroyed: return this card to your hand".
    const s = blankMatch();
    put(s, 'player', 'left', 'und-cursed-warrior');
    put(s, 'enemy', 'left', KNIGHT);
    const first = resolveCardRound(s, NONE, NONE).nextState;
    expect(first.player.graveyard).toEqual([]);
    const back = first.player.hand.find((h) => h.cardId === 'und-cursed-warrior');
    expect(back?.returned).toBe(true);

    // The same copy is played again (it is marked) and dies again: it stays in the Graveyard.
    const again = beginCardRound(first).nextState;
    again.enemy.heroZones.left = null;
    put(again, 'enemy', 'left', KNIGHT);
    const second = resolveCardRound(again, { plays: [{ handId: back!.handId, cardId: 'und-cursed-warrior', lane: 'left' }] }, NONE);
    expect(second.events).toContainEqual(expect.objectContaining({ type: 'RETURN_BLOCKED', cardId: 'und-cursed-warrior' }));
    expect(second.nextState.player.graveyard).toEqual(['und-cursed-warrior']);
    expect(second.nextState.cardCombat!.graveMarks.player).toEqual([true]);
    expect(second.nextState.player.hand.some((h) => h.cardId === 'und-cursed-warrior')).toBe(false);
  });

  it('9b. A second copy of the same card still gets its own return', () => {
    const s = blankMatch();
    s.player.graveyard = ['und-cursed-warrior'];
    s.cardCombat!.graveMarks.player = [true]; // copy A already came back once
    put(s, 'player', 'left', 'und-cursed-warrior'); // copy B, never returned
    put(s, 'enemy', 'left', KNIGHT);
    const r = resolveCardRound(s, NONE, NONE).nextState;
    expect(r.player.hand.map((h) => h.cardId)).toEqual(['und-cursed-warrior']);
    expect(r.player.graveyard).toEqual(['und-cursed-warrior']);
    expect(r.cardCombat!.graveMarks.player).toEqual([true]);
  });

  it('10. Bone Soldier’s Graveyard bonus stops at +60 ATK', () => {
    const s = blankMatch();
    s.player.graveyard = Array(9).fill(KNIGHT);
    s.cardCombat!.graveMarks.player = Array(9).fill(false);
    put(s, 'player', 'left', 'und-bone-soldier');
    put(s, 'enemy', 'left', KNIGHT, 200);
    const r = resolveCardRound(s, NONE, NONE);
    const combat = r.events.find((e) => e.type === 'COMBAT');
    expect(combat && combat.type === 'COMBAT' && combat.player?.power).toBe(cardAtk('und-bone-soldier') + 60);
  });

  it('10b. Permanent growth stops at +45 ATK above the ATK a Unit entered with', () => {
    const s = blankMatch();
    const demon = put(s, 'player', 'center', 'inf-blood-demon');
    const entry = demon.power;
    for (const lane of ['left', 'right'] as LaneId[]) put(s, 'player', lane, KNIGHT, 60);
    for (const lane of ['left', 'right'] as LaneId[]) put(s, 'enemy', lane, KNIGHT, 150);
    put(s, 'enemy', 'center', KNIGHT, 400);
    const r = resolveCardRound(s, NONE, NONE);
    const died = r.events.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'player').length;
    expect(died).toBeGreaterThanOrEqual(2);
    // Permanent gains are capped, whatever happened this round.
    for (const e of r.events) if (e.type === 'POWER_CHANGED' && e.permanent && e.instanceId === demon.instanceId) expect(e.to).toBeLessThanOrEqual(entry + GROWTH_CAP_ATK + 30);
    const s2 = blankMatch();
    const d2 = put(s2, 'player', 'center', 'inf-blood-demon');
    s2.player.heroZones.center!.power = d2.entryAtk! + GROWTH_CAP_ATK; // already at the cap
    put(s2, 'player', 'left', KNIGHT, 60);
    put(s2, 'enemy', 'left', KNIGHT, 150);
    const r2 = resolveCardRound(s2, NONE, NONE);
    expect(r2.events.some((e) => e.type === 'POWER_CHANGED' && e.permanent && e.instanceId === d2.instanceId)).toBe(false);
  });

  it('11. Tokens: plain 70-ATK Ward, no HP Contribution, empty lanes only, never in the Graveyard', () => {
    expect(printedStats('tok-ward')).toEqual({ atk: 70, hpc: 0 });
    expect(getCombatCard('tok-ward').abilities).toEqual([]);
    const s = blankMatch();
    put(s, 'player', 'left', KNIGHT);
    const c = hand(s, 'player', 'spl-ward-circle');
    put(s, 'enemy', 'center', KNIGHT, 90);
    const r = resolveCardRound(s, { plays: [{ handId: c.handId, cardId: 'spl-ward-circle', lane: 'center' }] }, NONE);
    const summoned = r.events.filter((e) => e.type === 'TOKEN_SUMMONED');
    expect(summoned.map((e) => e.type === 'TOKEN_SUMMONED' && e.lane)).toEqual(['center', 'right']); // never onto the Knight in left
    expect(summoned.every((e) => e.type === 'TOKEN_SUMMONED' && e.power === 70)).toBe(true);
    // The center Ward loses its clash to 90 ATK and simply vanishes.
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'HERO_DESTROYED', side: 'player', lane: 'center', token: true }));
    expect(r.nextState.player.graveyard).toEqual(['spl-ward-circle']);
    expect(deckStartingHp(['tok-ward', KNIGHT]).total).toBe(printedStats(KNIGHT)!.hpc);
  });
});

describe('card combat: determinism and the event log', () => {
  it('12. The same seed gives the same match, event for event', () => {
    const a = autoMatch(20260929, STARTER_DECKS.undead, STARTER_DECKS.kingdom);
    const b = autoMatch(20260929, STARTER_DECKS.undead, STARTER_DECKS.kingdom);
    expect(b.log).toEqual(a.log);
    expect(b.state).toEqual(a.state);
    expect(['PLAYER_WIN', 'ENEMY_WIN', 'DRAW']).toContain(a.state.status);
    expect(a.state.round).toBeLessThanOrEqual(CARD_MAX_ROUNDS + 1);
    expect(a.log.filter((e) => e.type === 'MATCH_END')).toHaveLength(1);
    const c = autoMatch(20260930, STARTER_DECKS.undead, STARTER_DECKS.kingdom);
    expect(c.log).not.toEqual(a.log);
  });

  it('ends in a draw at the round cap', () => {
    const s = blankMatch();
    s.round = CARD_MAX_ROUNDS;
    s.player.deck = [KNIGHT];
    s.cardCombat!.deckMarks.player = [false];
    const r = resolveCardRound(s, NONE, NONE);
    expect(r.nextState.status).toBe('DRAW');
    expect(r.nextState.cardCombat!.endReason).toBe('round-cap');
  });

  // Decks with Graveyard returns (Undead) are left out on purpose: the simulator approximated "once per copy" as a
  // per-card-name budget (copies x 1), while this resolver marks the physical copy, so their matches may differ.
  it('plays exactly like the simulator (difference-damage variant dd-final) on decks without Graveyard returns', () => {
    const decks: [string[], string[]][] = [
      [STARTER_DECKS.kingdom, STARTER_DECKS.infernal],
      [STARTER_DECKS.infernal, STARTER_DECKS.kingdom],
    ];
    const variant = getVariant('dd-final');
    for (const [a, b] of decks) {
      for (const seed of [1, 2, 3, 4]) {
        const sim = withCardOverrides(variant.cards(), () => playMatch({ model: getStatModel('baseline'), rules: variant.rules, sides: [{ deck: a, policy: 'balanced' }, { deck: b, policy: 'balanced' }], seed }, choosePlays));
        const ours = autoMatch(seed, a, b);
        const winner = ours.state.status === 'PLAYER_WIN' ? 0 : ours.state.status === 'ENEMY_WIN' ? 1 : null;
        expect({ winner, rounds: ours.state.round - 1, hp: [ours.state.player.hp, ours.state.enemy.hp], start: [ours.state.player.maxHp, ours.state.enemy.maxHp] }, `seed ${seed}`).toEqual({ winner: sim.winner, rounds: sim.rounds, hp: sim.endHp, start: sim.startHp });
      }
    }
  });
});

describe('card combat: approved card data', () => {
  it('matches the simulator’s card set (dd-final: batch 3’s approved cards), card by card', () => {
    const approved = new Map(getVariant('dd-final').cards().map((c) => [c.id, c]));
    const strip = (abilities: readonly object[]) => abilities.map((a) => ({ ...a, text: undefined }));
    expect([...CARD_COMBAT_OVERRIDE_IDS].sort()).toEqual([...approved.keys()].sort());
    for (const [id, card] of approved) {
      const ours = getCombatCard(id);
      expect(ours.power, id).toBe(card.power);
      expect(strip(ours.abilities), id).toEqual(strip(card.abilities));
    }
  });

  it('prints the simulator’s ATK offsets as authored data, re-banded Legendaries at Power 6', () => {
    for (const card of ['kng-common-knight', 'und-vharos', 'inf-infernal-lord', 'kng-paladin', 'und-bone-soldier']) {
      const power = getCombatCard(card).power ?? 0;
      expect(printedStats(card)!.atk, card).toBe(atkFromPower(power) + cardJitter(card, 6) + 0);
    }
    for (const [id, offset] of Object.entries(ATK_OFFSET)) expect(offset + 0, id).toBe(cardJitter(id, 6) + 0);
    expect(printedStats('und-vharos')!.atk).toBe(130);
    // Rarity never buys ATK: a Legendary and a Common on the same Power line differ only by their offsets.
    expect(Math.abs(printedStats('kng-paladin')!.atk - printedStats('inf-pit-fiend')!.atk)).toBeLessThanOrEqual(12);
  });
});

describe('card combat: the production resolver everywhere', () => {
  const MODES = ['quickBattle', 'campaign', 'ranked', 'story'] as const;

  it('every local battle mode plays card combat in production, whatever the URL says', () => {
    for (const mode of MODES) {
      for (const search of ['', '?combat=card', '?combat=legacy', '?combat=v2', '?debug']) {
        expect(resolveCombatModel(mode, { dev: false, search }), `${mode} ${search}`).toBe('card');
      }
    }
    expect(PRODUCTION_COMBAT_MODEL).toBe('card');
    expect(COMBAT_MODEL_ROLE).toEqual({ card: 'production', legacy: 'historical', v2: 'experimental' });
  });

  it('a dev build defaults to card combat too; only an explicit dev override reaches the old resolvers', () => {
    for (const mode of MODES) {
      expect(resolveCombatModel(mode, { dev: true, search: '' })).toBe('card');
      expect(resolveCombatModel(mode, { dev: true, search: '?combat=card' })).toBe('card'); // accepted, no longer needed
      expect(resolveCombatModel(mode, { dev: true, search: '?combat=legacy' })).toBe('legacy');
      expect(resolveCombatModel(mode, { dev: true, search: '?combat=v2' })).toBe('v2');
    }
  });

  it('no production route asks for a legacy or V2 battle', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const modes = [...app.matchAll(/combatModelForMode\((\w+)\)/g)].map((m) => m[1]);
    expect(modes.length).toBeGreaterThan(0);
    expect(app).not.toMatch(/combatModel: '(legacy|v2)'|combatModel="(legacy|v2)"/);
    expect(app).toMatch(/import\.meta\.env\.DEV && showCombatLab/); // the Combat V2 lab is dev-only
    const game = readFileSync(new URL('../../pages/GamePage.tsx', import.meta.url), 'utf8');
    expect(game).toMatch(/combatModel: requestedModel = 'card'/);
  });

  it('Friendly Battle builds card matches with an explicit resolver version on the server', () => {
    const createMatchApi = readFileSync(new URL('../../../api/create-match.ts', import.meta.url), 'utf8');
    expect(createMatchApi).toMatch(/createCardMatch\(/);
    expect(createMatchApi).not.toMatch(/\bcreateMatch\(/);
    expect(createMatchApi).toMatch(/sameRules\(hostDeck\.rules\)/);
    const friendlyPage = readFileSync(new URL('../../pages/FriendlyBattlePage.tsx', import.meta.url), 'utf8');
    expect(friendlyPage).toMatch(/rules: PRODUCTION_RULES/);
    const built = createCardMatch({ seed: 1, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
    expect(matchResolver(built)).toEqual({ combatModel: 'card', resolverVersion: CARD_RESOLVER_VERSION });
    expect(matchResolver(built)).toEqual(PRODUCTION_RULES);
    expect(isCurrentCardResolver(built)).toBe(true);
    expect(isCurrentCardResolver({ ...built, cardCombat: { ...built.cardCombat!, version: CARD_RESOLVER_VERSION + 1 } })).toBe(false);
  });

  it('resolver v3 (Mastery removed) is current; a stored v2 match is still continued, round for round', () => {
    expect(CARD_RESOLVER_VERSION).toBe(3);
    expect(CONTINUABLE_CARD_RESOLVER_VERSIONS).toEqual([2, 3]);
    expect(sameRules({ combatModel: 'card', resolverVersion: 2 })).toBe(false); // new Friendly matches need v3 on both clients
    // A v2 match as PR #12's first build stored it: version 2 plus a per-side Mastery table (Friendly: Mastery I).
    const v3 = createCardMatch({ seed: 11, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
    const v2: GameState = { ...v3, cardCombat: { ...v3.cardCombat!, version: 2, masteryStage: { player: { 'kng-paladin': 1 }, enemy: {} } } };
    expect(isCurrentCardResolver(v2)).toBe(true);
    expect(isCurrentCardResolver({ ...v3, cardCombat: { ...v3.cardCombat!, version: 1 } })).toBe(false);
    const p = chooseCardAiAction(v3, 'player', v3.rngState);
    const e = chooseCardAiAction(v3, 'enemy', p.nextRngState);
    const a = resolveCardRound(v3, p.action, e.action, e.nextRngState);
    const b = resolveCardRound(v2, p.action, e.action, e.nextRngState);
    expect(b.events).toEqual(a.events);
    expect([b.nextState.player.hp, b.nextState.enemy.hp]).toEqual([a.nextState.player.hp, a.nextState.enemy.hp]);
  });

  it('an old legacy match still reads as legacy v1 (never inferred from a date)', () => {
    const legacy = createMatch({ seed: 1, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).state;
    expect(legacy.combatModel).toBeUndefined();
    expect(legacy.player.hp).toBe(STARTING_HP);
    expect(matchResolver(legacy)).toEqual({ combatModel: 'legacy', resolverVersion: 1 });
    expect(sameRules(matchResolver(legacy))).toBe(false);
    expect(sameRules(undefined)).toBe(false);
  });
});

describe('card combat: player-facing copy', () => {
  it('speaks in ATK and Player HP, never Power, Hero or legacy HP points', async () => {
    const { cardCombatEffectLines } = await import('./cardText.js');
    const { cardEffects } = await import('../cards/cardPresentation.js');
    const { ALL_CARDS } = await import('../cards/index.js');
    for (const card of ALL_CARDS) {
      const text = [...cardEffects(card.id).flatMap((e) => [e.label, e.compact, e.board, e.full]), ...cardCombatEffectLines(card.id).map((l) => l.text)].join(' | ');
      expect(text, card.id).not.toMatch(/\bPower\b|\bHero\b|\b[1-5] (HP|damage)\b/);
    }
    expect(cardCombatEffectLines('kng-light-priest')[0].text).toBe('Restore 135 HP to your player.');
    expect(cardCombatEffectLines('spl-arcane-bolt').map((l) => l.text)).toEqual(['Deal 135 damage to the enemy player.', 'If you already cast a Spell this round, deal 90 more.']);
    expect(cardCombatEffectLines('kng-paladin')[0].text).toBe('This Unit gains a Shield.');
  });
});
