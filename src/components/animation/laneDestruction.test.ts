import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, LaneId, Side } from '../../game/types';
import { getCard } from '../../game/cards';
import { STARTER_DECKS } from '../../game/cards/starterDecks';
import { ARCHETYPE_DECKS } from '../../game/cards/archetypeDecks';
import { beginCardRound, createCardMatch, resolveCardRound } from '../../game/cardCombat/engine';
import { chooseCardAiAction } from '../../game/cardCombat/ai';
import { replayUpTo } from '../../game/engine/replay';
import { buildAnimationSteps } from './buildAnimationSteps';
import { computeStepVisuals } from './chitEffects';
import { stateAfterSteps } from './playback';
import { resolveDuration } from './timing';
import type { AnimationStep } from './types';

// Battle UX pass, task 1: a clash loser leaves the board as soon as its own lane resolves, before the next lane
// clashes, and the board shown after each lane matches the resolved game state. The engine and its event log are
// unchanged; this is the playback of that log.

const KNIGHT = 'kng-common-knight';

interface Seat {
  side: Side;
  lane: LaneId;
  atk: number;
  shielded?: boolean;
}

function board(units: Seat[]): GameState {
  const s = createCardMatch({ seed: 3, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.infernal }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  units.forEach(({ side, lane, atk, shielded }, i) => {
    const card = getCard(KNIGHT);
    const unit: HeroInstance = { instanceId: `${side}-${lane}-${i}`, cardId: KNIGHT, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: !!shielded, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
    s[side].heroZones[lane] = unit;
  });
  return s;
}

function play(units: Seat[]) {
  const s = board(units);
  const result = resolveCardRound(s, { plays: [] }, { plays: [] });
  return { s, events: result.events, next: result.nextState, steps: buildAnimationSteps(result.events) };
}

const stepIndex = (steps: AnimationStep[], lane: LaneId, visual: AnimationStep['visualType']) => steps.findIndex((st) => st.lane === lane && st.visualType === visual);
/** The board once every step up to and including `index` has played. */
const after = (run: ReturnType<typeof play>, index: number) => stateAfterSteps(run.s, run.events, run.steps, index + 1);
/** The board while step `index` plays (everything before it committed). */
const during = (run: ReturnType<typeof play>, index: number) => stateAfterSteps(run.s, run.events, run.steps, index);

describe('Battle UX: immediate destruction per lane', () => {
  it('1. the losing Unit leaves the board right after its lane resolves, and the Graveyard updates then', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85 },
      { side: 'player', lane: 'center', atk: 100 },
      { side: 'enemy', lane: 'center', atk: 130 },
    ]);
    const exit = stepIndex(run.steps, 'left', 'hero-destroyed');
    const leftDamage = stepIndex(run.steps, 'left', 'clash-damage');
    const centerClash = stepIndex(run.steps, 'center', 'combat-clash');
    expect(exit).toBe(leftDamage + 1);
    expect(exit).toBeLessThan(centerClash);
    expect(run.steps[exit].events.map((e) => e.type)).toEqual(['HERO_DESTROYED']);

    // While the exit plays, the loser is still drawn (so its animation shows) and marked to shatter.
    const playing = during(run, exit);
    expect(playing.enemy.heroZones.left?.instanceId).toBe('enemy-left-1');
    expect(computeStepVisuals(run.steps[exit], playing).heroChit.get('enemy-left-1')?.className).toContain('chit-shatter');

    // Once it has played: the lane holds only the winner, the Graveyard has the loser, HP shows the left lane only.
    const s = after(run, exit);
    expect(s.enemy.heroZones.left).toBeNull();
    expect(s.player.heroZones.left?.power).toBe(145);
    expect(s.enemy.graveyard).toEqual([...run.s.enemy.graveyard, KNIGHT]);
    expect(s.enemy.hp).toBe(run.s.enemy.hp - 60);
    expect(s.player.hp).toBe(run.s.player.hp);
    expect(s.player.heroZones.center).not.toBeNull();
    expect(s.enemy.heroZones.center).not.toBeNull();
  });

  it('1b. the exit is a quick beat (about a third of a second), not a long cinematic', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85 },
    ]);
    const step = run.steps[stepIndex(run.steps, 'left', 'hero-destroyed')];
    const ms = resolveDuration(step.timingCategory, '1x', false);
    expect(ms).toBeGreaterThanOrEqual(200);
    expect(ms).toBeLessThanOrEqual(350);
  });

  it('2. a tie removes both Units at once, before the next lane', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 120 },
      { side: 'enemy', lane: 'left', atk: 120 },
      { side: 'player', lane: 'right', atk: 90 },
    ]);
    const exit = stepIndex(run.steps, 'left', 'hero-destroyed');
    expect(run.steps[exit].events.map((e) => e.type)).toEqual(['HERO_DESTROYED', 'HERO_DESTROYED']);
    expect(exit).toBe(stepIndex(run.steps, 'left', 'combat-clash') + 1);
    expect(exit).toBeLessThan(stepIndex(run.steps, 'right', 'combat-clash'));
    const s = after(run, exit);
    expect(s.player.heroZones.left).toBeNull();
    expect(s.enemy.heroZones.left).toBeNull();
    expect(s.player.graveyard.length).toBe(run.s.player.graveyard.length + 1);
    expect(s.enemy.graveyard.length).toBe(run.s.enemy.graveyard.length + 1);
    expect(s.player.hp).toBe(run.s.player.hp);
    expect(s.enemy.hp).toBe(run.s.enemy.hp);
  });

  it('a direct hit plays no destroy beat', () => {
    const run = play([{ side: 'player', lane: 'center', atk: 145 }]);
    expect(run.steps.some((st) => st.visualType === 'hero-destroyed')).toBe(false);
    expect(run.steps.map((st) => st.visualType)).toContain('direct-damage');
  });

  it('a Shield that saves the loser plays at its lane, and the Unit stays', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85, shielded: true },
    ]);
    const save = stepIndex(run.steps, 'left', 'shield-save');
    expect(save).toBe(stepIndex(run.steps, 'left', 'clash-damage') + 1);
    const s = after(run, save);
    expect(s.enemy.heroZones.left?.shielded).toBe(false);
    expect(s.enemy.graveyard).toEqual(run.s.enemy.graveyard);
  });

  it('3. every lane clashes on the board the earlier lanes left behind', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85 },
      { side: 'player', lane: 'center', atk: 100 },
      { side: 'enemy', lane: 'center', atk: 130 },
      { side: 'player', lane: 'right', atk: 110 },
      { side: 'enemy', lane: 'right', atk: 110 },
    ]);
    const centerClash = stepIndex(run.steps, 'center', 'combat-clash');
    const rightClash = stepIndex(run.steps, 'right', 'combat-clash');
    const atCenter = during(run, centerClash);
    expect(atCenter.enemy.heroZones.left).toBeNull();
    expect(atCenter.player.heroZones.center).not.toBeNull();
    const atRight = during(run, rightClash);
    expect(atRight.enemy.heroZones.left).toBeNull();
    expect(atRight.player.heroZones.center).toBeNull();
    expect(atRight.player.hp).toBe(run.s.player.hp - 30);
    expect(atRight.player.heroZones.right).not.toBeNull();
    // After the last beat the board is exactly the engine's result.
    const end = after(run, run.steps.length - 1);
    for (const side of ['player', 'enemy'] as Side[]) {
      expect(end[side].hp).toBe(run.next[side].hp);
      expect(end[side].graveyard).toEqual(run.next[side].graveyard);
      for (const lane of ['left', 'center', 'right'] as LaneId[]) expect(end[side].heroZones[lane]?.instanceId).toBe(run.next[side].heroZones[lane]?.instanceId);
    }
  });

  it('the engine log itself is unchanged: every loser is still destroyed after the third lane', () => {
    const run = play([
      { side: 'player', lane: 'left', atk: 145 },
      { side: 'enemy', lane: 'left', atk: 85 },
      { side: 'player', lane: 'right', atk: 90 },
      { side: 'enemy', lane: 'right', atk: 100 },
    ]);
    const lastCombat = run.events.map((e) => e.type).lastIndexOf('COMBAT');
    const firstDestroyed = run.events.findIndex((e) => e.type === 'HERO_DESTROYED');
    expect(firstDestroyed).toBeGreaterThan(lastCombat);
  });
});

