/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../game/types';
import { beginCardRound, createCardMatch, resolveCardRound, validateCardDeployment } from '../game/cardCombat/engine';
import { chooseCardAiAction } from '../game/cardCombat/ai';
import { deckStartingHp } from '../game/cardCombat/stats';
import { getCombatCard } from '../game/cardCombat/cards';
import { getCard } from '../game/cards';
import { LAUNCH_DECKS, getLaunchDeck, launchDeckList } from '../game/cards/launchDecks';
import { installStorageGuard } from './storageGuard';
import { isLabUrl } from './labAccess';
import { LAB_SCENARIOS, buildScenario, type LabScenario } from './scenarios';
import { labMoments, type LabMoment } from './moments';
import { cardContributions, cardSource, cardsWorthExploring } from './discovery';
import { AI_MEASURED, LAB_ARCHETYPES } from './archetypes';
import { randomCardAction } from './randomPilot';
import { LabMomentsLayer } from './LabMomentsLayer';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

/** Plays the scenario's suggested play through the real resolver, with the real AI for the opponent. */
function playSuggested(s: LabScenario) {
  const { state } = buildScenario(s);
  const taken = new Set<string>();
  const plays = s.play.map((p) => {
    const hand = state.player.hand.find((h) => h.cardId === p.cardId && !taken.has(h.handId))!;
    taken.add(hand.handId);
    return { handId: hand.handId, cardId: p.cardId, lane: p.lane };
  });
  const ai = chooseCardAiAction(state, 'enemy', state.rngState);
  const result = resolveCardRound(state, { plays }, ai.action, ai.nextRngState);
  return { state, plays, ai, result, events: result.events };
}

/** A whole AI-vs-AI match on the production resolver, with its event log. */
function aiMatch(playerDeck: string[], enemyDeck: string[], seed: number): { events: GameEvent[]; state: GameState } {
  const built = createCardMatch({ seed, playerDeck, enemyDeck });
  let state = built.nextState;
  const events: GameEvent[] = [...built.events];
  while (state.status === 'IN_PROGRESS') {
    const p = chooseCardAiAction(state, 'player', state.rngState);
    const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
    const r = resolveCardRound(state, p.action, e.action, e.nextRngState);
    events.push(...r.events);
    state = r.nextState;
    if (state.status !== 'IN_PROGRESS') break;
    const b = beginCardRound(state);
    events.push(...b.events);
    state = b.nextState;
  }
  return { events, state };
}

const effectDamageTo = (events: readonly GameEvent[], side: 'player' | 'enemy', sources: string[]) =>
  events.filter((e): e is Extract<GameEvent, { type: 'DIRECT_DAMAGE' }> => e.type === 'DIRECT_DAMAGE' && e.side === side && sources.includes(e.sourceName)).reduce((n, e) => n + e.amount, 0);
/** Effect damage to `side`: every DIRECT_DAMAGE except the hit an unopposed or bypassing Unit makes in combat. */
const effectDamage = (events: readonly GameEvent[], side: 'player' | 'enemy') =>
  events.reduce((n, e, i) => (e.type === 'DIRECT_DAMAGE' && e.side === side && !(events[i - 1]?.type === 'COMBAT') ? n + e.amount : n), 0);
const combatIn = (events: readonly GameEvent[], lane: string) => events.find((e): e is Extract<GameEvent, { type: 'COMBAT' }> => e.type === 'COMBAT' && e.lane === lane)!;

