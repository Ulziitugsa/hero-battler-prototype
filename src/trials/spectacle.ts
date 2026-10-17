import type { GameEvent, GameState, LaneId, Side } from '../game/types';
import { LANES, adjacentLanes } from '../game/types';
import { CONDUIT_LABEL, getCombatCard, type CombatAction } from '../game/cardCombat/cards';
import { cardAtk } from '../game/cardCombat/engine';

// Arcane Trials: the signature visual treatments (Part E), read from one round's resolver events. Every cue points at the
// event index that causes it, so the layer shows it only once playback reaches that event, and every number it shows is a
// number from the events. Cues are chosen by the rule that produced them (Undying, Ally Returns growth, Conduit, scaling
// destruction, multiplication, exile, immunity), read from the card's own abilities, never by a card's name.

export type CueKind = 'rise' | 'endless' | 'conduit' | 'chain' | 'strike' | 'double' | 'tier' | 'immune' | 'unmade';

export interface SpectacleCue {
  key: string;
  kind: CueKind;
  /** The event index that triggers it. */
  at: number;
  side: Side;
  /** The lane it is anchored to (a Unit's lane, or a Spell's). */
  lane: LaneId;
  /** Lanes a spread or strike reaches (Conduit). */
  lanes?: LaneId[];
  /** Big text: "RISES", "×2", "UNBROKEN". */
  title: string;
  /** The number to show large, if any (ATK reached). */
  value?: number;
  /** One short line under it. */
  detail: string;
  /** Higher shows first when several land at once. */
  weight: number;
}

/** ATK thresholds for the multiplication tiers. */
export const POWER_TIERS: readonly { atk: number; name: string }[] = [
  { atk: 500, name: 'Ascendant' },
  { atk: 1000, name: 'Unbroken' },
  { atk: 5000, name: 'Godlike' },
  { atk: 9999, name: 'Limitless' },
];

const has = (cardId: string, test: (a: CombatAction) => boolean) => getCombatCard(cardId).abilities.some((ab) => ab.actions.some(test));
const undying = (cardId: string) => getCombatCard(cardId).abilities.flatMap((ab) => ab.actions).find((a) => a.type === 'UNDYING') as Extract<CombatAction, { type: 'UNDYING' }> | undefined;

/** "1,040": readable large numbers. */
export const formatAtk = (n: number) => n.toLocaleString('en-US');

