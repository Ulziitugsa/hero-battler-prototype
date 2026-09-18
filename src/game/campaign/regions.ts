import type { CampaignRegionDef } from './types';
import { CHAPTER_1 } from './chapter1';

// Nine regions exist in the design's own architecture note; only Region 1 has real content in this
// vertical slice. The other eight are locked placeholders (name + "Clear the road before it" only) so
// the region-select screen reads as a real journey without fabricating eight more chapters of content.
const PLACEHOLDER_NAMES: Record<string, string> = {
  'region-2': 'Grave Country',
  'region-3': 'The Cinder Coast',
  'region-4': 'Hollow Reach',
  'region-5': 'The Salt Wastes',
  'region-6': 'Ember Hold',
  'region-7': 'The Glass March',
  'region-8': 'Wyrmfall',
  'region-9': "The King's Silence",
};

export const REGIONS: CampaignRegionDef[] = [
  {
    id: 'region-1',
    name: 'The Ashen Road',
    blurb: 'Kingdom border country under a falling grey ash. The watchtower still burns; something is walking out of the barrows below it.',
    faction: 'kingdom',
    chapters: [CHAPTER_1],
    locked: false,
  },
  ...Object.entries(PLACEHOLDER_NAMES).map(
    ([id, name], i): CampaignRegionDef => ({
      id,
      name,
      blurb: '',
      faction: i % 2 === 0 ? 'undead' : 'infernal',
      chapters: [],
      locked: true,
      requires: i === 0 ? 'Clear The Ashen Road' : `Clear ${PLACEHOLDER_NAMES[`region-${i + 1}`] ?? 'the region before it'}`,
    }),
  ),
];

export function findRegion(id: string): CampaignRegionDef | undefined {
  return REGIONS.find((r) => r.id === id);
}
