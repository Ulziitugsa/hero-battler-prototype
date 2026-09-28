import { describe, expect, it } from 'vitest';
import { combatStats, commanderHp, createV2State, makeV2Hero, resolveV2Round, translatePrototypeSpell } from './model';

function duel(attackerLevel: number, defenderLevel: number, attackerRank = 0, defenderRank = 0) {
  let state = createV2State(13, ['kng-archer'], ['kng-archer']);
  state.player.heroes.center = makeV2Hero('kng-archer', attackerLevel, attackerRank);
  state.enemy.heroes.center = makeV2Hero('kng-archer', defenderLevel, defenderRank);
  let clashes = 0;
  while (clashes < 12 && state.player.heroes.center && state.enemy.heroes.center) {
    state = resolveV2Round(state, [], []);
    clashes += 1;
  }
  return { state, clashes };
}

describe('isolated combat v2 model', () => {
  it('uses predictable Level 1/20/40/60 stat steps', () => {
    expect([1, 20, 40, 60].map(level => combatStats('kng-archer', level))).toEqual([
      { attack: 12, maxHp: 30 },
      { attack: 13, maxHp: 35 },
      { attack: 15, maxHp: 44 },
      { attack: 17, maxHp: 53 },
    ]);
  });

  it('keeps peer Heroes in the target 2–4 clash range across progression', () => {
    for (const level of [1, 20, 40, 60]) {
      const result = duel(level, level);
      expect(result.clashes).toBeGreaterThanOrEqual(2);
      expect(result.clashes).toBeLessThanOrEqual(4);
      expect(result.state.player.heroes.center).toBeUndefined();
      expect(result.state.enemy.heroes.center).toBeUndefined();
    }
  });

  it('lets progression win a close lane without one-shotting the opponent', () => {
    const result = duel(40, 20);
    expect(result.clashes).toBe(3);
    expect(result.state.player.heroes.center?.hp).toBeGreaterThan(0);
    expect(result.state.enemy.heroes.center).toBeUndefined();
    expect(duel(20, 40).clashes).toBe(3);
    expect(duel(40, 60).clashes).toBe(3);
  });

  it('keeps Ascension stat growth modest beside its card-specific ability path', () => {
    const base = combatStats('kng-archer', 40, 0);
    const ascended = combatStats('kng-archer', 40, 3);
    expect(ascended.attack - base.attack).toBe(3);
    expect(ascended.maxHp - base.maxHp).toBe(16);
    const result = duel(40, 40, 3, 0);
    expect(result.state.player.heroes.center?.hp).toBeGreaterThan(0);
    expect(result.state.enemy.heroes.center).toBeUndefined();
  });

  it('uses bounded deck-derived Commander vitality and grows with roster health', () => {
    const deck = Array.from({ length: 11 }, (_, index) => ['kng-archer', 'kng-light-priest', 'kng-royal-guard'][index % 3]);
    expect(commanderHp(deck, 1)).toBeGreaterThanOrEqual(80);
    expect(commanderHp(deck, 60)).toBeGreaterThan(commanderHp(deck, 1));
    expect(commanderHp(deck, 60)).toBeLessThanOrEqual(150);
    expect(commanderHp(deck, 1, 0, 'A')).toBe(Math.round(deck.reduce((sum, id) => sum + combatStats(id).maxHp, 0) * 0.25));
    expect(commanderHp(deck, 1, 0, 'C')).toBeGreaterThan(commanderHp(deck, 1, 0, 'B'));
  });

  it('resolves simultaneous strikes, carries HP and destroys at zero', () => {
    let state = createV2State(7, ['kng-common-knight'], ['und-bone-soldier']);
    state.player.heroes.center = makeV2Hero('kng-common-knight');
    state.enemy.heroes.center = makeV2Hero('und-bone-soldier');
    state.enemy.heroes.center.hp = 1;
    state = resolveV2Round(state, [], []);
    expect(state.enemy.heroes.center).toBeUndefined();
    expect(state.enemy.defeated).toContain('und-bone-soldier');
    expect(state.player.heroes.center?.hp).toBeLessThan(state.player.heroes.center?.maxHp ?? 999);
    expect(state.events.filter(event => event.type === 'HERO_DAMAGE')).toHaveLength(2);
  });

  it('caps healing at max HP and consumes Hero shields before health', () => {
    let state = createV2State(3, ['kng-common-knight'], ['und-bone-soldier']);
    state.player.heroes.center = makeV2Hero('kng-common-knight');
    state.enemy.heroes.center = makeV2Hero('und-bone-soldier');
    state.player.heroes.center.hp = 5;
    state = resolveV2Round(state, [
      { cardId: 'spl-second-chance', lane: 'center', spell: 'heal' },
      { cardId: 'spl-aegis-ward', lane: 'center', spell: 'shield' },
    ], []);
    expect(state.player.heroes.center?.hp).toBe(15);
    expect(state.player.heroes.center?.shield).toBe(0); // the shield absorbs 10 of the simultaneous clash damage
    const fullState = createV2State(3, ['kng-common-knight'], ['und-bone-soldier']);
    fullState.player.heroes.center = makeV2Hero('kng-common-knight');
    const fullResult = resolveV2Round(fullState, [{ cardId: 'spl-second-chance', lane: 'center', spell: 'heal' }], []);
    expect(fullResult.events.find(event => event.type === 'HERO_HEAL')?.amount).toBe(0);
    expect(fullResult.player.heroes.center?.hp).toBe(fullState.player.heroes.center?.maxHp);
  });

  it('scales empty-lane Commander hits and caps high ATK pressure', () => {
    let state = createV2State(3, ['und-vharos'], ['kng-common-knight']);
    state.player.heroes.left = makeV2Hero('und-vharos', 60);
    const before = state.enemy.commanderHp;
    state = resolveV2Round(state, [], []);
    expect(before - state.enemy.commanderHp).toBe(15);
    expect(state.events.find(event => event.type === 'COMMANDER_DAMAGE')?.amount).toBe(15);
  });

  it('supports Fireball, direct damage, Attack buffs/debuffs and a lane stall', () => {
    expect(translatePrototypeSpell('spl-fireball')).toBe('fireball');
    expect(translatePrototypeSpell('spl-arcane-bolt')).toBe('arcaneBolt');
    let state = createV2State(1, ['kng-common-knight'], ['und-bone-soldier']);
    state = resolveV2Round(state,
      [{ cardId: 'kng-common-knight', lane: 'center' }, { cardId: 'spl-power-surge', lane: 'center', spell: 'attackUp' }, { cardId: 'spl-aegis-ward', lane: 'left', spell: 'commanderShield' }],
      [{ cardId: 'und-bone-soldier', lane: 'center' }, { cardId: 'spl-weakness', lane: 'center', spell: 'attackDown' }]);
    expect(state.events.some(event => event.type === 'HERO_BUFF')).toBe(true);
    expect(state.events.some(event => event.type === 'HERO_DEBUFF')).toBe(true);
    state = resolveV2Round(state, [{ cardId: 'spl-stasis-field', lane: 'center', spell: 'laneStall' }], []);
    expect(state.events.some(event => event.type === 'LANE_STALLED')).toBe(true);
  });

  it('creates a multi-turn boss encounter with three lanes and a large Commander health pool', () => {
    const state = createV2State(4, ['kng-common-knight'], ['und-vharos'], { boss: true });
    expect(state.enemy.commanderHp).toBe(240);
    expect(state.player.commanderHp).toBe(80);
    expect(Object.keys(state.enemy.heroes)).toHaveLength(0);
    expect(['left', 'center', 'right']).toHaveLength(3);
  });

  it('produces deterministic output for equal inputs', () => {
    const run = () => resolveV2Round(createV2State(4, ['kng-common-knight'], ['und-vharos']), [{ cardId: 'kng-common-knight', lane: 'left' }], []);
    expect(run()).toEqual(run());
  });
});