/** Plays whole AI-vs-AI matches the way GamePage does and checks the playback of every round. */
function* rounds(seed: number, playerDeck: string[], enemyDeck: string[]) {
  let state = createCardMatch({ seed, playerDeck, enemyDeck }).nextState;
  state = beginCardRound(state).nextState;
  while (state.status === 'IN_PROGRESS') {
    const p = chooseCardAiAction(state, 'player', state.rngState);
    const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
    const r = resolveCardRound(state, p.action, e.action, e.nextRngState);
    yield { base: state, events: r.events, next: r.nextState, replay: () => resolveCardRound(state, p.action, e.action, e.nextRngState) };
    state = r.nextState;
    if (state.status !== 'IN_PROGRESS') break;
    state = beginCardRound(state).nextState;
  }
}

/** Which Units leave the board on each step, in order: the destruction sequence a viewer sees. */
function exitSequence(steps: AnimationStep[]): string[] {
  return steps.flatMap((st, i) => st.events.filter((e): e is Extract<GameEvent, { type: 'HERO_DESTROYED' }> => e.type === 'HERO_DESTROYED').map((e) => `${i}:${st.lane ?? '-'}:${e.side}:${e.instanceId}`));
}

describe('Battle UX: destruction playback across whole matches', () => {
  const decks: [string[], string[]][] = [
    [STARTER_DECKS.kingdom, STARTER_DECKS.undead],
    [STARTER_DECKS.infernal, STARTER_DECKS.kingdom],
    [ARCHETYPE_DECKS.beast, STARTER_DECKS.undead],
  ];

  it('4. replaying a round rebuilds the same lane-by-lane destruction sequence and the same boards', () => {
    let checked = 0;
    for (const [pd, ed] of decks) {
      for (let seed = 1; seed <= 4; seed++) {
        for (const round of rounds(seed, pd, ed)) {
          const steps = buildAnimationSteps(round.events);
          const again = round.replay();
          expect(again.events).toEqual(round.events);
          const replayed = buildAnimationSteps(again.events);
          expect(exitSequence(replayed)).toEqual(exitSequence(steps));
          // The boards right after each exit beat, and at the end, are the same on the replay.
          const checkpoints = [...steps.flatMap((st, i) => (st.commitIndices ? [i + 1] : [])), steps.length];
          for (const i of checkpoints) {
            const a = stateAfterSteps(round.base, round.events, steps, i);
            const b = stateAfterSteps(round.base, again.events, replayed, i);
            expect(b.player.hp).toBe(a.player.hp);
            expect(b.enemy.hp).toBe(a.enemy.hp);
            expect(b.enemy.graveyard).toEqual(a.enemy.graveyard);
            expect(b.player.heroZones).toEqual(a.player.heroZones);
            expect(b.enemy.heroZones).toEqual(a.enemy.heroZones);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  }, 30_000);

  it('every clash loser leaves before the next lane clashes, and the last beat equals the full replay', () => {
    let exits = 0;
    for (const [pd, ed] of decks) {
      for (let seed = 1; seed <= 4; seed++) {
        for (const round of rounds(seed, pd, ed)) {
          const steps = buildAnimationSteps(round.events);
          // Every event is still played exactly once.
          const seen = new Set<GameEvent>();
          for (const st of steps) for (const e of st.events) {
            expect(seen.has(e)).toBe(false);
            seen.add(e);
          }
          expect(seen.size).toBe(round.events.length);

          const clashes = steps.map((st, i) => ({ st, i })).filter(({ st }) => st.visualType === 'combat-clash');
          for (const { st, i } of clashes) {
            const combat = st.events[0] as Extract<GameEvent, { type: 'COMBAT' }>;
            const cd = round.events.find((e): e is Extract<GameEvent, { type: 'CLASH_DAMAGE' }> => e.type === 'CLASH_DAMAGE' && e.lane === combat.lane);
            if (!cd) continue;
            const nextClash = clashes.find((c) => c.i > i)?.i ?? steps.length;
            const exit = steps.findIndex((s2, j) => j > i && j < nextClash && s2.lane === combat.lane && (s2.visualType === 'hero-destroyed' || s2.visualType === 'shield-save'));
            expect(exit).toBeGreaterThan(i);
            // The lane shown before the next clash matches the resolved outcome for that lane.
            const shown = stateAfterSteps(round.base, round.events, steps, exit + 1);
            for (const gone of cd.destroyed) {
              const saved = steps[exit].events.some((e) => e.type === 'SHIELD_CONSUMED' && e.instanceId === gone.instanceId);
              if (!saved) {
                expect(shown[gone.side].heroZones[combat.lane]?.instanceId).not.toBe(gone.instanceId);
                exits++;
              }
            }
          }
          const final = stateAfterSteps(round.base, round.events, steps, steps.length);
          expect(final).toEqual(replayUpTo(round.base, round.events, round.events.length - 1));
        }
      }
    }
    expect(exits).toBeGreaterThan(20);
  }, 30_000);
});
