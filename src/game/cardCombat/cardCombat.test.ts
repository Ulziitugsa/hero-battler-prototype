/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, LaneId, PlayerAction, Side } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { STARTING_HP } from '../engine/constants.js';
import { createMatch } from '../engine/match.js';
import { deckSummary } from '../decks/deckSummary.js';
import { resolveCombatModel } from '../combatV2/featureFlag.js';
import { withCardOverrides } from '../cardSim/cardSource.js';
import { getVariant } from '../cardSim/balance/proposal.js';
import { choosePlays } from '../cardSim/ai.js';
import { playMatch } from '../cardSim/engine.js';
import { cardJitter, getStatModel } from '../cardSim/statModels.js';
import { chooseCardAiAction } from './ai.js';
import { CARD_COMBAT_OVERRIDE_IDS, getCombatCard } from './cards.js';
import { CARD_MAX_ROUNDS, beginCardRound, cardAtk, createCardMatch, resolveCardRound } from './engine.js';
import { stagesFromAscensionRanks } from './mastery.js';
import { ATK_OFFSET, GROWTH_CAP_ATK, MASTERY_HPC_PCT, atkFromPower, deckStartingHp, hpContributionAt, printedStats } from './stats.js';

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
    expect(events.find((e) => e.type === 'STARTING_HP' && e.side === 'player')).toMatchObject({ hp: s.player.hp, units: 11, masteryBonus: 0 });
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

  it('17. Deck Builder Starting HP equals the battle’s Starting HP (Mastery included)', () => {
    const deck = STARTER_DECKS.kingdom;
    // The player's Mastery is stored as Ascension ranks; both screens convert through stagesFromAscensionRanks.
    const stages = stagesFromAscensionRanks({ 'kng-paladin': 3, 'kng-royal-guard': 1 });
    const builder = deckSummary(deck, stages).startingHp;
    const battle = createCardMatch({ seed: 99, playerDeck: deck, enemyDeck: STARTER_DECKS.infernal, playerMastery: stages }).nextState;
    expect(battle.player.hp).toBe(builder);
    expect(battle.player.maxHp).toBe(builder);
    expect(builder).toBeGreaterThan(deckSummary(deck).startingHp);
    // The opponent plays its own deck at Mastery I: nothing is copied from the player.
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
      // (stats.ts legitimately holds Mastery V's +20% HP Contribution.)
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace('[0, 5, 10, 15, 20]', '');
      expect(code, file).not.toMatch(/(?<![\w.])20(?![\w.%])/);
    }
  });
});

describe('card combat: Mastery', () => {
  it('3. Mastery changes HP Contribution only (+0/5/10/15/20%)', () => {
    const hpc = printedStats('kng-paladin')!.hpc;
    expect([1, 2, 3, 4, 5].map((stage) => hpContributionAt('kng-paladin', stage))).toEqual(MASTERY_HPC_PCT.map((pct) => Math.round(hpc * (1 + pct / 100))));
    const deck = [KNIGHT, KNIGHT, 'kng-paladin'];
    const plain = createCardMatch({ seed: 5, playerDeck: deck, enemyDeck: deck }).nextState;
    const mastered = createCardMatch({ seed: 5, playerDeck: deck, enemyDeck: deck, playerMastery: { 'kng-paladin': 5, [KNIGHT]: 5 } }).nextState;
    expect(mastered.player.maxHp! - plain.player.maxHp!).toBe(hpContributionAt('kng-paladin', 5) - hpc + 2 * (hpContributionAt(KNIGHT, 5) - printedStats(KNIGHT)!.hpc));
    expect(mastered.enemy.maxHp).toBe(plain.enemy.maxHp);
  });

  it('4. Mastery never changes ATK', () => {
    const s = blankMatch();
    s.cardCombat!.masteryStage.player[KNIGHT] = 5;
    const h = hand(s, 'player', KNIGHT);
    const r = resolveCardRound(s, { plays: [{ handId: h.handId, cardId: KNIGHT, lane: 'left' }] }, NONE);
    const reveal = r.events.find((e) => e.type === 'REVEAL');
    expect(reveal && reveal.type === 'REVEAL' && reveal.placements[0].power).toBe(128);
    const combat = r.events.find((e) => e.type === 'COMBAT');
    expect(combat && combat.type === 'COMBAT' && combat.player?.power).toBe(128);
  });
});

