import { getCard } from '../cards/index.js';
import { LAUNCH_ROSTER } from '../cards/launchRoster.js';
import { maxCopiesFor } from '../engine/deckRules.js';
import type { StarterFaction } from '../cards/starterDecks.js';

// Core: the 30 free, guaranteed cards of the launch set, as three faction packages of 10 (docs/BOX-ARCHITECTURE.md).
// A package holds every Core card of its faction at the most copies a deck may use (2, a Legendary 1), so owning a
// package means owning its faction's starter deck outright. Nothing in Core is random, paid or Box-only.
//
// The player picks one package (their starter faction) when the account starts; the other two unlock through the first
// Campaign stages (coreAccess.ts). Granting a package never duplicates: each card is raised to the package count, never
// added on top.

export const CORE_FACTIONS: readonly StarterFaction[] = ['kingdom', 'undead', 'infernal'];

export const CORE_FACTION_NAMES: Readonly<Record<StarterFaction, string>> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };

/** One line per faction for the starter pick. */
export const CORE_FACTION_PITCH: Readonly<Record<StarterFaction, string>> = {
  kingdom: 'Knights who hold the line and protect each other.',
  undead: 'The dead that rise again and grind the enemy down.',
  infernal: 'Demons that burn the enemy whether they win or lose.',
};

/** The Core card ids of a faction, in roster order. */
export function coreCardIds(faction: StarterFaction): string[] {
  return LAUNCH_ROSTER.filter((c) => c.source === 'core' && getCard(c.id).faction === faction).map((c) => c.id);
}

/** A faction's Core package: every Core card at its deck limit. */
export function corePackage(faction: StarterFaction): Record<string, number> {
  return Object.fromEntries(coreCardIds(faction).map((id) => [id, maxCopiesFor(id)]));
}

export function isCoreCard(cardId: string): boolean {
  return LAUNCH_ROSTER.some((c) => c.id === cardId && c.source === 'core');
}

/** `owned` with every card of the packages raised to its package count (never lowered, never added on top). */
export function withCorePackages(owned: Readonly<Record<string, number>>, factions: readonly StarterFaction[]): Record<string, number> {
  const next: Record<string, number> = { ...owned };
  for (const faction of factions) for (const [id, n] of Object.entries(corePackage(faction))) next[id] = Math.max(next[id] ?? 0, n);
  return next;
}