describe('save isolation', () => {
  class FakeStorage {
    data = new Map<string, string>();
    getItem(k: string) {
      return this.data.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      this.data.set(k, v);
    }
    removeItem(k: string) {
      this.data.delete(k);
    }
    clear() {
      this.data.clear();
    }
  }

  it('refuses every write to the guarded storage, records it, keeps reads, and leaves other storages alone', () => {
    const local = new FakeStorage();
    const session = new FakeStorage();
    local.data.set('skyloom:collection', 'saved');
    const guard = installStorageGuard(local as unknown as Storage);
    try {
      local.setItem('skyloom:collection', 'overwritten');
      local.removeItem('skyloom:collection');
      local.clear();
      session.setItem('other', '1');
      expect(local.getItem('skyloom:collection')).toBe('saved');
      expect(local.data.size).toBe(1);
      expect(session.getItem('other')).toBe('1');
      expect(guard.blocked).toEqual(['setItem skyloom:collection', 'removeItem skyloom:collection', 'clear']);
    } finally {
      guard.uninstall();
    }
    local.setItem('after', '1');
    expect(local.getItem('after')).toBe('1');
  });

  it('the lab is its own page load: main.tsx installs the guard first and skips migrations, missions and events', () => {
    const main = read('../main.tsx');
    expect(main.split('\n').find((l) => l.startsWith('import '))).toBe("import { labGuard } from './lab/earlyGuard'");
    const lab = main.indexOf('if (__CARD_LAB__ && labGuard) {');
    const game = main.indexOf('} else {');
    expect(lab).toBeGreaterThan(0);
    expect(game).toBeGreaterThan(lab);
    for (const call of ['runLaunchSetMigration()', 'migrateToRealCollection()', 'runSaveMigrations()', 'initMissions()', 'initEvents()', "track('session_started')"]) {
      expect(main.indexOf(call), call).toBeGreaterThan(game);
    }
    expect(read('./earlyGuard.ts')).toContain('__CARD_LAB__ && typeof window');
  });

  it('only a lab build opens it: the dev server, VITE_CARD_LAB=1 or a Vercel preview; VITE_CARD_LAB=0 always wins', () => {
    const config = read('../../vite.config.ts');
    expect(config).toContain("if (env.VITE_CARD_LAB === '0') return false");
    expect(config).toContain("return command === 'serve' || env.VITE_CARD_LAB === '1' || env.VERCEL_ENV === 'preview'");
    expect(config).toContain("__CARD_LAB__: JSON.stringify(mode !== 'test' && cardLabEnabled(");
    expect(isLabUrl('?lab')).toBe(true);
    expect(isLabUrl('?lab=1&x=2')).toBe(true);
    expect(isLabUrl('')).toBe(false);
    expect(isLabUrl('?label=1')).toBe(false);
  });

  it('nothing outside the lab imports it, except main.tsx', () => {
    const offenders: string[] = [];
    const walk = (dir: URL, rel: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name !== 'lab') walk(new URL(`${entry.name}/`, dir), `${rel}${entry.name}/`);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || rel + entry.name === 'main.tsx') continue;
        const src = readFileSync(new URL(entry.name, dir), 'utf8');
        if (/from '(\.\.?\/)+lab\//.test(src) || /import\('(\.\.?\/)+lab\//.test(src)) offenders.push(rel + entry.name);
      }
    };
    walk(new URL('../', import.meta.url), '');
    expect(offenders).toEqual([]);
  });

  it('a sandbox battle records nothing: no match history, no battle_completed, no XP or Gold, no mission read', () => {
    const page = read('../pages/GamePage.tsx');
    expect(page).toContain('if (!remoteOpponent && !sandbox) saveRecentMatch(');
    expect(page).toContain("if (!remoteOpponent && !sandbox) track('battle_completed'");
    expect(page).toContain('if (!onMatchEnd && !remoteOpponent && !sandbox) {');
    expect(page).toContain('missionsAtStart.current = sandbox ? [] : listMissions();');
    expect(page.match(/saveRecentMatch\(/g)).toHaveLength(1);
    expect(page.match(/track\('battle_completed'/g)).toHaveLength(1);
    expect(page.match(/grantQuickBattleXp\(|grantGold\(/g)).toHaveLength(2);
    expect(read('./CardLabApp.tsx')).toContain('          sandbox\n');
  });
});

describe('arranged combination tests resolve through the real engine', () => {
  it('every setup is a legal position with legal suggested plays, and is deterministic', () => {
    expect(LAB_SCENARIOS).toHaveLength(9);
    for (const s of LAB_SCENARIOS) {
      const a = buildScenario(s);
      expect(JSON.stringify(a)).toBe(JSON.stringify(buildScenario(s)));
      const { state, plays, events } = playSuggested(s);
      expect(validateCardDeployment(state, 'player', { plays }).legal, s.id).toBe(true);
      // Same plays, same seed: the same round, event for event.
      expect(JSON.stringify(playSuggested(s).events)).toBe(JSON.stringify(events));
      // Starting HP is each full deck's own.
      expect(state.player.maxHp).toBe(deckStartingHp(launchDeckList(getLaunchDeck(s.player.deck))).total);
      expect(state.enemy.maxHp).toBe(deckStartingHp(launchDeckList(getLaunchDeck(s.enemy.deck))).total);
      expect(state.enemy.hand).toEqual([]);
      // Every arranged card is from the deck list, or listed as borrowed from the Box.
      const list = launchDeckList(getLaunchDeck(s.player.deck));
      const used = [...s.player.hand, ...Object.values(s.player.board).map((u) => u!.cardId), ...Object.values(s.player.spells ?? {}).map((x) => x!.cardId), ...(s.player.graveyard ?? [])];
      for (const id of used) expect(list.includes(id) || s.borrowed?.includes(id), `${s.id}: ${id}`).toBe(true);
      expect(state.player.deck.length + used.filter((id) => list.includes(id)).length).toBe(15);
    }
  });

  const run = (id: string) => playSuggested(LAB_SCENARIOS.find((s) => s.id === id)!).events;

  it('Vael and two Arcane Bolts: 585 damage before any clash, the first Bolt twice', () => {
    const events = run('arcane-echo');
    const firstClash = events.findIndex((e) => e.type === 'COMBAT');
    expect(effectDamageTo(events.slice(0, firstClash), 'enemy', ['Arcane Bolt', 'Archmage Vael'])).toBe(585);
    expect(events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.sourceName === 'Arcane Bolt').map((e) => (e as { amount: number }).amount)).toEqual([135, 135, 135, 90]);
    expect(labMoments(events).some((m) => m.kind === 'echo' && m.detail === 'Arcane Bolt resolves twice')).toBe(true);
  });

  it('Morwen revives Bone Soldier into the empty lane; Bone Dragon fights at 182', () => {
    const events = run('bone-legion-morwen');
    expect(events.find((e) => e.type === 'REVIVED')).toMatchObject({ name: 'Bone Soldier', lane: 'right', power: 93 });
    expect(combatIn(events, 'left').player?.power).toBe(182);
    expect(combatIn(events, 'right').player).toMatchObject({ name: 'Bone Soldier', power: 123 });
  });

  it('Blood Pact: own Blood Imp, then the enemy Common Knight; Kathra 145 and 45 damage', () => {
    const events = run('bloodbound-pact');
    const destroyed = events.filter((e) => e.type === 'HERO_DESTROYED').map((e) => (e as { name: string }).name);
    expect(destroyed.slice(0, 2)).toEqual(['Blood Imp', 'Common Knight']);
    expect(effectDamageTo(events, 'enemy', ['Kathra, Blood Queen'])).toBe(45);
    expect(combatIn(events, 'center').player).toMatchObject({ name: 'Kathra, Blood Queen', power: 145 });
    expect(labMoments(events).some((m) => m.kind === 'sacrifice' && m.detail === 'Blood Pact destroyed its own Blood Imp')).toBe(true);
  });

  it('The Plague Mother: the worn Common Knight falls to 35 ATK at Round End and is destroyed', () => {
    const s = LAB_SCENARIOS.find((x) => x.id === 'wither-plague')!;
    const { events, state } = playSuggested(s);
    expect(combatIn(events, 'center').player).toMatchObject({ name: 'The Plague Mother', power: 122 });
    // The arranged board says the Common Knight is already at 50 ATK: the moments read it from the base state.
    const death = labMoments(events, state).find((m) => m.kind === 'deathLine')!;
    expect(death.detail).toContain('Common Knight fell to 35 ATK after The Plague Mother');
    expect(events[death.until]).toMatchObject({ type: 'HERO_DESTROYED', name: 'Common Knight' });
  });

  it('Phantoms: Wraith Prince (78) and Duchess Nyx (127) bypass; the blockers do nothing; both grow', () => {
    const events = run('phantoms-bypass');
    const bypasses = events.filter((e) => e.type === 'COMBAT' && e.bypass);
    expect(bypasses.map((e) => (e as { lane: string }).lane)).toEqual(['left', 'center']);
    expect(effectDamageTo(events, 'enemy', ['Wraith Prince', 'Duchess Nyx'])).toBe(78 + 127);
    expect(events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.side === 'player').map((e) => (e as { sourceName: string }).sourceName)).toEqual(['Common Knight']);
    expect(events.filter((e) => e.type === 'POWER_CHANGED' && e.permanent && e.to - e.from === 15).map((e) => (e as { name: string }).name)).toEqual(['Wraith Prince', 'Duchess Nyx']);
  });

  it('Hellfire: 540 effect damage and Meteor destroys Kingdom Archer', () => {
    const events = run('hellfire-burn');
    expect(effectDamage(events, 'enemy')).toBe(540);
    expect(events.find((e) => e.type === 'HERO_DESTROYED')).toMatchObject({ name: 'Kingdom Archer', side: 'enemy' });
  });

  it('Saint Aveline returns Reliquary Blade when Banner Knight (134) loses to the bannered Common Knight (143)', () => {
    const events = run('crusade-aveline');
    expect(combatIn(events, 'center')).toMatchObject({ outcome: 'ENEMY_WINS', player: { name: 'Banner Knight', power: 134 }, enemy: { name: 'Common Knight', power: 143 } });
    expect(events.find((e) => e.type === 'SPELL_EXPIRED')).toMatchObject({ name: 'Reliquary Blade' });
    expect(events.find((e) => e.type === 'RETURNED_TO_HAND')).toMatchObject({ name: 'Reliquary Blade', side: 'player' });
  });

  it('The full Knight line: 171 / 150 / 147, all three clashes won; Vharos comes back at 95', () => {
    const events = run('vanguard-line');
    expect(['left', 'center', 'right'].map((l) => combatIn(events, l).player?.power)).toEqual([171, 150, 147]);
    expect(['left', 'center', 'right'].map((l) => combatIn(events, l).outcome)).toEqual(['PLAYER_WINS', 'PLAYER_WINS', 'PLAYER_WINS']);
    expect(events.find((e) => e.type === 'REVIVED')).toMatchObject({ name: 'Vharos, the Undying', power: 95 });
  });

  it('Hellpack: Ash Jackal 159, Alpha Hound 123, and the Matriarch leaves a Hound Pup in the center', () => {
    const events = run('hellpack-pups');
    expect(combatIn(events, 'left').player?.power).toBe(159);
    expect(combatIn(events, 'right').player?.power).toBe(123);
    expect(events.find((e) => e.type === 'TOKEN_SUMMONED')).toMatchObject({ name: 'Hound Pup', lane: 'center', side: 'player' });
  });
});