describe('card combat: clashes and direct hits', () => {
  it('5 and 8. Higher ATK wins, the winner is unchanged, and there is no overflow', () => {
    const s = blankMatch();
    const winner = put(s, 'player', 'left', KNIGHT, 120);
    put(s, 'enemy', 'left', KNIGHT, 104);
    const hp = { player: s.player.hp, enemy: s.enemy.hp };
    const r = resolveCardRound(s, NONE, NONE);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_WINS', player: { name: winner.name, power: 120 }, enemy: expect.objectContaining({ power: 104 }) }));
    expect(r.nextState.enemy.heroZones.left).toBeNull();
    expect(r.nextState.player.heroZones.left?.power).toBe(120);
    expect(r.nextState.player.hp).toBe(hp.player);
    expect(r.nextState.enemy.hp).toBe(hp.enemy); // the 16-ATK margin is not dealt to anyone
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
  it('plays exactly like the approved simulator (final variant) on decks without Graveyard returns', () => {
    const decks: [string[], string[]][] = [
      [STARTER_DECKS.kingdom, STARTER_DECKS.infernal],
      [STARTER_DECKS.infernal, STARTER_DECKS.kingdom],
    ];
    const variant = getVariant('final');
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
  it('matches the simulator’s approved final card set, card by card', () => {
    const approved = new Map(getVariant('final').cards().map((c) => [c.id, c]));
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

describe('card combat: mode gating', () => {
  const on = { dev: false, search: '?combat=card', cardModes: 'quickBattle,campaign,ranked', v2Modes: '' };

  it('13. Quick Battle can use card combat (env list or ?combat=card)', () => {
    expect(resolveCombatModel('quickBattle', on)).toBe('card');
    expect(resolveCombatModel('quickBattle', { dev: false, search: '', cardModes: 'quickBattle' })).toBe('card');
    expect(resolveCombatModel('quickBattle', { dev: false, search: '' })).toBe('legacy'); // off by default
    expect(resolveCombatModel('quickBattle', { dev: false, search: '', v2Modes: 'quickBattle' })).toBe('v2'); // Combat V2 untouched
  });

  it('14. Campaign stays legacy', () => {
    expect(resolveCombatModel('campaign', on)).toBe('legacy');
    expect(resolveCombatModel('campaign', { ...on, dev: true })).toBe('legacy');
  });

  it('15. Ranked stays legacy', () => {
    expect(resolveCombatModel('ranked', on)).toBe('legacy');
    expect(resolveCombatModel('ranked', { ...on, dev: true })).toBe('legacy');
  });

  it('16. Friendly Battle stays legacy', () => {
    // Friendly matches are built server-side by the legacy createMatch and rendered without a combat model.
    const friendlyPage = readFileSync(new URL('../../pages/FriendlyBattlePage.tsx', import.meta.url), 'utf8');
    const createMatchApi = readFileSync(new URL('../../../api/create-match.ts', import.meta.url), 'utf8');
    expect(friendlyPage).not.toMatch(/combatModel/);
    expect(createMatchApi).not.toMatch(/combatModel|cardCombat/);
    const legacy = createMatch({ seed: 1, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).state;
    expect(legacy.combatModel).toBeUndefined();
    expect(legacy.player.hp).toBe(STARTING_HP);
  });

  it('only Quick Battle asks for card combat in the app', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const modes = [...app.matchAll(/combatModelForMode\('(\w+)'\)/g)].map((m) => m[1]);
    expect(new Set(modes)).toEqual(new Set(['quickBattle', 'campaign', 'ranked']));
    expect(app).not.toMatch(/'card'/);
  });
});

describe('card combat: player-facing copy', () => {
  it('speaks in ATK and Player HP, never Power, Hero or legacy HP points', async () => {
    const { cardCombatEffectLines, cardCombatEffectSummary } = await import('./cardText.js');
    const { ALL_CARDS } = await import('../cards/index.js');
    for (const card of ALL_CARDS) {
      const text = [cardCombatEffectSummary(card.id), ...cardCombatEffectLines(card.id).map((l) => l.text)].join(' | ');
      expect(text, card.id).not.toMatch(/\bPower\b|\bHero\b|\b[1-5] (HP|damage)\b/);
    }
    expect(cardCombatEffectLines('kng-light-priest')[0].text).toBe('Restore 135 HP to your player.');
    expect(cardCombatEffectLines('spl-arcane-bolt').map((l) => l.text)).toEqual(['Deal 135 damage to the enemy player.', 'If you already cast a Spell this round, deal 90 more.']);
    expect(cardCombatEffectLines('kng-paladin')[0].text).toBe('This Unit gains a Shield.');
  });
});
