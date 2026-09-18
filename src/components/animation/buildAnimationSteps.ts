import type { GameEvent, LaneId, Side } from '../../game/types';
import type { AnimationStep, TimingCategory, VisualType } from './types';

// Pure GameEvent[] -> AnimationStep[] conversion. No React, no timers, no DOM - fully unit-testable
// on its own (see buildAnimationSteps.test.ts). This is the "grouping" pass described in the rich-
// effects/animation brief: most events map one-to-one with a step, a few event types are folded into
// whichever trigger/on-play caused them (so the player sees "an ability fired, a number changed" as
// one beat, not two), and Combat is expanded into its own short sub-sequence per lane.

/**
 * Event types that are purely numeric/bookkeeping consequences of *something else* - they never get
 * their own top-level step. Grouped into whatever TRIGGER/ON_PLAY immediately precedes them, or into
 * a bare run of themselves when there's no preceding anchor (e.g. Round End's temp-Power cleanup,
 * which isn't wrapped in a TRIGGER at all). Every other event type is a real, board-visible change
 * (a card died, was silenced, shielded, returned, revived, ...) and always gets its own step so it
 * gets a dedicated animation rather than being swallowed.
 */
const SUB_EFFECT_TYPES = new Set<GameEvent['type']>(['POWER_CHANGED', 'HEAL', 'DIRECT_DAMAGE', 'TEMP_POWER_EXPIRED', 'ONCE_PER_ROUND_USED']);

function isSubEffect(type: GameEvent['type']): boolean {
  return SUB_EFFECT_TYPES.has(type);
}

let stepSeq = 0;
function makeStep(visualType: VisualType, timingCategory: TimingCategory, events: GameEvent[], startIndex: number, lane?: LaneId): AnimationStep {
  return {
    id: `astep-${stepSeq++}`,
    visualType,
    timingCategory,
    events,
    maxEventIndex: startIndex + events.length - 1, // only valid when `events` is a contiguous slice of the original array in order; combat steps compute their own max explicitly instead
    lane,
    pauseAfter: PAUSE_AFTER_VISUAL_TYPES.has(visualType),
  };
}

/**
 * The "major beats" a brief breathing gap follows (see timing.ts's `resolvePause`) - a curated set,
 * deliberately small. Everything else (triggers, incidental Power changes, entries, ...) chains
 * straight into the next step with no gap, so the pause reads as emphasis on the moments that matter
 * rather than a uniform drag on every step.
 */
const PAUSE_AFTER_VISUAL_TYPES = new Set<VisualType>(['combat-clash', 'hero-destroyed', 'shield-save', 'overflow-damage', 'direct-damage', 'spell-zone-destroyed', 'revived']);

function categoryFor(visualType: VisualType): TimingCategory {
  switch (visualType) {
    // The big, strategically-significant moments get the most screen time - a destroyed Hero, a
    // shield save, and overflow damage in particular ("do not let it disappear too quickly").
    case 'hero-destroyed':
    case 'shield-save':
    case 'overflow-damage':
    case 'revived':
    case 'match-end':
      return 'major';
    // The clash itself, an unopposed hit, and a Spell actually being destroyed all carry real weight.
    case 'combat-clash':
    case 'direct-damage':
    case 'spell-zone-destroyed':
      return 'combat';
    case 'reveal':
    case 'continuous-spell-enter':
    case 'trigger-pulse':
    case 'heal':
    case 'silenced':
    case 'immunity-blocked':
    case 'shield-granted':
    case 'spell-resolve-fade':
    case 'returned-to-hand':
    case 'exiled':
      return 'short';
    default:
      return 'micro';
  }
}

function groupVisualType(group: GameEvent[]): VisualType {
  if (group.some((e) => e.type === 'TRIGGER')) return 'trigger-pulse';
  const first = group[0];
  if (first.type === 'ON_PLAY') return first.zone === 'spell' ? 'continuous-spell-enter' : 'hero-enter';
  if (group.some((e) => e.type === 'HEAL')) return 'heal';
  if (group.some((e) => e.type === 'DIRECT_DAMAGE')) return 'direct-damage';
  return 'power-change'; // POWER_CHANGED / TEMP_POWER_EXPIRED / ONCE_PER_ROUND_USED only
}

/** Every top-level event type that isn't handled by a dedicated `case` below falls back to this - a plain, safe, readable highlight. Covers SAFEGUARD_TRIPPED and anything genuinely new. */
function fallbackVisualType(): VisualType {
  return 'generic';
}