describe('key moments describe only what the events show', () => {
  /** Each moment's claim, checked against the events up to its index. */
  function evidence(m: LabMoment, events: readonly GameEvent[]): boolean {
    const upTo = events.slice(0, m.until + 1);
    const at = events[m.until];
    switch (m.kind) {
      case 'revive':
        return upTo.some((e) => e.type === 'REVIVED');
      case 'removal':
      case 'sacrifice':
        return upTo.some((e) => e.type === 'HERO_DESTROYED');
      case 'deathLine':
        return at.type === 'HERO_DESTROYED';
      case 'token':
        return upTo.some((e) => e.type === 'TOKEN_SUMMONED');
      case 'bypass':
        return upTo.some((e) => e.type === 'COMBAT' && e.bypass);
      case 'turned':
        return at.type === 'COMBAT' && !!at.player && !!at.enemy && (m.side === 'player' ? at.outcome !== 'ENEMY_WINS' : at.outcome === 'ENEMY_WINS');
      case 'shield':
        return upTo.some((e) => e.type === 'SHIELD_CONSUMED');
      case 'immune':
        return upTo.some((e) => e.type === 'IMMUNITY_BLOCKED');
      case 'prevented':
        return upTo.some((e) => e.type === 'DAMAGE_PREVENTED');
      case 'echo':
        return upTo.some((e) => e.type === 'TRIGGER' && e.trigger === 'PASSIVE' && e.sourceName === m.source);
      case 'burst':
      case 'swing':
      case 'chain':
      case 'returned':
        return upTo.some((e) => e.type === 'TRIGGER' && e.sourceName === m.source && e.side === m.side);
    }
  }

  it('across real AI-vs-AI matches of every optimised deck, every moment has its evidence, in order', () => {
    let seen = 0;
    const kinds = new Set<string>();
    for (const [i, deck] of LAUNCH_DECKS.filter((d) => d.kind === 'optimized').entries()) {
      for (const foe of ['kingdom-starter', 'undead-starter', 'wither', 'arcane']) {
        const { events } = aiMatch(launchDeckList(deck), launchDeckList(getLaunchDeck(foe)), 4242 + i * 31);
        const moments = labMoments(events);
        for (const m of moments) {
          expect(m.until, `${m.kind} ${m.detail}`).toBeLessThan(events.length);
          expect(evidence(m, events), `${deck.id}: ${m.kind} ${m.source}: ${m.detail}`).toBe(true);
          kinds.add(m.kind);
        }
        seen += moments.length;
      }
    }
    expect(seen).toBeGreaterThan(100);
    for (const k of ['chain', 'revive', 'turned', 'bypass', 'token', 'shield', 'burst', 'deathLine']) expect(kinds.has(k), k).toBe(true);
  });

  it('a clash is "turned" only when the starting ATK order and the fought ATK order disagree', () => {
    const events = run2('vanguard-line');
    const turned = labMoments(events, buildScenario(LAB_SCENARIOS.find((s) => s.id === 'vanguard-line')!).state).filter((m) => m.kind === 'turned');
    // Knight-Errant 96 < Vharos 130 and Aldric 105 < Ghoul Brute 122 were turned; Battle Captain 102 > Crypt Warden 98 was not.
    expect(turned.map((m) => m.source)).toEqual(['Knight-Errant', 'Marshal Aldric']);
  });

  it('the layer shows a moment only once playback has reached its events', () => {
    const s = LAB_SCENARIOS.find((x) => x.id === 'arcane-echo')!;
    const { events, state } = playSuggested(s);
    const echo = labMoments(events, state).find((m) => m.kind === 'echo')!;
    const before = renderToStaticMarkup(createElement(LabMomentsLayer, { view: { events, base: state, revealedUntil: echo.until - 1, resolving: true, round: 2 } }));
    const after = renderToStaticMarkup(createElement(LabMomentsLayer, { view: { events, base: state, revealedUntil: echo.until, resolving: true, round: 2 } }));
    expect(before).not.toContain('Spell repeated');
    expect(after).toContain('Spell repeated');
    expect(after).toContain('Your Archmage Vael');
    const between = renderToStaticMarkup(createElement(LabMomentsLayer, { view: { events, base: state, revealedUntil: Number.MAX_SAFE_INTEGER, resolving: false, round: 3 } }));
    expect(between).toMatch(/Round 2: \d+ key moments/);
  });

  function run2(id: string) {
    return playSuggested(LAB_SCENARIOS.find((s) => s.id === id)!).events;
  }
});

