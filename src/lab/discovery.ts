import type { GameEvent, Side } from '../game/types';
import { getCard } from '../game/cards';
import { battleLogEntries } from '../components/battleInfo/battleLog';
import { describeAcquisition, getCardAcquisitionSources } from '../game/collection/acquisition';

// Card Discovery Lab: "Cards Worth Exploring" after a battle. Up to three of the opponent's cards, chosen from what they
// actually did in this battle's event log: effects first (damage, Units destroyed, revives, tokens, ATK taken from your
// Units), then the damage they pushed past your blockers. A card that only won clashes on its printed ATK is not picked:
// the lab is about what effects do. Nothing is granted; the card's normal source is only named.

export interface CardContribution {
  cardId: string;
  name: string;
  /** Effects of this card that did something. */
  triggers: number;
  /** Effect damage to the other player. */
  damage: number;
  /** Damage dealt past a blocker (Bypass). */
  bypassDamage: number;
  /** Units of the other side its effects destroyed. */
  destroyed: number;
  /** Units it revived (itself included). */
  revived: number;
  tokens: number;
  /** ATK its effects took from the other side's Units, summed. */
  atkTaken: number;
  /** ATK its effects gave its own side, summed. */
  atkGiven: number;
  /** HP its effects restored. */
  healed: number;
  /** Cards it brought back to hand. */
  returned: number;
  /** Times a Shield saved it. */
  shieldSaves: number;
  /** Clash Damage it dealt by winning clashes. */
  clashDamage: number;
}

export interface WorthExploring extends CardContribution {
  score: number;
  /** "Dealt 270 damage; destroyed 1 Unit", from the counts above. */
  summary: string;
  obtainable: boolean;
  /** "Arcane Box", "Core · Undead", or "Not obtainable yet". */
  source: string;
}

const empty = (cardId: string, name: string): CardContribution => ({ cardId, name, triggers: 0, damage: 0, bypassDamage: 0, destroyed: 0, revived: 0, tokens: 0, atkTaken: 0, atkGiven: 0, healed: 0, returned: 0, shieldSaves: 0, clashDamage: 0 });

/** What each card of `side` (looked up by name among `deck`) did in `events`. Cards that did nothing are left out. */
export function cardContributions(events: readonly GameEvent[], side: Side, deck: readonly string[]): CardContribution[] {
  const byName = new Map<string, string>();
  for (const id of new Set(deck)) byName.set(getCard(id).name, id);
  const out = new Map<string, CardContribution>();
  const of = (name: string) => {
    const id = byName.get(name);
    if (!id) return null;
    if (!out.has(name)) out.set(name, empty(id, name));
    return out.get(name)!;
  };
  const list = [...events];
  for (const entry of battleLogEntries(list)) {
    if (entry.kind !== 'effect' || entry.side !== side || entry.text === 'No effect' || entry.label === 'Expired' || entry.label === 'Attached' || entry.label === 'Shield') continue;
    const c = of(entry.who);
    if (!c) continue;
    c.triggers += 1;
    for (const ev of list.slice(Number.parseInt(entry.key, 10), entry.until + 1)) {
      if (ev.type === 'DIRECT_DAMAGE' && ev.side !== side) c.damage += ev.amount;
      else if (ev.type === 'HERO_DESTROYED' && ev.side !== side) c.destroyed += 1;
      else if (ev.type === 'REVIVED' && ev.side === side) c.revived += 1;
      else if (ev.type === 'TOKEN_SUMMONED' && ev.side === side) c.tokens += 1;
      else if (ev.type === 'HEAL' && ev.side === side) c.healed += ev.amount;
      else if (ev.type === 'RETURNED_TO_HAND' && ev.side === side) c.returned += 1;
      else if (ev.type === 'POWER_CHANGED' && ev.reason !== 'Round End') {
        const delta = ev.to - ev.from;
        if (ev.side !== side && delta < 0) c.atkTaken += -delta;
        if (ev.side === side && delta > 0) c.atkGiven += delta;
      }
    }
  }
  for (let i = 0; i < list.length; i++) {
    const ev = list[i];
    if (ev.type === 'COMBAT') {
      const attacker: Side | null = ev.outcome === 'PLAYER_DIRECT' ? 'player' : ev.outcome === 'ENEMY_DIRECT' ? 'enemy' : null;
      const next = list[i + 1];
      if (ev.bypass && attacker === side && next?.type === 'DIRECT_DAMAGE') {
        const c = of((side === 'player' ? ev.player : ev.enemy)?.name ?? '');
        if (c) c.bypassDamage += next.amount;
      }
      const winner: Side | null = ev.outcome === 'PLAYER_WINS' ? 'player' : ev.outcome === 'ENEMY_WINS' ? 'enemy' : null;
      if (winner === side && next?.type === 'CLASH_DAMAGE') {
        const c = of((side === 'player' ? ev.player : ev.enemy)?.name ?? '');
        if (c) c.clashDamage += next.amount;
      }
    }
    if (ev.type === 'SHIELD_CONSUMED' && ev.side === side) {
      const c = of(ev.name);
      if (c) c.shieldSaves += 1;
    }
  }
  return [...out.values()];
}

