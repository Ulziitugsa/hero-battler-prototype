import type { CardDefinition, Faction, Rarity } from '../../game/types';

// Pure collection-browsing logic for the Heroes screen: filtering, stable sorting, the contextual
// tally and the empty-state copy. No ownership rules live here - the owned set is passed in.

export type OwnedFilter = 'all' | 'owned' | 'missing';
export type SortMode = 'rarity' | 'power' | 'name' | 'faction';

export const FACTION_ORDER: Faction[] = ['kingdom', 'undead', 'infernal'];
export const FACTION_LABEL: Record<Faction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };
const RARITY_RANK: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };

export const SORT_LABEL: Record<SortMode, string> = { rarity: 'Rarity', power: 'Power', name: 'Name', faction: 'Faction' };

export interface HeroFilters {
  owned: OwnedFilter;
  faction: Faction | 'all';
  rarity: Rarity | 'all';
  query: string;
}

const factionRank = (f: Faction) => {
  const i = FACTION_ORDER.indexOf(f);
  return i < 0 ? FACTION_ORDER.length : i;
};

/** The role shown next to the faction. A few heroes carry their faction as their role (e.g. "Undead"), which reads as a stutter - fall back to a distinct tag, or nothing. */
export function displayRole(card: CardDefinition): string {
  const faction = FACTION_LABEL[card.faction].toLowerCase();
  if (card.role.toLowerCase() !== faction) return card.role;
  return card.tags.find((t) => t.toLowerCase() !== faction) ?? '';
}

export function matchesQuery(card: CardDefinition, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [card.name, card.role, FACTION_LABEL[card.faction], ...card.tags].some((s) => s.toLowerCase().includes(q));
}

/** Every sort is total (ties fall through to rarity, faction, name), so order never jitters between renders. */
export function compareCards(mode: SortMode): (a: CardDefinition, b: CardDefinition) => number {
  const byName = (a: CardDefinition, b: CardDefinition) => a.name.localeCompare(b.name);
  const byRarity = (a: CardDefinition, b: CardDefinition) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
  const byFaction = (a: CardDefinition, b: CardDefinition) => factionRank(a.faction) - factionRank(b.faction);
  const byPower = (a: CardDefinition, b: CardDefinition) => (b.power ?? 0) - (a.power ?? 0);
  const chains = {
    rarity: [byRarity, byFaction, byName],
    power: [byPower, byRarity, byFaction, byName],
    name: [byName],
    faction: [byFaction, byRarity, byName],
  };
  return (a, b) => {
    for (const cmp of chains[mode]) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

/** Faction, rarity and search narrow the "scope"; ownership then splits it. The tally counts the scope, so switching All/Owned/Missing never changes the denominator. */
export function scopeOf(cards: CardDefinition[], f: Pick<HeroFilters, 'faction' | 'rarity' | 'query'>): CardDefinition[] {
  return cards.filter((c) => (f.faction === 'all' || c.faction === f.faction) && (f.rarity === 'all' || c.rarity === f.rarity) && matchesQuery(c, f.query));
}

export function filterHeroes(cards: CardDefinition[], owned: ReadonlySet<string>, f: HeroFilters, sort: SortMode): CardDefinition[] {
  return scopeOf(cards, f)
    .filter((c) => f.owned === 'all' || (f.owned === 'owned') === owned.has(c.id))
    .sort(compareCards(sort));
}

export function tally(scope: CardDefinition[], owned: ReadonlySet<string>): { have: number; total: number; missing: number } {
  const have = scope.filter((c) => owned.has(c.id)).length;
  return { have, total: scope.length, missing: scope.length - have };
}

export interface EmptyCopy {
  title: string;
  sub: string;
}

/** Short, game-like copy for a grid with nothing in it - only called when the filtered list is empty. */
export function emptyCopy(f: HeroFilters, all: CardDefinition[], owned: ReadonlySet<string>): EmptyCopy {
  const scope = scopeOf(all, f);
  const who = f.faction === 'all' ? 'Heroes' : `${FACTION_LABEL[f.faction]} Heroes`;
  if (scope.length > 0 && f.owned === 'missing') {
    return all.every((c) => owned.has(c.id)) ? { title: 'Collection complete', sub: 'Every Hero is yours.' } : { title: `No missing ${who}`, sub: 'You hold every one of these.' };
  }
  if (scope.length > 0 && f.owned === 'owned') {
    return owned.size === 0 ? { title: 'No Heroes yet', sub: 'Your collection is empty.' } : { title: `No ${who} collected`, sub: 'None of these are yours yet.' };
  }
  return { title: 'No Heroes found', sub: 'Nothing matches these filters.' };
}

export function isFiltered(f: HeroFilters): boolean {
  return f.owned !== 'all' || f.faction !== 'all' || f.rarity !== 'all' || f.query.trim() !== '';
}
