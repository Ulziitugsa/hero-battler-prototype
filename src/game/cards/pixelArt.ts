import { KINGDOM_ROSTER, UNDEAD_ROSTER, INFERNAL_ROSTER } from './roster';

export interface PixelAsset { src: string; columns: number; rows: number; cell: number; frames: number }
const atlas = (faction: string, cell: number): PixelAsset => ({ src: `/art/pixel/${faction}-atlas-v2.png`, columns: 3, rows: 2, cell, frames: 1 });
export const PIXEL_CARD_ART: Record<string, PixelAsset> = Object.fromEntries(
  [['kingdom', KINGDOM_ROSTER], ['undead', UNDEAD_ROSTER], ['infernal', INFERNAL_ROSTER]].flatMap(([faction, ids]) =>
    (ids as string[]).slice(0, 6).map((id, index) => [id, atlas(faction as string, index)])),
);
export const PIXEL_COMPANIONS: Record<string, PixelAsset> = Object.fromEntries(['pip', 'selene', 'aldren'].map(name => [name, { src: `/art/pixel/${name}-idle-8.png`, columns: 4, rows: 2, cell: 0, frames: 8 }]));
// Approved characters become visual identities for existing cards; game IDs/stats stay stable.
PIXEL_CARD_ART['inf-flame-imp'] = PIXEL_COMPANIONS.pip;
PIXEL_CARD_ART['kng-paladin'] = PIXEL_COMPANIONS.selene;
PIXEL_CARD_ART['und-grave-knight'] = PIXEL_COMPANIONS.aldren;

// Spell illustrations share the portrait pipeline so deck, hand and reward art agree.
["spl-power-surge","spl-war-cry","spl-dispel","spl-battle-banner","spl-fortify","spl-aegis-ward","spl-ward-circle","spl-giants-bane","spl-second-chance","spl-raise-fallen","spl-grave-totem","spl-cursed-ground"].forEach((id, cell) => { PIXEL_CARD_ART[id] = { src: '/art/pixel/spell-atlas-a-v2.png', columns: 4, rows: 3, cell, frames: 1 }; });
["spl-hush","spl-stasis-field","spl-weakness","spl-fireball","spl-soul-burn","spl-burning-ground","spl-siege-fire","spl-arcane-bolt","spl-blood-pact"].forEach((id, cell) => { PIXEL_CARD_ART[id] = { src: '/art/pixel/spell-atlas-b-v2.png', columns: 3, rows: 3, cell, frames: 1 }; });


// Explicit identities: roster ordering can change without swapping expansion portraits.
const expansions: Record<string, string[]> = {
  kingdom: ['kng-apprentice-mage', 'kng-archmage-vael', 'kng-spellbreaker', 'kng-null-templar'],
  undead: ['und-grave-sage', 'und-shade-thief', 'und-wraith-prince', 'und-crypt-warden'],
  infernal: ['inf-runebreaker', 'inf-ash-jackal', 'inf-packhound', 'inf-alpha-hound', 'inf-mirage-imp', 'tok-pup'],
};
for (const [faction, ids] of Object.entries(expansions)) {
  ids.forEach((id, cell) => { PIXEL_CARD_ART[id] = { src: `/art/pixel/${faction}-expansion-v2.png`, columns: faction === 'infernal' ? 3 : 2, rows: 2, cell, frames: 1 }; });
}

