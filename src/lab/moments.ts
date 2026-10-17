import type { GameEvent, GameState, LaneId, Side } from '../game/types';
import { LANES } from '../game/types';
import { battleLogEntries, type BattleLogEntry } from '../components/battleInfo/battleLog';
import { DEATH_LINE_ATK } from '../game/cardCombat/stats';
import { getCard } from '../game/cards';

// Card Discovery Lab: the "key moments" of a round, read from the resolver's own event log. Nothing here decides or
// changes anything; every moment points at the events it describes (`until`), so the lab shows it only once playback
// has reached them, and a test replays real rounds to check each claim against those events.
//
// Effects are grouped the way the battle log groups them (components/battleInfo/battleLog.ts): an effect's TRIGGER
// announcement and everything it caused, up to the next announcement or step of the round. The log's entries carry
// the card that acted and the event range, so the lab reuses them rather than grouping events a second way.

export type MomentKind =
  | 'chain'
  | 'echo'
  | 'removal'
  | 'sacrifice'
  | 'deathLine'
  | 'revive'
  | 'turned'
  | 'immune'
  | 'bypass'
  | 'token'
  | 'shield'
  | 'prevented'
  | 'burst'
  | 'swing'
  | 'returned';

export interface LabMoment {
  key: string;
  /** Index of the last event the moment describes. */
  until: number;
  kind: MomentKind;
  /** Whose card did it. */
  side: Side;
  /** The card responsible, by the name the board shows. */
  source: string;
  /** A few words: "Spell repeated". */
  title: string;
  /** What happened, from the events: "Arcane Bolt resolves twice". */
  detail: string;
  /** Round the moment happened in. */
  round: number;
  /** Rank for "biggest moments" lists. */
  weight: number;
}

const WEIGHT: Record<MomentKind, number> = {
  chain: 100,
  echo: 90,
  removal: 80,
  deathLine: 80,
  sacrifice: 75,
  revive: 70,
  turned: 60,
  immune: 50,
  bypass: 50,
  token: 45,
  shield: 45,
  prevented: 45,
  burst: 40,
  swing: 40,
  returned: 30,
};

/** An ATK change at least this big from one effect reads as a major swing (Power Surge, Weakness, Fireball). */
export const SWING_ATK = 45;
/** Effect damage at least this big from one effect reads as a burst (Arcane Bolt, Pit Fiend, Vael). */
export const BURST_DAMAGE = 90;
/** Effects of one side in one round that can read as a combination (see the Combinations step). */
export const CHAIN_EFFECTS = 3;
/** Triggers that answer another card: a Spell cast, a death, a direct hit, Vael's echo. */
const REACTIONS = new Set<string>(['ON_ALLY_SPELL_PLAYED', 'ON_ENEMY_SPELL_PLAYED', 'ON_ALLY_DEATH', 'ON_ENEMY_DEATH', 'ON_DEATH', 'ON_DIRECT_DAMAGE', 'PASSIVE']);

const opposite = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');
const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
const startOf = (entry: BattleLogEntry) => Number.parseInt(entry.key, 10);

interface Tracked {
  name: string;
  /** Stored ATK (what POWER_CHANGED reports). */
  atk: number;
  side: Side;
  lane: LaneId;
  /** The last card whose effect lowered it ("Round End" expiries skipped). */
  loweredBy?: string;
}

/**
 * The key moments of `events` (one round's reveal, or a whole match's log). `base` is the board before the first event;
 * without it, Units already in play when the events start are learned from the events as they appear.
 */
