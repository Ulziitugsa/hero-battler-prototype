import { getCard } from '../cards';
import type { Faction, GameEvent, GameState } from '../types';

// The facts about one finished local battle that event missions (and future analytics) can count.
// Derived purely from the match's own event log, so it needs no new instrumentation inside the engine.

export type BattleMode = 'quick' | 'campaign' | 'ranked' | 'story';

export interface BattleSummary {
  [key: string]: string | number;
  mode: BattleMode;
  result: 'win' | 'loss' | 'draw';
  rounds: number;
  unitsPlayed: number;
  spellsPlayed: number;
  /** Damage to the opponent's HP from any source (unopposed hits, combat overflow, direct effects). */
  damageDealt: number;
  kingdomUnitsPlayed: number;
  undeadUnitsPlayed: number;
  infernalUnitsPlayed: number;
  wildbornUnitsPlayed: number;
}

const FACTIONS: Faction[] = ['kingdom', 'undead', 'infernal', 'wildborn'];

export function summarizeBattle(status: GameState['status'], events: readonly GameEvent[], mode: BattleMode): BattleSummary {
  const byFaction: Record<Faction, number> = { kingdom: 0, undead: 0, infernal: 0, wildborn: 0 };
  let unitsPlayed = 0;
  let spellsPlayed = 0;
  let damageDealt = 0;
  let rounds = 0;
  for (const event of events) {
    if (event.type === 'ROUND_START') rounds = Math.max(rounds, event.round);
    else if (event.type === 'REVEAL') {
      for (const placement of event.placements) {
        if (placement.side !== 'player' || placement.zone !== 'hero') continue;
        unitsPlayed += 1;
        try {
          const faction = getCard(placement.cardId).faction;
          if (faction in byFaction) byFaction[faction as Faction] += 1;
        } catch {
          // an unknown id can't be attributed to a faction; it still counts as a Unit played
        }
      }
    } else if (event.type === 'SPELL_RESOLVED' && event.side === 'player') spellsPlayed += 1;
    // Continuous Spells never emit SPELL_RESOLVED (legacy: ON_PLAY in a Spell zone; card resolver v4: SPELL_ENTERED).
    else if (((event.type === 'ON_PLAY' && event.zone === 'spell') || event.type === 'SPELL_ENTERED') && event.side === 'player') spellsPlayed += 1;
    else if ((event.type === 'DIRECT_DAMAGE' || event.type === 'OVERFLOW_DAMAGE' || event.type === 'CLASH_DAMAGE') && event.side === 'enemy') damageDealt += Math.max(0, event.amount);
  }
  const result = status === 'PLAYER_WIN' ? 'win' : status === 'DRAW' ? 'draw' : 'loss';
  const summary: BattleSummary = {
    mode, result, rounds, unitsPlayed, spellsPlayed, damageDealt,
    kingdomUnitsPlayed: 0, undeadUnitsPlayed: 0, infernalUnitsPlayed: 0, wildbornUnitsPlayed: 0,
  };
  for (const faction of FACTIONS) summary[`${faction}UnitsPlayed`] = byFaction[faction];
  return summary;
}
