import type { GameEvent, GameState, LaneId, Side, Trigger } from '../../game/types';
import { LANES, TRIGGER_LABEL } from '../../game/types';
import { ALL_CARDS } from '../../game/cards';
import { getCombatCard } from '../../game/cardCombat/cards';
import { BATTLE_CHIP_LABEL, cardCombatBattleEffects } from '../../game/cardCombat/cardText';

/**
 * Card combat's battle log (Info layers pass, layer 3): what each effect and each clash actually did, one short line
 * each, built from the round's own event log. "Royal Guard — On Play: Battle Captain and Light Priest +15 ATK",
 * "Clash Damage — Center: 35 to Enemy (Royal Guard 128 beat Bone Soldier 93)". It explains a resolution after the
 * fact; it never decides anything, and it reads the same events replay and animation do.
 */

export interface BattleLogEntry {
  /** Stable key: the index of the event the entry starts at. */
  key: string;
  /** Index of the last event the entry describes. The live log shows an entry once playback has reached it. */
  until: number;
  kind: 'round' | 'effect' | 'clash';
  /** Whose card acted (for a clash, the winner's side); null for a round marker or a tie. */
  side: Side | null;
  /** The card that acted, or "Clash Damage" / "Tie" for a clash. */
  who: string;
  /** The timing or keyword label ("On Play", "Guard 2", "Direct Hit"), or the lane for a clash. */
  label?: string;
  /** What happened, in a few words. */
  text: string;
}