export function labMoments(events: readonly GameEvent[], base?: GameState | null): LabMoment[] {
  const list = [...events];
  const entries = battleLogEntries(list, base ?? undefined);
  const moments: LabMoment[] = [];
  let round = base?.round ?? 1;
  const roundAt: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const ev = list[i];
    if (ev.type === 'ROUND_START') round = ev.round;
    roundAt[i] = round;
  }
  const add = (m: Omit<LabMoment, 'weight' | 'round' | 'key'> & { at: number; weight?: number }) => {
    const { at, weight, ...rest } = m;
    moments.push({ ...rest, key: `${rest.kind}:${at}:${moments.length}`, round: roundAt[at] ?? round, weight: weight ?? WEIGHT[rest.kind] });
  };

  // --- Effects: one log entry is one card's effect and the events it caused. ---
  const inEffect = new Set<number>();
  const effectEntries = entries.filter((e) => e.kind === 'effect' && e.label !== 'Expired' && e.label !== 'Attached' && e.label !== 'Shield' && e.side !== null);
  for (const entry of effectEntries) {
    const start = startOf(entry);
    const side = entry.side as Side;
    for (let i = start; i <= entry.until; i++) inEffect.add(i);
    const slice = list.slice(start, entry.until + 1);
    const at = entry.until;
    if (entry.text.endsWith(' resolves twice')) {
      add({ kind: 'echo', side, source: entry.who, title: 'Spell repeated', detail: entry.text, until: at, at });
      continue;
    }
    let damage = 0;
    const atk = new Map<string, { name: string; delta: number; temp: boolean }>();
    for (const ev of slice) {
      switch (ev.type) {
        case 'REVIVED':
          add({ kind: 'revive', side, source: entry.who, title: 'Revived', detail: ev.name === entry.who ? `${ev.name} came back with ${ev.power} ATK` : `${entry.who} revived ${ev.name} (${ev.power} ATK)`, until: at, at });
          break;
        case 'HERO_DESTROYED':
          if (ev.side === side) add({ kind: 'sacrifice', side, source: entry.who, title: 'Sacrificed', detail: `${entry.who} destroyed its own ${ev.name}`, until: at, at });
          else add({ kind: 'removal', side, source: entry.who, title: 'Destroyed by an effect', detail: `${entry.who} destroyed ${ev.name}`, until: at, at });
          break;
        case 'TOKEN_SUMMONED':
          add({ kind: 'token', side, source: entry.who, title: 'Token summoned', detail: `${entry.who} summoned a ${ev.name} (${ev.power} ATK)`, until: at, at });
          break;
        case 'IMMUNITY_BLOCKED':
          add({ kind: 'immune', side: ev.side, source: entry.who, title: 'Immune', detail: `${entry.who} had no effect: its target is ${ev.immunity === 'SPELL' ? 'immune to Spells' : 'immune to Unit effects'}`, until: at, at });
          break;
        case 'DAMAGE_PREVENTED':
          add({ kind: 'prevented', side: ev.side, source: entry.who, title: 'Damage prevented', detail: `${ev.amount} damage from ${entry.who} was prevented`, until: at, at });
          break;
        case 'SHIELD_CONSUMED':
          add({ kind: 'shield', side: ev.side, source: ev.name, title: 'Shield', detail: `${ev.name}’s Shield saved it from ${entry.who}`, until: at, at });
          break;
        case 'RETURNED_TO_HAND':
          add({ kind: 'returned', side, source: entry.who, title: 'Back to hand', detail: ev.name === entry.who ? `${ev.name} returned to its owner’s hand` : `${entry.who} returned ${ev.name} to hand`, until: at, at });
          break;
        case 'DIRECT_DAMAGE':
          damage += ev.amount;
          break;
        case 'POWER_CHANGED': {
          if (ev.reason === 'Round End') break;
          const key = `${ev.instanceId}|${ev.permanent}`;
          const unit = atk.get(key) ?? { name: ev.name, delta: 0, temp: !ev.permanent };
          unit.delta += ev.to - ev.from;
          atk.set(key, unit);
          break;
        }
        default:
          break;
      }
    }
    if (damage >= BURST_DAMAGE) add({ kind: 'burst', side, source: entry.who, title: 'Big damage', detail: `${entry.who} dealt ${damage} damage`, until: at, at, weight: WEIGHT.burst + Math.round(damage / 15) });
    for (const unit of atk.values()) {
      if (Math.abs(unit.delta) < SWING_ATK) continue;
      add({ kind: 'swing', side, source: entry.who, title: unit.delta > 0 ? 'Major ATK boost' : 'Major ATK loss', detail: `${unit.name === entry.who ? entry.who : `${entry.who}: ${unit.name}`} ${signed(unit.delta)} ATK${unit.temp ? ' this round' : ' until the battle ends'}`, until: at, at });
    }
  }

  // A Shield that saved a clash loser has its own log entry.
  for (const entry of entries) {
    if (entry.kind === 'effect' && entry.label === 'Shield' && entry.side) {
      add({ kind: 'shield', side: entry.side, source: entry.who, title: 'Shield', detail: `${entry.who} lost the clash but its Shield saved it`, until: entry.until, at: entry.until });
    }
  }

  // --- The board as the events run: clashes turned by effects, bypasses, and Units destroyed below the death line. ---
  const board = new Map<string, Tracked>(); // instanceId -> unit
  const lanes = new Map<string, string>(); // side:lane -> instanceId
  const baseline = new Map<string, number>(); // instanceId -> ATK before this round's effects
  const place = (instanceId: string, t: Tracked) => {
    board.set(instanceId, t);
    lanes.set(`${t.side}:${t.lane}`, instanceId);
    baseline.set(instanceId, t.atk);
  };
  if (base) {
    for (const side of ['player', 'enemy'] as const) {
      for (const lane of LANES) {
        const unit = base[side].heroZones[lane];
        if (unit) place(unit.instanceId, { name: unit.name, atk: unit.power, side, lane });
      }
    }
  }
  const clashLosers = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const ev = list[i];
    switch (ev.type) {
      case 'ROUND_START':
        clashLosers.clear();
        break;
      case 'REVEAL':
        for (const p of ev.placements) if (p.zone === 'hero') place(p.instanceId, { name: nameOf(p.cardId), atk: p.power ?? 0, side: p.side, lane: p.lane });
        // Everything in play now starts the round at its stored ATK: this round's effects are measured from here.
        for (const [id, unit] of board) baseline.set(id, unit.atk);
        break;
      case 'REVIVED':
      case 'TOKEN_SUMMONED':
        place(ev.instanceId, { name: ev.name, atk: ev.power, side: ev.side, lane: ev.lane });
        break;
      case 'POWER_CHANGED': {
        const unit = board.get(ev.instanceId);
        if (!unit) break;
        unit.atk = ev.to;
        if (ev.to < ev.from && ev.reason !== 'Round End') unit.loweredBy = ev.reason;
        break;
      }
      case 'CLASH_DAMAGE':
        for (const d of ev.destroyed ?? []) clashLosers.add(d.instanceId);
        break;
      case 'COMBAT': {
        const p = ev.player;
        const e = ev.enemy;
        if (ev.bypass) {
          const attacker: Side = ev.outcome === 'PLAYER_DIRECT' ? 'player' : 'enemy';
          const unit = attacker === 'player' ? p : e;
          const blocker = attacker === 'player' ? e : p;
          const hit = list[i + 1];
          const amount = hit?.type === 'DIRECT_DAMAGE' ? `${hit.amount} damage` : hit?.type === 'DAMAGE_PREVENTED' ? 'its damage was prevented' : 'no damage';
          add({ kind: 'bypass', side: attacker, source: unit?.name ?? 'Unit', title: 'Bypass', detail: `${unit?.name} went past ${blocker?.name ?? 'its blocker'} and hit the player: ${amount}`, until: hit?.type === 'DIRECT_DAMAGE' || hit?.type === 'DAMAGE_PREVENTED' ? i + 1 : i, at: i });
          break;
        }
        if (!p || !e || !(ev.outcome === 'PLAYER_WINS' || ev.outcome === 'ENEMY_WINS' || ev.outcome === 'TIE')) break;
        const pId = lanes.get(`player:${ev.lane}`);
        const eId = lanes.get(`enemy:${ev.lane}`);
        const pBase = pId !== undefined ? baseline.get(pId) : undefined;
        const eBase = eId !== undefined ? baseline.get(eId) : undefined;
        if (pBase === undefined || eBase === undefined) break;
        if (Math.sign(pBase - eBase) === Math.sign(p.power - e.power)) break;
        const winner: Side = ev.outcome === 'ENEMY_WINS' ? 'enemy' : 'player';
        const result = ev.outcome === 'TIE' ? 'tied' : `${winner === 'player' ? p.name : e.name} won`;
        add({ kind: 'turned', side: winner, source: winner === 'player' ? p.name : e.name, title: 'Effects turned the clash', detail: `${laneName(ev.lane)}: ${p.name} ${pBase}→${p.power} vs ${e.name} ${eBase}→${e.power}. ${result}; on starting ATK the result was the other way`, until: i, at: i });
        break;
      }
      case 'HERO_DESTROYED': {
        const unit = board.get(ev.instanceId);
        board.delete(ev.instanceId);
        if (lanes.get(`${ev.side}:${ev.lane}`) === ev.instanceId) lanes.delete(`${ev.side}:${ev.lane}`);
        if (!unit || clashLosers.has(ev.instanceId) || inEffect.has(i)) break;
        if (unit.atk <= DEATH_LINE_ATK) {
          const by = unit.loweredBy;
          add({ kind: 'deathLine', side: opposite(ev.side), source: by ?? ev.name, title: 'Destroyed by ATK loss', detail: `${ev.name} fell to ${unit.atk} ATK${by ? ` after ${by}` : ''} and was destroyed: a Unit at ${DEATH_LINE_ATK} ATK or less is destroyed`, until: i, at: i });
        }
        break;
      }
      default:
        break;
    }
  }

  // --- Combinations: one side's cards setting each other off in the same round. Three or more effects from at least two
  // cards, and either a reaction among them (a card answering a Spell, a death, a direct hit, Vael's echo) or three
  // different cards. ---
  const byRound = new Map<string, BattleLogEntry[]>();
  for (const entry of effectEntries) {
    // Only effects that fired (an always-on Spell's "Passive" line describes, it doesn't happen).
    if (entry.text === 'No effect' || list[startOf(entry)]?.type !== 'TRIGGER') continue;
    const k = `${roundAt[startOf(entry)] ?? round}|${entry.side}`;
    byRound.set(k, [...(byRound.get(k) ?? []), entry]);
  }
  for (const [k, group] of byRound) {
    const distinct = new Set(group.map((e) => e.who));
    const reaction = group.some((e) => {
      const ev = list[startOf(e)];
      return ev?.type === 'TRIGGER' && REACTIONS.has(ev.trigger);
    });
    if (group.length < CHAIN_EFFECTS || distinct.size < 2 || (!reaction && distinct.size < CHAIN_EFFECTS)) continue;
    // The sequence as it happened, repeats folded: "Archmage Vael → Arcane Bolt ×3 → Archmage Vael".
    const names: { name: string; n: number }[] = [];
    for (const entry of group) {
      const prev = names[names.length - 1];
      if (prev?.name === entry.who) prev.n += 1;
      else names.push({ name: entry.who, n: 1 });
    }
    const side = k.split('|')[1] as Side;
    let damage = 0;
    let destroyed = 0;
    for (const entry of group) {
      for (const ev of list.slice(startOf(entry), entry.until + 1)) {
        if (ev.type === 'DIRECT_DAMAGE' && ev.side !== side) damage += ev.amount;
        if (ev.type === 'HERO_DESTROYED' && ev.side !== side) destroyed += 1;
      }
    }
    const totals = [damage > 0 ? `${damage} effect damage` : '', destroyed > 0 ? `${destroyed} Unit${destroyed > 1 ? 's' : ''} destroyed` : ''].filter(Boolean).join(', ');
    const last = group[group.length - 1];
    const sequence = names.map((x) => (x.n > 1 ? `${x.name} ×${x.n}` : x.name)).join(' → ');
    add({ kind: 'chain', side, source: names[0].name, title: `${group.length} effects in one round`, detail: `${sequence}${totals ? ` (${totals})` : ''}`, until: last.until, at: last.until, weight: WEIGHT.chain + group.length });
  }

  return moments.sort((a, b) => a.until - b.until || b.weight - a.weight);
}

const LANE_NAMES: Record<LaneId, string> = { left: 'Left', center: 'Center', right: 'Right' };
const laneName = (lane: LaneId) => LANE_NAMES[lane];

function nameOf(cardId: string): string {
  try {
    return getCard(cardId).name;
  } catch {
    return cardId;
  }
}

/** The biggest moments of a match, most important first. */
export function topMoments(moments: readonly LabMoment[], limit: number): LabMoment[] {
  return [...moments].sort((a, b) => b.weight - a.weight || a.until - b.until).slice(0, limit);
}