export function spectacleCues(events: readonly GameEvent[], base: GameState | null): SpectacleCue[] {
  const where = new Map<string, { side: Side; lane: LaneId; cardId: string }>();
  if (base) for (const side of ['player', 'enemy'] as const) for (const lane of LANES) {
    const u = base[side].heroZones[lane];
    if (u) where.set(u.instanceId, { side, lane, cardId: u.cardId });
  }
  const cues: SpectacleCue[] = [];
  const chain: Record<Side, string[]> = { player: [], enemy: [] };
  const chainSteps: { side: Side; at: number; lane: LaneId; name: string; position: number; threshold?: number; spread: boolean }[] = [];
  // The Spell whose effects are resolving now, with the Conduit that spread it, if any.
  let casting: { side: Side; name: string; at: number; conduit: boolean; struck: LaneId[]; firstStrike: number } | null = null;
  let conduitAt = -1;
  let allyReturnSource: string | null = null;

  events.forEach((e, i) => {
    switch (e.type) {
      case 'REVEAL':
        for (const p of e.placements) if (p.zone === 'hero') where.set(p.instanceId, { side: p.side, lane: p.lane, cardId: p.cardId });
        return;
      case 'TOKEN_SUMMONED':
        where.set(e.instanceId, { side: e.side, lane: e.lane, cardId: e.cardId });
        return;
      case 'TRIGGER':
        if (e.trigger === 'PASSIVE' && e.label === CONDUIT_LABEL) conduitAt = i;
        allyReturnSource = e.trigger === 'ON_ALLY_RETURN' ? e.sourceName : null;
        if (e.trigger === 'CAST') {
          const spreading = conduitAt === i - 1;
          casting = { side: e.side, name: e.sourceName, at: i, conduit: spreading, struck: [], firstStrike: -1 };
        }
        return;
      case 'REVIVED': {
        where.set(e.instanceId, { side: e.side, lane: e.lane, cardId: e.cardId });
        const rule = undying(e.cardId);
        if (rule) {
          const count = Math.round((e.power - cardAtk(e.cardId)) / rule.atkPerReturn);
          cues.push({ key: `rise-${i}`, kind: 'rise', at: i, side: e.side, lane: e.lane, title: 'Rises', value: e.power, detail: `${e.name} · ${count} of ${rule.returns}`, weight: 3 });
        }
        return;
      }
      case 'POWER_CHANGED': {
        const at = where.get(e.instanceId);
        if (!at || !e.permanent || e.to <= e.from) return;
        if (allyReturnSource && has(at.cardId, (a) => a.type === 'EMPOWER') && e.name === allyReturnSource) {
          cues.push({ key: `endless-${i}`, kind: 'endless', at: i, side: at.side, lane: at.lane, title: 'Endless', value: e.to, detail: `+${formatAtk(e.to - e.from)} as an ally returns`, weight: 2 });
        }
        if (has(at.cardId, (a) => a.type === 'MULTIPLY_ATK') && e.reason === e.name) {
          const factor = Math.round(e.to / Math.max(1, e.from));
          cues.push({ key: `double-${i}`, kind: 'double', at: i, side: at.side, lane: at.lane, title: `×${factor}`, value: e.to, detail: `${formatAtk(e.from)} → ${formatAtk(e.to)} ATK`, weight: 3 });
          const tier = [...POWER_TIERS].reverse().find((t) => e.to >= t.atk && e.from < t.atk);
          if (tier) cues.push({ key: `tier-${i}`, kind: 'tier', at: i, side: at.side, lane: at.lane, title: tier.name, value: e.to, detail: `${e.name} passes ${formatAtk(tier.atk)} ATK`, weight: 5 });
        }
        return;
      }
      case 'HERO_DESTROYED':
      case 'SHIELD_CONSUMED':
        if (e.type === 'HERO_DESTROYED' && e.exiled) {
          cues.push({ key: `unmade-${i}`, kind: 'unmade', at: i, side: e.side, lane: e.lane, title: 'Unmade', detail: `${e.name} is exiled: no Shield, no return`, weight: 4 });
          return;
        }
        if (casting && casting.side !== e.side && !casting.struck.includes(e.lane)) {
          casting.struck.push(e.lane);
          if (casting.firstStrike < 0) casting.firstStrike = i;
        }
        return;
      case 'IMMUNITY_BLOCKED': {
        const unit = base?.[e.side].heroZones[e.lane];
        if (unit && has(unit.cardId, (a) => a.type === 'MULTIPLY_ATK')) cues.push({ key: `immune-${i}`, kind: 'immune', at: i, side: e.side, lane: e.lane, title: 'Immune', detail: `${e.sourceName} can’t touch ${unit.shortName}`, weight: 4 });
        return;
      }
      case 'SPELL_RESOLVED': {
        const c = casting as { side: Side; name: string; at: number; conduit: boolean; struck: LaneId[]; firstStrike: number } | null;
        casting = null;
        const at = c && c.side === e.side ? c.at : i;
        const scaling = has(e.cardId, (a) => a.type === 'DESTROY_SCALING');
        const position = chain[e.side].length + 1;
        let threshold: number | undefined;
        if (scaling) {
          const rule = getCombatCard(e.cardId).abilities.flatMap((ab) => ab.actions).find((a) => a.type === 'DESTROY_SCALING') as Extract<CombatAction, { type: 'DESTROY_SCALING' }>;
          threshold = rule.baseAtk + rule.atkPerSpell * (position - 1);
        }
        chain[e.side].push(e.name);
        chainSteps.push({ side: e.side, at, lane: e.lane, name: e.name, position, threshold, spread: !!c?.conduit });
        if (!c || c.side !== e.side) return;
        const foe: Side = e.side === 'player' ? 'enemy' : 'player';
        if (c.conduit) cues.push({ key: `conduit-${i}`, kind: 'conduit', at: c.at, side: foe, lane: e.lane, lanes: [e.lane, ...adjacentLanes(e.lane)], title: 'Conduit', detail: `${e.name} reaches the lanes next to it`, weight: 2 });
        if (scaling && c.struck.length > 0)
          cues.push({ key: `strike-${i}`, kind: 'strike', at: c.firstStrike, side: foe, lane: e.lane, lanes: c.struck, title: c.struck.length > 1 ? `${e.name} ×${c.struck.length}` : e.name, detail: c.struck.length > 1 ? `${c.struck.length} lanes struck in one resolution` : 'One lane struck', weight: 4 + c.struck.length });
        return;
      }
      default:
        return;
    }
  });
  // The Spell chain: shown for a side only in a round where its Spells spread (Conduit) or one of them scales with the
  // Spells before it, so ordinary Spell rounds stay quiet.
  for (const side of ['player', 'enemy'] as const) {
    const steps = chainSteps.filter((s) => s.side === side);
    if (!steps.some((s) => s.spread || s.threshold !== undefined)) continue;
    for (const s of steps)
      cues.push({ key: `chain-${side}-${s.at}`, kind: 'chain', at: s.at, side, lane: s.lane, title: `Spell ${s.position}`, ...(s.threshold !== undefined ? { value: s.threshold } : {}), detail: s.threshold !== undefined ? `${s.name}: destroys ${formatAtk(s.threshold)} ATK or less` : s.name, weight: 1 });
  }
  return cues.sort((a, b) => a.at - b.at || b.weight - a.weight);
}

/** Every step of each side's Spell chain this round, in order (the chain strip reads it). */
export function chainOf(cues: readonly SpectacleCue[], side: Side): SpectacleCue[] {
  return cues.filter((c) => c.kind === 'chain' && c.side === side);
}