const CARD_ID_BY_NAME = new Map(ALL_CARDS.map((card) => [card.name, card.id]));
const LANE_NAME: Record<LaneId, string> = { left: 'Left', center: 'Center', right: 'Right' };
/** The two players as the battle screen names them (SideHeader). */
const SIDE_NAME: Record<Side, string> = { player: 'You', enemy: 'Enemy' };

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
const NO_EFFECT = 'No effect';
/** "Hellhound", "Hellhound and Pit Fiend", "Pit Fiend, Mira and two Hellhounds". */
function listNames(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const items = [...counts].map(([name, n]) => (n === 1 ? name : `${n === 2 ? 'two' : n} ${name.endsWith('s') ? `${name}es` : `${name}s`}`));
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The label a triggered card shows in the log: the same label its card face uses for that trigger ("Guard 2" for a
 * Guard, "Your 2nd Spell"). A card whose effects on that trigger have different labels (Dark Priest's Guard 2 and its
 * Clash line) gets the rules' own timing name instead ("Before Combat"): the log can't tell which of them fired.
 */
function triggerLabel(source: string, trigger: Trigger): string {
  const id = CARD_ID_BY_NAME.get(source);
  if (!id) return BATTLE_CHIP_LABEL[trigger];
  const card = getCombatCard(id);
  if (card.type === 'spell' && card.spellKind !== 'CONTINUOUS' && trigger === 'ON_PLAY') return 'Spell';
  const chips = new Set(
    cardCombatBattleEffects(id)
      .filter((e) => e.trigger === trigger)
      .map((e) => e.chip),
  );
  return chips.size === 1 ? [...chips][0] : chips.size > 1 ? TRIGGER_LABEL[trigger] : BATTLE_CHIP_LABEL[trigger];
}

/**
 * Labels are the card's own (written from its owner's side, as on the card). In an enemy card's row, the two that
 * say whose Spell it was are turned round, so "Your Spell" never describes the opponent's cast.
 */
const ENEMY_ROW_LABEL: Record<string, string> = { 'Your Spell': 'Their Spell', 'Your 2nd Spell': 'Their 2nd Spell', 'Enemy Spell': 'Your Spell', 'Enemy’s 2nd Spell': 'Your 2nd Spell' };
const rowLabel = (label: string, side: Side) => (side === 'enemy' ? (ENEMY_ROW_LABEL[label] ?? label) : label);

/** A card whose effects can stop its player's next damage (Aegis Ward), so a prevented hit can name it. */
function preventsDamage(source: string): boolean {
  const id = CARD_ID_BY_NAME.get(source);
  return !!id && getCombatCard(id).abilities.some((a) => a.actions.some((action) => action.type === 'PREVENT_NEXT_DAMAGE' || action.type === 'CLASH_SHIELD'));
}

/**
 * What a triggered card did that logs no event of its own: Aegis Ward's barrier. Only an effect with no condition
 * counts, since the log can't tell whether a conditional one fired.
 */
function silentEffects(source: string, trigger: Trigger, side: Side): string[] {
  const id = CARD_ID_BY_NAME.get(source);
  if (!id) return [];
  return getCombatCard(id)
    .abilities.filter((a) => a.trigger === trigger && !a.conditions?.length)
    .flatMap((a) => a.actions)
    .filter((action) => action.type === 'PREVENT_NEXT_DAMAGE')
    .map(() => `next damage to ${SIDE_NAME[side]} this round is prevented`);
}

/** A one-time Spell: its rows stay in the log even when it did nothing (a Spell that fizzled is worth knowing). */
function isOneTimeSpell(source: string): boolean {
  const id = CARD_ID_BY_NAME.get(source);
  if (!id) return false;
  const card = getCombatCard(id);
  return card.type === 'spell' && card.spellKind !== 'CONTINUOUS';
}

/** Events that close an effect's group: the next announcement, a clash, or a step of the round. */
const GROUP_END = new Set<GameEvent['type']>(['TRIGGER', 'ON_PLAY', 'COMBAT', 'CLASH_DAMAGE', 'REVEAL', 'ROUND_START', 'ROUND_END', 'MATCH_END', 'TEMP_POWER_EXPIRED']);

/** Who stands in each lane as the log is read, so "is Spell Immune" can name the Unit. */
class BoardNames {
  private names = new Map<string, string>();
  constructor(base?: GameState) {
    if (!base) return;
    for (const side of ['player', 'enemy'] as const) for (const lane of LANES) {
      const unit = base[side].heroZones[lane];
      if (unit) this.names.set(`${side}:${lane}`, unit.name);
    }
  }
  get(side: Side, lane: LaneId) {
    return this.names.get(`${side}:${lane}`);
  }
  track(ev: GameEvent) {
    if (ev.type === 'REVEAL') for (const p of ev.placements) if (p.zone === 'hero') this.names.set(`${p.side}:${p.lane}`, getCombatCard(p.cardId).name);
    if ((ev.type === 'ON_PLAY' && ev.zone === 'hero') || ev.type === 'REVIVED' || ev.type === 'TOKEN_SUMMONED') this.names.set(`${ev.side}:${ev.lane}`, ev.name);
    if (ev.type === 'HERO_DESTROYED') this.names.delete(`${ev.side}:${ev.lane}`);
  }
}

/**
 * What one announced effect did, from the events it caused, as one short phrase list ("Restored 135 HP, gained a
 * Shield"), after any `lead` phrases (what it did silently).
 */
function describeEffects(events: GameEvent[], source: string, side: Side, board: BoardNames, lead: string[] = []): string {
  // Each Unit's ATK changes add up to one net change, and Units with the same change read as one phrase ("Hellhound and
  // Pit Fiend −30 ATK this round"); the Units that gain a Shield or are destroyed are listed the same way. Everything
  // else is one phrase per event, in order.
  type Part = { kind: 'atk' } | { kind: 'names'; verb: 'shield' | 'destroyed'; names: string[] } | { kind: 'text'; text: string };
  const parts: Part[] = lead.map((text) => ({ kind: 'text', text }));
  const atk = new Map<string, { name: string; delta: number; temp: boolean; self: boolean }>();
  const named = (verb: 'shield' | 'destroyed') => {
    let part = parts.find((p): p is Extract<Part, { kind: 'names' }> => p.kind === 'names' && p.verb === verb);
    if (!part) parts.push((part = { kind: 'names', verb, names: [] }));
    return part.names;
  };
  const say = (text: string) => parts.push({ kind: 'text', text });
  const isSource = (name: string, owner: Side) => name === source && owner === side;
  for (const ev of events) {
    switch (ev.type) {
      case 'POWER_CHANGED': {
        if (ev.reason === 'Round End' || ev.to === ev.from) break;
        if (atk.size === 0) parts.push({ kind: 'atk' });
        const key = `${ev.instanceId}|${ev.permanent}`;
        const unit = atk.get(key) ?? { name: ev.name, delta: 0, temp: !ev.permanent, self: isSource(ev.name, ev.side) };
        unit.delta += ev.to - ev.from;
        atk.set(key, unit);
        break;
      }
      case 'HEAL':
        say(`restored ${ev.amount} HP`);
        break;
      case 'DIRECT_DAMAGE':
        say(`${ev.amount} damage to ${SIDE_NAME[ev.side]}`);
        break;
      case 'DAMAGE_PREVENTED':
        say(`${ev.amount} damage to ${SIDE_NAME[ev.side]} prevented`);
        break;
      case 'SHIELD_GRANTED':
        named('shield').push(isSource(ev.name, ev.side) ? '' : ev.name);
        break;
      case 'SHIELD_CONSUMED':
        say(`Shield saved ${ev.name}`);
        break;
      case 'SILENCED':
        say(`silenced ${ev.name}`);
        break;
      case 'HERO_DESTROYED':
      case 'SPELL_ZONE_DESTROYED':
        named('destroyed').push(ev.name);
        break;
      case 'RETURNED_TO_HAND':
        say(ev.name === source ? 'returned to hand' : `${ev.name} returned to hand`);
        break;
      case 'RETURNED_TO_DECK':
        say(ev.name === source ? 'returned to deck' : `${ev.name} returned to deck`);
        break;
      case 'REVIVED':
        say(ev.name === source ? `revived with ${ev.power} ATK` : `revived ${ev.name} (${ev.power} ATK)`);
        break;
      case 'EXILED':
        say(`exiled ${ev.name}`);
        break;
      case 'TOKEN_SUMMONED':
        say(`summoned ${ev.name}`);
        break;
      case 'CARD_DRAWN':
        say(ev.side === 'player' ? `drew ${ev.cardName}` : 'drew a card');
        break;
      case 'IMMUNITY_BLOCKED':
        say(`${board.get(ev.side, ev.lane) ?? 'its target'} is ${ev.immunity === 'SPELL' ? 'Spell Immune' : 'immune to Unit effects'}`);
        break;
      case 'PACIFIED':
        say(`${ev.name} deals no damage this round`);
        break;
      case 'COMBAT_STALLED':
        say(`${ev.name} can’t clash this round`);
        break;
      case 'RETURN_BLOCKED':
        say(ev.name === source ? 'can’t return again this match' : `${ev.name} can’t return again`);
        break;
      default:
        break;
    }
  }
  const atkPhrases = () => {
    const same = new Map<string, { names: string[]; delta: number; temp: boolean; self: boolean }>();
    for (const unit of atk.values()) {
      if (unit.delta === 0) continue;
      const key = `${unit.self}|${unit.delta}|${unit.temp}`;
      const group = same.get(key) ?? { names: [], delta: unit.delta, temp: unit.temp, self: unit.self };
      group.names.push(unit.name);
      same.set(key, group);
    }
    return [...same.values()].map((group) => {
      const amount = `${signed(group.delta)} ATK${group.temp ? ' this round' : ''}`;
      if (group.self) return `${group.delta > 0 ? 'gained' : 'got'} ${amount}`;
      return `${listNames(group.names)} ${amount}`;
    });
  };
  const text = parts
    .flatMap((part) => {
      if (part.kind === 'text') return [part.text];
      if (part.kind === 'atk') return atkPhrases();
      if (part.verb === 'destroyed') return [`destroyed ${listNames(part.names)}`];
      const others = part.names.filter(Boolean);
      if (others.length === 0) return ['gained a Shield'];
      return [others.length === part.names.length ? `${listNames(others)} gained a Shield` : `gained a Shield, and so did ${listNames(others)}`];
    })
    .join(', ');
  return text ? capitalize(text) : NO_EFFECT;
}

/**
 * The log entries for `events` (one round's reveal, or a whole match's log), in the order the round resolved.
 * `base` is the board before the first event, so a blocked effect can name the Unit that ignored it.
 */
export function battleLogEntries(events: GameEvent[], base?: GameState): BattleLogEntry[] {
  const entries: BattleLogEntry[] = [];
  const board = new BoardNames(base);
  const preventer: Partial<Record<Side, string>> = {};
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    const start = i;
    if (ev.type === 'ROUND_START') {
      entries.push({ key: `${i}`, until: i, kind: 'round', side: null, who: `Round ${ev.round}`, text: '' });
      delete preventer.player;
      delete preventer.enemy;
      i++;
      continue;
    }
    if (ev.type === 'TRIGGER') {
      // An effect: the announcement and everything it caused, up to the next announcement or step of the round.
      let j = i + 1;
      while (j < events.length && !GROUP_END.has(events[j].type) && events[j].type !== 'SPELL_RESOLVED') j++;
      const caused = events.slice(i + 1, j);
      for (const e of caused) board.track(e);
      // A one-time Spell's group ends at its SPELL_RESOLVED.
      if (events[j]?.type === 'SPELL_RESOLVED' && (events[j] as { name: string }).name === ev.sourceName) j++;
      let text = describeEffects(caused, ev.sourceName, ev.side, board, silentEffects(ev.sourceName, ev.trigger, ev.side));
      if (caused.length === 0 && ev.trigger === 'PASSIVE') {
        // Archmage Vael's echo: the next Spell resolves twice.
        const next = events.slice(i + 1).find((e) => e.type === 'TRIGGER' || e.type === 'SPELL_RESOLVED') as { sourceName?: string; name?: string } | undefined;
        const spell = next?.sourceName ?? next?.name;
        text = spell ? `${spell} resolves twice` : text;
      }
      if (preventsDamage(ev.sourceName)) preventer[ev.side] = ev.sourceName;
      // A Unit or Continuous Spell whose effect found nothing to do (no enemy in its lane, nothing in the Graveyard)
      // leaves no row: the log keeps to what changed.
      if (text !== NO_EFFECT || isOneTimeSpell(ev.sourceName)) entries.push({ key: `${start}`, until: j - 1, kind: 'effect', side: ev.side, who: ev.sourceName, label: rowLabel(triggerLabel(ev.sourceName, ev.trigger), ev.side), text });
      i = j;
      continue;
    }
    if (ev.type === 'SPELL_RESOLVED') {
      // A one-time Spell with nothing to do (no announcement came before it).
      if (ev.fizzled) entries.push({ key: `${start}`, until: i, kind: 'effect', side: ev.side, who: ev.name, label: 'Spell', text: NO_EFFECT });
      i++;
      continue;
    }
    if (ev.type === 'ON_PLAY' && ev.zone === 'spell') {
      // A Continuous Spell whose effect is always on (Battle Banner) never announces itself: say what it does once.
      const always = cardCombatBattleEffects(ev.cardId).filter((e) => e.trigger === 'CONTINUOUS');
      if (always.length > 0) {
        const text = always.map((e) => e.compact.replace(/^Your Unit here/, 'Unit here').replace(/\.$/, '')).join(', ');
        entries.push({ key: `${start}`, until: i, kind: 'effect', side: ev.side, who: ev.name, label: always[0].chip, text });
      }
      i++;
      continue;
    }
    if (ev.type === 'COMBAT') {
      const next = events[i + 1];
      const lane = LANE_NAME[ev.lane];
      if (ev.outcome === 'TIE' && next?.type === 'CLASH_DAMAGE') {
        entries.push({ key: `${start}`, until: i + 1, kind: 'clash', side: null, who: 'Tie', label: lane, text: `${ev.player?.name} and ${ev.enemy?.name} destroyed at ${ev.player?.power} ATK each, no damage` });
        i += 2;
        continue;
      }
      if ((ev.outcome === 'PLAYER_WINS' || ev.outcome === 'ENEMY_WINS') && next?.type === 'CLASH_DAMAGE' && next.side) {
        const winner: Side = ev.outcome === 'PLAYER_WINS' ? 'player' : 'enemy';
        const w = winner === 'player' ? ev.player : ev.enemy;
        const l = winner === 'player' ? ev.enemy : ev.player;
        const why = `(${w?.name} ${w?.power} beat ${l?.name} ${l?.power})`;
        const to = SIDE_NAME[next.side];
        const by = preventer[next.side];
        if (next.prevented > 0 && next.amount === 0) {
          entries.push({ key: `${start}`, until: i + 1, kind: 'clash', side: next.side, who: by ?? 'Clash Damage', label: lane, text: `Prevented ${next.prevented} Clash Damage to ${to} ${why}` });
        } else {
          const notes = [next.reduced > 0 ? `${next.reduced} less from ${l?.name}` : '', next.prevented > 0 ? `${next.prevented} prevented${by ? ` by ${by}` : ''}` : ''].filter(Boolean);
          entries.push({ key: `${start}`, until: i + 1, kind: 'clash', side: winner, who: 'Clash Damage', label: lane, text: `${next.amount} to ${to}${notes.length ? `, ${notes.join(', ')}` : ''} ${why}` });
        }
        i += 2;
        continue;
      }
      if (ev.outcome === 'PLAYER_DIRECT' || ev.outcome === 'ENEMY_DIRECT') {
        const attacker: Side = ev.outcome === 'PLAYER_DIRECT' ? 'player' : 'enemy';
        const unit = attacker === 'player' ? ev.player : ev.enemy;
        const hit = next?.type === 'DIRECT_DAMAGE' || next?.type === 'DAMAGE_PREVENTED' ? next : null;
        const to = SIDE_NAME[attacker === 'player' ? 'enemy' : 'player'];
        const by = preventer[attacker === 'player' ? 'enemy' : 'player'];
        const text = !hit ? 'No damage' : hit.type === 'DAMAGE_PREVENTED' ? `${hit.amount} to ${to} prevented${by ? ` by ${by}` : ''}` : `${hit.amount} to ${to}`;
        entries.push({ key: `${start}`, until: hit ? i + 1 : i, kind: 'clash', side: attacker, who: unit?.name ?? 'Unit', label: ev.bypass ? 'Bypass' : 'Direct Hit', text });
        i += hit ? 2 : 1;
        continue;
      }
      if (ev.outcome === 'STALLED') entries.push({ key: `${start}`, until: i, kind: 'clash', side: null, who: 'No clash', label: lane, text: [ev.player?.name, ev.enemy?.name].filter(Boolean).join(' and ') + ' held this round' });
      i++;
      continue;
    }
    if (ev.type === 'SHIELD_CONSUMED') {
      // A Shield that saved a clash loser (an effect's own destroy is described in its group).
      entries.push({ key: `${start}`, until: i, kind: 'effect', side: ev.side, who: ev.name, label: 'Shield', text: 'Survived the clash, Shield used up' });
      i++;
      continue;
    }
    board.track(ev);
    i++;
  }
  return entries;
}
