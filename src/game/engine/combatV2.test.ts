import { describe, expect, it } from 'vitest';
import { makeHeroInstance } from './abilities';
import { createMatch } from './match';
import { resolveRound } from './resolveRound';
import type { PlayerAction } from '../types';

const empty: PlayerAction = { plays: [] };

function v2Match() {
  return createMatch({
    seed: 41,
    combatModel: 'v2',
    playerDeck: ['kng-archer', 'spl-fireball', 'kng-common-knight'],
    enemyDeck: ['und-bone-soldier', 'und-cursed-warrior', 'und-dark-priest'],
    heroLevels: { player: { 'kng-archer': 20 }, enemy: { 'und-bone-soldier': 20 } },
  });
}

describe('V2 combat through the production three-lane resolver', () => {
  it('creates deck-derived Commander health and uses Hero Level in board stats', () => {
    const { state } = v2Match();
    expect(state.combatModel).toBe('v2');
    expect(state.player.maxHp).toBeGreaterThan(20);
    const archer = makeHeroInstance('player', 'center', 1, 'kng-archer', 0, 20, 'v2');
    expect(archer.power).toBe(13);
    expect(archer.hp).toBe(35);
    expect(archer.maxHp).toBe(35);
  });

  it('keeps simultaneous Hero damage on the board between clashes, then removes both at zero', () => {
    let state = v2Match().state;
    state.player.heroZones.center = makeHeroInstance('player', 'center', 1, 'kng-archer', 0, 20, 'v2');
    state.enemy.heroZones.center = makeHeroInstance('enemy', 'center', 1, 'und-bone-soldier', 0, 20, 'v2');
    const first = resolveRound(state, empty, empty, 5);
    state = first.nextState;
    expect(state.player.heroZones.center?.hp).toBe(22);
    expect(state.enemy.heroZones.center?.hp).toBe(22);
    const second = resolveRound(state, empty, empty, 6);
    state = second.nextState;
    expect(state.player.heroZones.center?.hp).toBe(9);
    expect(state.enemy.heroZones.center?.hp).toBe(9);
    const third = resolveRound(state, empty, empty, 7);
    expect(third.nextState.player.heroZones.center).toBeNull();
    expect(third.nextState.enemy.heroZones.center).toBeNull();
    expect(third.events.filter(event => event.type === 'HERO_DAMAGE')).toHaveLength(2);
    expect(third.events.some(event => event.type === 'HERO_DESTROYED')).toBe(true);
  });

  it('uses bounded ATK damage on an empty lane', () => {
    const { state } = v2Match();
    state.player.heroZones.left = makeHeroInstance('player', 'left', 1, 'und-vharos', 0, 60, 'v2');
    const before = state.enemy.hp;
    const result = resolveRound(state, empty, empty, 9);
    const damage = result.events.find(event => event.type === 'DIRECT_DAMAGE' && event.side === 'enemy');
    expect(damage && 'amount' in damage ? damage.amount : undefined).toBe(15);
    expect(before - result.nextState.enemy.hp).toBe(15);
  });

  it('keeps legacy resolver behavior available on the same Fireball card', () => {
    const { state } = createMatch({ seed: 9, playerDeck: ['spl-fireball'], enemyDeck: ['kng-archer'] });
    const hand = state.player.hand.find(card => card.cardId === 'spl-fireball');
    if (!hand) throw new Error('Fireball was not dealt to the starting hand');
    state.enemy.heroZones.left = makeHeroInstance('enemy', 'left', 1, 'kng-archer');
    const result = resolveRound(state, { plays: [{ handId: hand.handId, cardId: hand.cardId, lane: 'left' }] }, empty, 10);
    expect(result.events.some(event => event.type === 'HERO_DAMAGE')).toBe(false);
    expect(result.events.some(event => event.type === 'POWER_CHANGED' && event.to === 0)).toBe(true);
  });
});