export function buildAnimationSteps(events: GameEvent[]): AnimationStep[] {
  const steps: AnimationStep[] = [];
  const consumed = new Set<number>();

  const findNext = (fromIndex: number, pred: (e: GameEvent) => boolean): number => {
    for (let j = fromIndex + 1; j < events.length; j++) {
      if (consumed.has(j)) continue;
      if (pred(events[j])) return j;
    }
    return -1;
  };

  /**
   * Combat's constituent events are NOT adjacent in the raw log - all three lanes' COMBAT +
   * OVERFLOW_DAMAGE/DIRECT_DAMAGE events are pushed first, then a separate later phase destroys every
   * lane's loser (see resolveRound.ts step 6/9). To play "clash -> loser dies -> damage lands" per
   * lane, as the brief asks for, this pulls the later HERO_DESTROYED/SHIELD_CONSUMED forward into the
   * same lane's mini-sequence - a deliberate PRESENTATION reorder, never a state reorder (see
   * useAnimationController's commit model for how displayState stays valid regardless).
   */
  function buildCombatSteps(combatIndex: number): AnimationStep[] {
    const combat = events[combatIndex] as Extract<GameEvent, { type: 'COMBAT' }>;
    const out: AnimationStep[] = [];
    const clash = makeStep('combat-clash', categoryFor('combat-clash'), [combat], combatIndex, combat.lane);
    clash.maxEventIndex = combatIndex;
    out.push(clash);

    if (combat.outcome === 'EMPTY') return out;

    if (combat.outcome === 'PLAYER_DIRECT' || combat.outcome === 'ENEMY_DIRECT') {
      const ddIdx = findNext(combatIndex, (e) => e.type === 'DIRECT_DAMAGE');
      if (ddIdx >= 0) {
        consumed.add(ddIdx);
        const dd = events[ddIdx];
        const step = makeStep('direct-damage', categoryFor('direct-damage'), [dd], ddIdx, combat.lane);
        step.maxEventIndex = ddIdx;
        out.push(step);
        // A trailing ON_DIRECT_DAMAGE reaction (e.g. Flame Imp's extra point) lands immediately after.
        let j = ddIdx + 1;
        const trail: GameEvent[] = [];
        while (j < events.length && !consumed.has(j) && (events[j].type === 'TRIGGER' || isSubEffect(events[j].type))) {
          trail.push(events[j]);
          consumed.add(j);
          j++;
        }
        if (trail.length > 0) {
          const trailStep = makeStep(groupVisualType(trail), categoryFor(groupVisualType(trail)), trail, ddIdx + 1, combat.lane);
          trailStep.maxEventIndex = ddIdx + trail.length;
          out.push(trailStep);
        }
      }
      return out;
    }

    // PLAYER_WINS / ENEMY_WINS / TIE
    const loserSides: Side[] = combat.outcome === 'TIE' ? ['player', 'enemy'] : [combat.outcome === 'PLAYER_WINS' ? 'enemy' : 'player'];
    for (const side of loserSides) {
      const dieIdx = findNext(combatIndex, (e) => (e.type === 'HERO_DESTROYED' || e.type === 'SHIELD_CONSUMED') && e.side === side && e.lane === combat.lane);
      if (dieIdx < 0) continue;
      consumed.add(dieIdx);
      const de = events[dieIdx];
      const step = makeStep(de.type === 'SHIELD_CONSUMED' ? 'shield-save' : 'hero-destroyed', categoryFor('hero-destroyed'), [de], dieIdx, combat.lane);
      step.maxEventIndex = dieIdx;
      out.push(step);
    }

    if (combat.outcome !== 'TIE') {
      const ovIdx = findNext(combatIndex, (e) => e.type === 'OVERFLOW_DAMAGE' && e.lane === combat.lane);
      if (ovIdx >= 0) {
        consumed.add(ovIdx);
        const step = makeStep('overflow-damage', categoryFor('overflow-damage'), [events[ovIdx]], ovIdx, combat.lane);
        step.maxEventIndex = ovIdx;
        out.push(step);
      }
    }

    return out;
  }

  for (let i = 0; i < events.length; i++) {
    if (consumed.has(i)) continue;
    const e = events[i];
    consumed.add(i);

    if (e.type === 'COMBAT') {
      steps.push(...buildCombatSteps(i));
      continue;
    }

    if (e.type === 'TRIGGER' || e.type === 'ON_PLAY' || isSubEffect(e.type)) {
      const group: GameEvent[] = [e];
      let j = i + 1;
      while (j < events.length && !consumed.has(j) && isSubEffect(events[j].type)) {
        group.push(events[j]);
        consumed.add(j);
        j++;
      }
      const vt = groupVisualType(group);
      steps.push(makeStep(vt, categoryFor(vt), group, i, laneOf(group)));
      continue;
    }

    const vt = visualTypeForSingle(e);
    steps.push(makeStep(vt, categoryFor(vt), [e], i, laneOf([e])));
  }

  return steps;
}

function laneOf(events: GameEvent[]): LaneId | undefined {
  for (const e of events) {
    if ('lane' in e && e.lane) return e.lane;
  }
  return undefined;
}

function visualTypeForSingle(e: GameEvent): VisualType {
  switch (e.type) {
    case 'REVEAL':
      return 'reveal';
    case 'SPELL_RESOLVED':
      return 'spell-resolve-fade';
    case 'SPELL_ZONE_DESTROYED':
      return 'spell-zone-destroyed';
    case 'HERO_DESTROYED':
      return 'hero-destroyed';
    case 'SHIELD_GRANTED':
      return 'shield-granted';
    case 'SHIELD_CONSUMED':
      return 'shield-save';
    case 'IMMUNITY_BLOCKED':
      return 'immunity-blocked';
    case 'SILENCED':
      return 'silenced';
    case 'RETURNED_TO_HAND':
      return 'returned-to-hand';
    case 'RETURNED_TO_DECK':
      return 'returned-to-deck';
    case 'REVIVED':
      return 'revived';
    case 'EXILED':
      return 'exiled';
    case 'ROUND_END':
      return 'round-end';
    case 'MATCH_END':
      return 'match-end';
    default:
      return fallbackVisualType();
  }
}