describe('cards worth exploring', () => {
  it('attributes effects to the card that caused them (Vael’s storm: Arcane Bolt 495, Vael 90)', () => {
    const s = LAB_SCENARIOS.find((x) => x.id === 'arcane-echo')!;
    const { events } = playSuggested(s);
    const deck = launchDeckList(getLaunchDeck('arcane'));
    const byName = new Map(cardContributions(events, 'player', deck).map((c) => [c.name, c]));
    expect(byName.get('Arcane Bolt')).toMatchObject({ damage: 495, triggers: 3 });
    expect(byName.get('Archmage Vael')).toMatchObject({ damage: 90 });
    const picks = cardsWorthExploring(events, 'player', deck);
    expect(picks[0]).toMatchObject({ cardId: 'spl-arcane-bolt', obtainable: true });
    expect(picks[0].summary).toContain('dealt 495 effect damage');
  });

  it('picks at most three of the opponent’s cards, each from its deck, each with an effect that did something', () => {
    for (const foe of LAUNCH_DECKS.filter((d) => d.kind === 'optimized')) {
      const deck = launchDeckList(foe);
      const { events } = aiMatch(launchDeckList(getLaunchDeck('kingdom-starter')), deck, 777);
      const picks = cardsWorthExploring(events, 'enemy', deck);
      expect(picks.length).toBeLessThanOrEqual(3);
      for (const p of picks) {
        expect(deck).toContain(p.cardId);
        expect(p.score).toBeGreaterThan(0);
        expect(p.triggers + p.bypassDamage + p.shieldSaves).toBeGreaterThan(0);
        // Its effect damage is exactly what the log credits to it.
        const credited = events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.side === 'player' && e.sourceName === p.name).reduce((n, e) => n + (e as { amount: number }).amount, 0);
        expect(p.damage + p.bypassDamage).toBeLessThanOrEqual(credited);
      }
    }
  });

  it('names the normal source, and says plainly when a card can’t be obtained', () => {
    expect(cardSource('kng-archmage-vael')).toEqual({ obtainable: true, source: 'Arcane Box' });
    expect(cardSource('kng-paladin').source).toContain('Core · Kingdom');
    expect(cardSource('spl-meteor').source).toContain('Structure Deck');
    const tyrant = cardSource('und-grave-tyrant');
    expect(tyrant.obtainable).toBe(false);
    expect(tyrant.source.startsWith('Not obtainable yet')).toBe(true);
  });
});

