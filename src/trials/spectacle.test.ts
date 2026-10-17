import { beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../game/types';
import { resolveCardRound } from '../game/cardCombat/engine';
import { chooseCardAiAction } from '../game/cardCombat/ai';
import { battleLogEntries } from '../components/battleInfo/battleLog';
import { replayUpTo } from '../game/engine/replay';
import { registerTrialCards } from './cards';
import { arrange, handIdOf } from './arrange';
import { ARCANE_TRIALS, type ArcaneTrial } from './trials';
import { playTrialRound } from './solver';
import { spectacleCues, type SpectacleCue } from './spectacle';

// Part E: the visual treatments are read from the resolver's own events. Each cue points at the event that causes it,
// and every number it shows is that event's number.

beforeAll(registerTrialCards);

function solutionRounds(trial: ArcaneTrial): { base: GameState; events: GameEvent[] }[] {
  let state = arrange(trial.position).state;
  const out: { base: GameState; events: GameEvent[] }[] = [];
  for (const round of trial.solution) {
    const used = new Map<string, number>();
    const action = {
      plays: round.map(({ cardId, lane }) => {
        const nth = used.get(cardId) ?? 0;
        used.set(cardId, nth + 1);
        return { handId: handIdOf(state, 'player', cardId, nth), cardId, lane };
      }),
    };
    const ai = chooseCardAiAction(state, 'enemy', state.rngState);
    out.push({ base: state, events: resolveCardRound(state, action, ai.action, ai.nextRngState).events });
    state = playTrialRound(state, action).state;
  }
  return out;
}

const kinds = (cues: SpectacleCue[]) => cues.map((c) => `${c.kind}:${c.title}${c.value !== undefined ? `=${c.value}` : ''}`);

describe('signature moments of each intended solution', () => {
  it('The Endless Legion: two rises, each followed by Mordrath growing', () => {
    const [round] = solutionRounds(ARCANE_TRIALS[0]);
    const cues = spectacleCues(round.events, round.base);
    expect(kinds(cues)).toEqual(['rise:Rises=110', 'endless:Endless=140', 'rise:Rises=110', 'endless:Endless=230']);
    for (const c of cues.filter((x) => x.kind === 'rise')) expect(round.events[c.at].type).toBe('REVIVED');
    for (const c of cues.filter((x) => x.kind === 'endless')) expect(round.events[c.at]).toMatchObject({ type: 'POWER_CHANGED', name: 'Mordrath, the Endless King' });
    expect(cues.find((c) => c.kind === 'rise')!.detail).toBe('Deathless Legionary · 1 of 3');
  });

  it('Ashfall: a three-Spell chain, the Conduit, and one strike across all three lanes', () => {
    const [round] = solutionRounds(ARCANE_TRIALS[1]);
    const cues = spectacleCues(round.events, round.base);
    expect(cues.filter((c) => c.kind === 'chain').map((c) => c.detail)).toEqual(['Death Wave', 'Cataclysm: destroys 150 ATK or less', 'Weakness']);
    const conduits = cues.filter((c) => c.kind === 'conduit');
    expect(conduits.map((c) => [c.side, c.lane, c.lanes])).toEqual([
      ['enemy', 'center', ['center', 'left', 'right']],
      ['enemy', 'right', ['right', 'center']],
    ]);
    const strike = cues.find((c) => c.kind === 'strike')!;
    expect(strike.title).toBe('Cataclysm ×3');
    expect(strike.side).toBe('enemy');
    expect([...strike.lanes!].sort()).toEqual(['center', 'left', 'right']);
    // It starts at the first Unit the Spell struck.
    expect(['HERO_DESTROYED', 'SHIELD_CONSUMED']).toContain(round.events[strike.at].type);
  });

  it('The Unbroken: two doublings, two power tiers, and the Vow blocking Unmaking', () => {
    const [first, second] = solutionRounds(ARCANE_TRIALS[2]);
    // At the same event, the bigger moment first.
    expect(kinds(spectacleCues(first.events, first.base))).toEqual(['tier:Ascendant=520', 'double:×2=520']);
    const cues = spectacleCues(second.events, second.base);
    expect(kinds(cues)).toEqual(['immune:Immune', 'tier:Unbroken=1040', 'double:×2=1040']);
    expect(cues[0].detail).toBe('Unmaking can’t touch Aurelian');
  });

  it('ordinary rounds stay quiet: no chain, no cues, in a production battle without experimental cards', () => {
    const s = arrange({ round: 2, seed: 5, player: { hp: 900, board: { left: { cardId: 'kng-common-knight' } }, hand: ['spl-power-surge', 'spl-weakness'] }, enemy: { hp: 900, board: { left: { cardId: 'und-ghoul-brute' } }, hand: [] } }).state;
    const r = resolveCardRound(s, { plays: [{ handId: handIdOf(s, 'player', 'spl-power-surge'), cardId: 'spl-power-surge', lane: 'left' }, { handId: handIdOf(s, 'player', 'spl-weakness'), cardId: 'spl-weakness', lane: 'center' }] }, { plays: [] });
    expect(spectacleCues(r.events, s)).toEqual([]);
  });
});

describe('the battle log tells the truth about the new rules', () => {
  it('Conduit is not described as Archmage Vael’s echo', () => {
    const [round] = solutionRounds(ARCANE_TRIALS[1]);
    const lines = battleLogEntries(round.events, round.base, 'card').map((e) => `${e.who}: ${e.text}`);
    expect(lines).toContain('Ashen Hierophant: Cataclysm reaches the lanes next to it');
    expect(lines.join('\n')).not.toMatch(/resolves twice/);
  });

  it('an exiled Unit is shown leaving play and never reaching the Graveyard (the battle screen’s replay)', () => {
    // The Unbroken without the second Vow: the enemy’s Unmaking exiles Aurelian.
    const trial = ARCANE_TRIALS[2];
    const [first] = solutionRounds(trial);
    let state = arrange(trial.position).state;
    state = playTrialRound(state, { plays: [{ handId: handIdOf(state, 'player', 'spl-stasis-field'), cardId: 'spl-stasis-field', lane: 'left' }] }).state;
    const ai = chooseCardAiAction(state, 'enemy', state.rngState);
    const r = resolveCardRound(state, { plays: [] }, ai.action, ai.nextRngState);
    const shown = replayUpTo(state, r.events, r.events.length - 1);
    expect(first.events.length).toBeGreaterThan(0);
    expect(r.events.some((e) => e.type === 'HERO_DESTROYED' && e.exiled && e.cardId === 'xp-aurelian')).toBe(true);
    expect(shown.player.heroZones.center).toBeNull();
    expect(shown.player.graveyard).not.toContain('xp-aurelian');
    expect(r.nextState.player.graveyard).not.toContain('xp-aurelian');
    expect(spectacleCues(r.events, state).some((c) => c.kind === 'unmade')).toBe(true);
    const log = battleLogEntries(r.events, state, 'card').map((e) => `${e.who}: ${e.text}`);
    expect(log).toContain('Unmaking: Exiled Aurelian, the Unbroken: it never reaches the Graveyard');
  });
});