/** How much a contribution is worth showing: effects that changed the board first, numbers second. */
export function contributionScore(c: CardContribution): number {
  const effect = c.damage + c.bypassDamage + 90 * c.destroyed + 70 * c.revived + 50 * c.tokens + c.atkTaken + 0.5 * c.atkGiven + 0.5 * c.healed + 40 * c.returned + 40 * c.shieldSaves + 10 * c.triggers;
  // Clash wins count a little, and only alongside an effect.
  return effect > 0 ? effect + 0.25 * c.clashDamage : 0;
}

export function contributionSummary(c: CardContribution): string {
  const parts: string[] = [];
  if (c.damage > 0) parts.push(`dealt ${c.damage} effect damage`);
  if (c.bypassDamage > 0) parts.push(`hit for ${c.bypassDamage} past blockers (Bypass)`);
  if (c.destroyed > 0) parts.push(`destroyed ${c.destroyed} Unit${c.destroyed > 1 ? 's' : ''}`);
  if (c.revived > 0) parts.push(`revived ${c.revived} Unit${c.revived > 1 ? 's' : ''}`);
  if (c.tokens > 0) parts.push(`summoned ${c.tokens} token${c.tokens > 1 ? 's' : ''}`);
  if (c.atkTaken > 0) parts.push(`took ${c.atkTaken} ATK from opposing Units`);
  if (c.atkGiven > 0) parts.push(`gave ${c.atkGiven} ATK to its side`);
  if (c.healed > 0) parts.push(`restored ${c.healed} HP`);
  if (c.returned > 0) parts.push(`returned ${c.returned} card${c.returned > 1 ? 's' : ''} to hand`);
  if (c.shieldSaves > 0) parts.push(`survived ${c.shieldSaves === 1 ? 'once' : `${c.shieldSaves} times`} on a Shield`);
  const text = parts.join('; ');
  const lead = c.triggers > 0 ? `Its effects fired ${c.triggers} time${c.triggers > 1 ? 's' : ''}` : '';
  return [lead, text].filter(Boolean).join(': ') || 'No effect this battle';
}

/** Where a card normally comes from, or that it can't be obtained. Read-only: nothing is granted. */
export function cardSource(cardId: string): { obtainable: boolean; source: string } {
  const sources = getCardAcquisitionSources(cardId);
  const obtainable = sources.some((s) => s.kind === 'core' || s.kind === 'campaign' || s.kind === 'box' || s.kind === 'structure-deck');
  const lines = sources.map(describeAcquisition);
  return { obtainable, source: obtainable ? lines.filter((l) => !l.endsWith('coming later')).join(' / ') : `Not obtainable yet${sources.some((s) => s.kind === 'planned') ? ` (${lines.join(' / ')})` : ''}` };
}

/** Up to `limit` of `side`'s cards that did the most through their effects in this battle. */
export function cardsWorthExploring(events: readonly GameEvent[], side: Side, deck: readonly string[], limit = 3): WorthExploring[] {
  return cardContributions(events, side, deck)
    .map((c) => ({ ...c, score: contributionScore(c), summary: contributionSummary(c), ...cardSource(c.cardId) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
