// The Moonwater launch set: all 116 cards, where each one comes from, and its printed stats.
//
// One row per card, taken from the approved roster (project file moonwater/card-set-120/roster-120.csv, with the second
// and final balance passes applied). The card rules live in the card files (launchCards.ts for the new cards, the
// faction files plus cardCombat/cards.ts for the existing ones); this table carries what the rules do not:
//   - source: 'core' (free, granted by faction package), 'box' (one or more archetype Boxes), 'structure-deck' (a debut
//     card of one Structure Deck) or 'event' (an event / progression reward, registered only for now);
//   - boxes: the archetype Boxes it is drawn from, its headline Box first (cross-listed cards follow);
//   - atk / hpc: the printed ATK and HP Contribution of a Unit (stats.ts reads ATK from here; HPC follows the formula,
//     and a test keeps the two equal);
//   - complexity: the C1-C6 complexity band (balance review only, never shown).

export type ArchetypeBoxId = 'vanguard' | 'arcane' | 'crusade' | 'bone-legion' | 'phantoms' | 'wither' | 'hellpack' | 'hellfire' | 'bloodbound';
export type LaunchSource = 'core' | 'box' | 'structure-deck' | 'event';
export type LaunchStructureDeckId = 'sd-bone-legion' | 'sd-hellfire' | 'sd-crusade';

export interface LaunchCardInfo {
  id: string;
  /** The approved archetype label ("Flex", "Witch-hunter (tech)" and bridge labels included). */
  archetype: string;
  source: LaunchSource;
  boxes?: readonly ArchetypeBoxId[];
  structureDeck?: LaunchStructureDeckId;
  atk?: number;
  hpc?: number;
  complexity: number;
}

