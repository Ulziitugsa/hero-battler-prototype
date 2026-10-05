import type { Faction, Rarity } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { LAUNCH_ROSTER, launchInfo, type ArchetypeBoxId } from '../cards/launchRoster.js';

// The nine finite archetype Boxes of the launch set (docs/BOX-ARCHITECTURE.md). One Box per archetype, shown in the
// Shop as three faction groups of three. Each Box is a fixed set of physical card copies, drawn without replacement:
//   - copies per card by rarity: Legendary 1, Epic 2, Rare 3, Common 4 (shape B, approved);
//   - its cards are the archetype's headline cards plus the cards cross-listed into it (launchRoster.ts `boxes`);
//   - exactly one Legendary: the archetype's flagship, so emptying the Box guarantees it;
//   - sizes are not normalized (25-33 copies).
// The pool (what is left, draws, restock) lives in boxPool.ts; prices and Tickets in boxProduct.ts.

export type { ArchetypeBoxId };

export const BOX_COPIES_BY_RARITY: Readonly<Record<Rarity, number>> = { legendary: 1, epic: 2, rare: 3, common: 4 };

export interface ArchetypeBoxDef {
  id: ArchetypeBoxId;
  name: string;
  faction: Exclude<Faction, 'wildborn'>;
  /** One line: what the archetype does. */
  theme: string;
  /** The Box's one Legendary: the archetype's flagship. */
  flagshipId: string;
  /** Shown on the Box art, flagship first. */
  bannerCardIds: readonly string[];
}

export const ARCHETYPE_BOXES: readonly ArchetypeBoxDef[] = [
  { id: 'vanguard', name: 'Vanguard Box', faction: 'kingdom', theme: 'A full board of Knights that protect each other', flagshipId: 'kng-marshal-aldric', bannerCardIds: ['kng-marshal-aldric', 'kng-oathkeeper', 'kng-battle-captain'] },
  { id: 'arcane', name: 'Arcane Box', faction: 'kingdom', theme: 'Spell chains, repeats and burst damage', flagshipId: 'kng-archmage-vael', bannerCardIds: ['kng-archmage-vael', 'kng-moonlit-savant', 'spl-mirror-image'] },
  { id: 'crusade', name: 'Crusade Box', faction: 'kingdom', theme: 'One great Unit, armed with Attached Spells', flagshipId: 'kng-saint-aveline', bannerCardIds: ['kng-saint-aveline', 'kng-crusader-champion', 'spl-fortify'] },
  { id: 'bone-legion', name: 'Bone Legion Box', faction: 'undead', theme: 'The dead come back, again and again', flagshipId: 'und-morwen', bannerCardIds: ['und-morwen', 'und-mira', 'spl-grave-totem'] },
  { id: 'phantoms', name: 'Phantoms Box', faction: 'undead', theme: 'Slip past the enemy into an open lane', flagshipId: 'und-duchess-nyx', bannerCardIds: ['und-duchess-nyx', 'und-wraith-prince', 'und-banshee'] },
  { id: 'wither', name: 'Wither Box', faction: 'undead', theme: 'Grind the enemy down, a little every round', flagshipId: 'und-plague-mother', bannerCardIds: ['und-plague-mother', 'und-blightcaster', 'und-withering-lich'] },
  { id: 'hellpack', name: 'Hellpack Box', faction: 'infernal', theme: 'Beasts that swarm the board and refill it', flagshipId: 'inf-cerberus', bannerCardIds: ['inf-cerberus', 'inf-alpha-hound', 'inf-brimstone-matriarch'] },
  { id: 'hellfire', name: 'Hellfire Box', faction: 'infernal', theme: 'Burn that lands every round, whoever wins the clash', flagshipId: 'inf-ignis', bannerCardIds: ['inf-ignis', 'inf-hellfire-warlock', 'spl-inferno'] },
  { id: 'bloodbound', name: 'Bloodbound Box', faction: 'infernal', theme: 'Every Unit you lose hurts the opponent', flagshipId: 'inf-kathra', bannerCardIds: ['inf-kathra', 'inf-blood-demon', 'spl-flesh-altar'] },
];

/** The Shop's three faction groups, in display order. */
export const BOX_FACTION_GROUPS: readonly { faction: ArchetypeBoxDef['faction']; name: string; boxIds: readonly ArchetypeBoxId[] }[] = [
  { faction: 'kingdom', name: 'Kingdom', boxIds: ['vanguard', 'arcane', 'crusade'] },
  { faction: 'undead', name: 'Undead', boxIds: ['bone-legion', 'phantoms', 'wither'] },
  { faction: 'infernal', name: 'Infernal', boxIds: ['hellpack', 'hellfire', 'bloodbound'] },
];

export const ARCHETYPE_BOX_IDS: readonly ArchetypeBoxId[] = ARCHETYPE_BOXES.map((b) => b.id);

export function isArchetypeBoxId(id: string): id is ArchetypeBoxId {
  return (ARCHETYPE_BOX_IDS as readonly string[]).includes(id);
}

export function getArchetypeBox(id: ArchetypeBoxId): ArchetypeBoxDef {
  const box = ARCHETYPE_BOXES.find((b) => b.id === id);
  if (!box) throw new Error(`Unknown Box: ${id}`);
  return box;
}

const FULL = new Map<ArchetypeBoxId, Readonly<Record<string, number>>>();

/** A full Box: every card in it and its copy count. Card ids in a stable (sorted) order, which the draw relies on. */
export function fullBoxContents(id: ArchetypeBoxId): Readonly<Record<string, number>> {
  let full = FULL.get(id);
  if (!full) {
    const ids = LAUNCH_ROSTER.filter((c) => c.boxes?.includes(id)).map((c) => c.id).sort();
    full = Object.freeze(Object.fromEntries(ids.map((cardId) => [cardId, BOX_COPIES_BY_RARITY[getCard(cardId).rarity]])));
    FULL.set(id, full);
  }
  return full;
}

/** Copies in a full Box. */
export function boxSize(id: ArchetypeBoxId): number {
  return Object.values(fullBoxContents(id)).reduce((sum, n) => sum + n, 0);
}

/** Copies of each rarity in a full Box. */
export function boxRarityTotals(id: ArchetypeBoxId): Record<Rarity, number> {
  const totals: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const [cardId, n] of Object.entries(fullBoxContents(id))) totals[getCard(cardId).rarity] += n;
  return totals;
}

/** The Boxes a card can be pulled from (headline Box first), or none for Core, Structure Deck and event cards. */
export function boxesWithCard(cardId: string): ArchetypeBoxId[] {
  return [...(launchInfo(cardId)?.boxes ?? [])];
}