describe('archetype data is grounded in the cards', () => {
  const optimised = LAUNCH_DECKS.filter((d) => d.kind === 'optimized').map((d) => d.id);

  it('covers the nine optimised decks, with their Legendary, Starting HP and Unit count', () => {
    expect(LAB_ARCHETYPES.map((a) => a.deckId).sort()).toEqual([...optimised].sort());
    for (const a of LAB_ARCHETYPES) {
      const list = launchDeckList(getLaunchDeck(a.deckId));
      expect(list, a.id).toContain(a.legendary);
      expect(getCard(a.legendary).rarity).toBe('legendary');
      expect(deckStartingHp(list).total, a.id).toBe(a.startingHp);
      expect(list.filter((id) => getCombatCard(id).type === 'hero').length, a.id).toBe(a.units);
      expect(AI_MEASURED[a.deckId], a.id).toBeDefined();
      expect(LAB_SCENARIOS.find((s) => s.id === a.scenarioId)?.archetype, a.id).toBe(a.id);
    }
  });

  it('every card it names exists; key and combo cards are in the list unless the combo says they are Box cards', () => {
    for (const a of LAB_ARCHETYPES) {
      const list = launchDeckList(getLaunchDeck(a.deckId));
      for (const id of [...a.keyCards, ...a.counterCards, ...a.combos.flatMap((c) => c.cards)]) expect(() => getCard(id), id).not.toThrow();
      for (const id of a.keyCards) expect(list, `${a.id} key card ${id}`).toContain(id);
      for (const c of a.combos) for (const id of c.cards) if (!list.includes(id)) expect(c.title, `${a.id}: ${id}`).toContain('Box cards');
    }
  });

  it('the random pilot plays only legal deployments', () => {
    for (const deck of LAUNCH_DECKS.filter((d) => d.kind === 'optimized')) {
      let state = createCardMatch({ seed: 9, playerDeck: launchDeckList(deck), enemyDeck: launchDeckList(getLaunchDeck('wither')) }).nextState;
      for (let round = 0; round < 6 && state.status === 'IN_PROGRESS'; round++) {
        const p = randomCardAction(state, 'player', state.rngState);
        expect(validateCardDeployment(state, 'player', p.action).legal, deck.id).toBe(true);
        const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
        state = resolveCardRound(state, p.action, e.action, e.nextRngState).nextState;
        if (state.status === 'IN_PROGRESS') state = beginCardRound(state).nextState;
      }
    }
  });
});