export const LAUNCH_ROSTER: readonly LaunchCardInfo[] = [
  { id: 'inf-cultist', archetype: 'Bloodbound', source: 'core', atk: 76, hpc: 101, complexity: 1 },
  { id: 'inf-pit-fiend', archetype: 'Bloodbound', source: 'core', atk: 105, hpc: 79, complexity: 3 },
  { id: 'inf-soot-imp', archetype: 'Bloodbound', source: 'core', atk: 85, hpc: 94, complexity: 1 },
  { id: 'inf-brimstone-ogre', archetype: 'Flex', source: 'core', atk: 125, hpc: 64, complexity: 1 },
  { id: 'spl-weakness', archetype: 'Flex', source: 'core', complexity: 1 },
  { id: 'inf-flame-imp', archetype: 'Hellfire', source: 'core', atk: 84, hpc: 95, complexity: 2 },
  { id: 'inf-infernal-lord', archetype: 'Hellfire', source: 'core', atk: 129, hpc: 72, complexity: 4 },
  { id: 'spl-fireball', archetype: 'Hellfire', source: 'core', complexity: 3 },
  { id: 'spl-cinder-bolt', archetype: 'Hellfire', source: 'core', complexity: 1 },
  { id: 'inf-hellhound', archetype: 'Hellpack', source: 'core', atk: 108, hpc: 81, complexity: 2 },
  { id: 'kng-archer', archetype: 'Crusade', source: 'core', atk: 90, hpc: 90, complexity: 3 },
  { id: 'spl-battle-banner', archetype: 'Crusade', source: 'core', complexity: 2 },
  { id: 'spl-power-surge', archetype: 'Flex', source: 'core', complexity: 1 },
  { id: 'spl-aegis-ward', archetype: 'Flex', source: 'core', complexity: 2 },
  { id: 'spl-dispel', archetype: 'Flex', source: 'core', complexity: 3 },
  { id: 'kng-common-knight', archetype: 'Vanguard', source: 'core', atk: 128, hpc: 62, complexity: 1 },
  { id: 'kng-shieldbearer', archetype: 'Vanguard', source: 'core', atk: 86, hpc: 93, complexity: 2 },
  { id: 'kng-royal-guard', archetype: 'Vanguard', source: 'core', atk: 113, hpc: 77, complexity: 3 },
  { id: 'kng-light-priest', archetype: 'Vanguard', source: 'core', atk: 78, hpc: 103, complexity: 4 },
  { id: 'kng-paladin', archetype: 'Vanguard', source: 'core', atk: 110, hpc: 86, complexity: 5 },
  { id: 'und-bone-soldier', archetype: 'Bone Legion', source: 'core', atk: 93, hpc: 88, complexity: 4 },
  { id: 'und-cursed-warrior', archetype: 'Bone Legion', source: 'core', atk: 99, hpc: 83, complexity: 2 },
  { id: 'und-crypt-warden', archetype: 'Bone Legion', source: 'core', atk: 98, hpc: 84, complexity: 4 },
  { id: 'und-dark-priest', archetype: 'Bone Legion', source: 'core', atk: 84, hpc: 99, complexity: 4 },
  { id: 'und-grave-sexton', archetype: 'Bone Legion', source: 'core', atk: 91, hpc: 93, complexity: 2 },
  { id: 'und-vharos', archetype: 'Bone Legion', source: 'core', atk: 130, hpc: 71, complexity: 5 },
  { id: 'spl-second-chance', archetype: 'Bone Legion', source: 'core', complexity: 3 },
  { id: 'spl-raise-fallen', archetype: 'Bone Legion', source: 'core', complexity: 4 },
  { id: 'und-ghoul-brute', archetype: 'Flex', source: 'core', atk: 122, hpc: 66, complexity: 1 },
  { id: 'spl-hush', archetype: 'Flex', source: 'core', complexity: 2 },
  { id: 'inf-cerberus', archetype: 'Hellpack', source: 'box', boxes: ['hellpack'], atk: 108, hpc: 88, complexity: 4 },
  { id: 'inf-alpha-hound', archetype: 'Hellpack', source: 'box', boxes: ['hellpack'], atk: 93, hpc: 96, complexity: 3 },
  { id: 'inf-brimstone-matriarch', archetype: 'Hellpack', source: 'box', boxes: ['hellpack'], atk: 107, hpc: 85, complexity: 3 },
  { id: 'inf-packhound', archetype: 'Hellpack', source: 'box', boxes: ['hellpack'], atk: 92, hpc: 93, complexity: 3 },
  { id: 'spl-call-the-pack', archetype: 'Hellpack', source: 'box', boxes: ['hellpack'], complexity: 2 },
  { id: 'inf-ash-jackal', archetype: 'Hellpack', source: 'box', boxes: ['hellpack'], atk: 84, hpc: 95, complexity: 2 },
  { id: 'inf-cinder-jackal', archetype: 'Hellpack', source: 'box', boxes: ['hellpack', 'bloodbound'], atk: 100, hpc: 83, complexity: 2 },
  { id: 'inf-runebreaker', archetype: 'Witch-hunter (tech)', source: 'box', boxes: ['hellpack'], atk: 115, hpc: 79, complexity: 4 },
  { id: 'spl-war-cry', archetype: 'Go-wide (shared)', source: 'box', boxes: ['vanguard', 'hellpack'], complexity: 3 },
  { id: 'kng-marshal-aldric', archetype: 'Vanguard', source: 'box', boxes: ['vanguard'], atk: 105, hpc: 90, complexity: 5 },
  { id: 'kng-battle-captain', archetype: 'Vanguard', source: 'box', boxes: ['vanguard'], atk: 102, hpc: 89, complexity: 4 },
  { id: 'kng-oathkeeper', archetype: 'Vanguard', source: 'box', boxes: ['vanguard'], atk: 90, hpc: 98, complexity: 4 },
  { id: 'kng-knight-errant', archetype: 'Vanguard', source: 'box', boxes: ['vanguard', 'crusade'], atk: 96, hpc: 90, complexity: 3 },
  { id: 'spl-ward-circle', archetype: 'Vanguard', source: 'box', boxes: ['vanguard'], complexity: 2 },
  { id: 'kng-relic-warden', archetype: 'Vanguard', source: 'box', boxes: ['vanguard'], atk: 94, hpc: 87, complexity: 2 },
  { id: 'kng-pikeman', archetype: 'Vanguard', source: 'box', boxes: ['vanguard'], atk: 97, hpc: 85, complexity: 2 },
  { id: 'kng-spellbreaker', archetype: 'Witch-hunter (tech)', source: 'box', boxes: ['vanguard'], atk: 99, hpc: 83, complexity: 2 },
  { id: 'kng-null-templar', archetype: 'Witch-hunter (tech)', source: 'box', boxes: ['vanguard'], atk: 112, hpc: 78, complexity: 3 },
  { id: 'und-morwen', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], atk: 92, hpc: 100, complexity: 6 },
  { id: 'und-mira', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], atk: 97, hpc: 93, complexity: 5 },
  { id: 'spl-grave-totem', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], complexity: 5 },
  { id: 'und-bonecaller', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], atk: 95, hpc: 90, complexity: 3 },
  { id: 'und-skeletal-legionnaire', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], atk: 100, hpc: 87, complexity: 3 },
  { id: 'spl-bone-wall', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], complexity: 3 },
  { id: 'und-rattling-horde', archetype: 'Bone Legion', source: 'box', boxes: ['bone-legion'], atk: 82, hpc: 96, complexity: 2 },
  { id: 'inf-ignis', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], atk: 106, hpc: 89, complexity: 5 },
  { id: 'inf-hellfire-warlock', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], atk: 95, hpc: 94, complexity: 4 },
  { id: 'spl-inferno', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], complexity: 3 },
  { id: 'spl-burning-ground', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], complexity: 3 },
  { id: 'inf-ember-witch', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], atk: 100, hpc: 87, complexity: 2 },
  { id: 'spl-siege-fire', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], complexity: 3 },
  { id: 'inf-cinder-imp', archetype: 'Hellfire', source: 'box', boxes: ['hellfire'], atk: 94, hpc: 87, complexity: 2 },
  { id: 'spl-wall-of-flame', archetype: 'Hellfire', source: 'box', boxes: ['hellfire', 'phantoms'], complexity: 2 },
  { id: 'spl-arcane-bolt', archetype: 'Spells (shared)', source: 'box', boxes: ['arcane', 'hellfire'], complexity: 3 },
  { id: 'inf-mirage-imp', archetype: 'Spells (shared)', source: 'box', boxes: ['phantoms', 'hellfire'], atk: 97, hpc: 89, complexity: 3 },
  { id: 'kng-archmage-vael', archetype: 'Arcane', source: 'box', boxes: ['arcane'], atk: 94, hpc: 98, complexity: 6 },
  { id: 'kng-moonlit-savant', archetype: 'Arcane', source: 'box', boxes: ['arcane'], atk: 92, hpc: 97, complexity: 3 },
  { id: 'spl-mirror-image', archetype: 'Arcane', source: 'box', boxes: ['arcane'], complexity: 4 },
  { id: 'kng-battlemage', archetype: 'Arcane', source: 'box', boxes: ['arcane'], atk: 104, hpc: 84, complexity: 3 },
  { id: 'spl-arcane-barrier', archetype: 'Arcane', source: 'box', boxes: ['arcane'], complexity: 2 },
  { id: 'kng-apprentice-mage', archetype: 'Arcane', source: 'box', boxes: ['arcane'], atk: 102, hpc: 81, complexity: 4 },
  { id: 'spl-spark', archetype: 'Arcane', source: 'box', boxes: ['arcane'], complexity: 2 },
  { id: 'und-duchess-nyx', archetype: 'Phantoms', source: 'box', boxes: ['phantoms'], atk: 112, hpc: 85, complexity: 6 },
  { id: 'und-wraith-prince', archetype: 'Phantoms', source: 'box', boxes: ['phantoms'], atk: 93, hpc: 96, complexity: 4 },
  { id: 'und-banshee', archetype: 'Phantoms', source: 'box', boxes: ['phantoms'], atk: 98, hpc: 92, complexity: 5 },
  { id: 'spl-cursed-ground', archetype: 'Phantoms', source: 'box', boxes: ['phantoms', 'wither'], complexity: 3 },
  { id: 'und-spectral-assassin', archetype: 'Phantoms', source: 'box', boxes: ['phantoms'], atk: 108, hpc: 81, complexity: 3 },
  { id: 'und-shade-thief', archetype: 'Phantoms', source: 'box', boxes: ['phantoms'], atk: 89, hpc: 91, complexity: 3 },
  { id: 'spl-ghost-lantern', archetype: 'Phantoms', source: 'box', boxes: ['phantoms'], complexity: 1 },
  { id: 'und-grave-sage', archetype: 'Spells (shared)', source: 'box', boxes: ['arcane', 'phantoms'], atk: 108, hpc: 81, complexity: 4 },
  { id: 'inf-kathra', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound'], atk: 115, hpc: 82, complexity: 5 },
  { id: 'inf-blood-demon', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound'], atk: 124, hpc: 73, complexity: 4 },
  { id: 'spl-flesh-altar', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound'], complexity: 3 },
  { id: 'spl-blood-pact', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound'], complexity: 3 },
  { id: 'inf-blood-imp', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound'], atk: 108, hpc: 81, complexity: 2 },
  { id: 'inf-blood-thrall', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound', 'hellpack'], atk: 97, hpc: 85, complexity: 2 },
  { id: 'spl-dark-ritual', archetype: 'Bloodbound', source: 'box', boxes: ['bloodbound'], complexity: 3 },
  { id: 'spl-soul-burn', archetype: 'Graveyard hate (shared)', source: 'box', boxes: ['wither', 'bloodbound'], complexity: 3 },
  { id: 'kng-saint-aveline', archetype: 'Crusade', source: 'box', boxes: ['crusade'], atk: 100, hpc: 94, complexity: 5 },
  { id: 'spl-fortify', archetype: 'Crusade', source: 'box', boxes: ['crusade'], complexity: 3 },
  { id: 'kng-crusader-champion', archetype: 'Crusade', source: 'box', boxes: ['crusade'], atk: 108, hpc: 85, complexity: 4 },
  { id: 'spl-oath-blade', archetype: 'Crusade', source: 'box', boxes: ['crusade'], complexity: 3 },
  { id: 'kng-standard-bearer', archetype: 'Crusade', source: 'box', boxes: ['crusade'], atk: 101, hpc: 86, complexity: 3 },
  { id: 'spl-consecrate', archetype: 'Crusade', source: 'box', boxes: ['crusade', 'vanguard', 'arcane'], complexity: 1 },
  { id: 'kng-oath-acolyte', archetype: 'Crusade', source: 'box', boxes: ['crusade'], atk: 90, hpc: 90, complexity: 2 },
  { id: 'spl-giants-bane', archetype: 'Removal (shared)', source: 'box', boxes: ['crusade'], complexity: 2 },
  { id: 'spl-death-wave', archetype: 'Sweeper (shared)', source: 'box', boxes: ['wither'], complexity: 2 },
  { id: 'und-plague-mother', archetype: 'Wither', source: 'box', boxes: ['wither'], atk: 92, hpc: 100, complexity: 4 },
  { id: 'und-blightcaster', archetype: 'Wither', source: 'box', boxes: ['wither'], atk: 96, hpc: 94, complexity: 4 },
  { id: 'und-withering-lich', archetype: 'Wither', source: 'box', boxes: ['wither'], atk: 103, hpc: 88, complexity: 3 },
  { id: 'und-grave-knight', archetype: 'Wither', source: 'box', boxes: ['wither', 'bone-legion'], atk: 100, hpc: 87, complexity: 4 },
  { id: 'spl-stasis-field', archetype: 'Wither', source: 'box', boxes: ['wither'], complexity: 3 },
  { id: 'und-rot-ghoul', archetype: 'Wither', source: 'box', boxes: ['wither', 'bone-legion', 'bloodbound'], atk: 99, hpc: 83, complexity: 2 },
  { id: 'spl-enfeeble', archetype: 'Wither', source: 'box', boxes: ['wither'], complexity: 2 },
  { id: 'inf-flame-herald', archetype: 'Hellfire', source: 'structure-deck', structureDeck: 'sd-hellfire', atk: 98, hpc: 88, complexity: 2 },
  { id: 'spl-meteor', archetype: 'Hellfire', source: 'structure-deck', structureDeck: 'sd-hellfire', complexity: 3 },
  { id: 'kng-banner-knight', archetype: 'Crusade', source: 'structure-deck', structureDeck: 'sd-crusade', atk: 104, hpc: 84, complexity: 3 },
  { id: 'spl-reliquary-blade', archetype: 'Crusade', source: 'structure-deck', structureDeck: 'sd-crusade', complexity: 2 },
  { id: 'und-bone-dragon', archetype: 'Bone Legion', source: 'structure-deck', structureDeck: 'sd-bone-legion', atk: 92, hpc: 97, complexity: 3 },
  { id: 'und-barrow-knight', archetype: 'Bone Legion', source: 'structure-deck', structureDeck: 'sd-bone-legion', atk: 101, hpc: 86, complexity: 4 },
  { id: 'inf-pack-warden', archetype: 'Hellpack', source: 'event', atk: 103, hpc: 84, complexity: 2 },
  { id: 'spl-oath-of-vengeance', archetype: 'Flex', source: 'event', complexity: 3 },
  { id: 'kng-arcane-knight', archetype: 'Vanguard / Arcane bridge', source: 'event', atk: 106, hpc: 86, complexity: 3 },
  { id: 'und-ashen-revenant', archetype: 'Bloodbound / Bone Legion bridge', source: 'event', atk: 97, hpc: 93, complexity: 4 },
  { id: 'und-night-courier', archetype: 'Phantoms', source: 'event', atk: 94, hpc: 91, complexity: 5 },
  { id: 'und-grave-tyrant', archetype: 'Wither', source: 'event', atk: 104, hpc: 91, complexity: 4 },
];

const BY_ID = new Map(LAUNCH_ROSTER.map((c) => [c.id, c]));

/** Every card id in the launch set (116), in roster order. */
export const LAUNCH_CARD_IDS: readonly string[] = LAUNCH_ROSTER.map((c) => c.id);

export function launchInfo(cardId: string): LaunchCardInfo | null {
  return BY_ID.get(cardId) ?? null;
}

export function isLaunchCard(cardId: string): boolean {
  return BY_ID.has(cardId);
}

/** Printed ATK of every launch Unit (stats.ts reads it before the Power line + offset). */
export const LAUNCH_ATK: Readonly<Record<string, number>> = Object.fromEntries(LAUNCH_ROSTER.filter((c) => c.atk !== undefined).map((c) => [c.id, c.atk!]));
