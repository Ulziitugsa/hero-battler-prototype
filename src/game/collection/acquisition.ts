import { CHAPTER_1 } from '../campaign/chapter1';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { buildStarterCollection } from './starterCollection';
import { isCampaignExclusive } from './exclusives';
import { bannersFor } from '../summon/pool';
import { getBanner } from '../summon/banners';

// Where every collectible card comes from - the single source of truth the UI reads. Sources are stable
// ids (a stage id, a region id), never display strings; labels are derived in describeAcquisition().

export type AcquisitionSource =
  | { kind: 'starter' }
  | { kind: 'campaign'; nodeId: string; copies: number }
  /** One summon banner that can pull the card (see summon/banners.ts). */
  | { kind: 'summon'; bannerId: string }
  /** Intentionally not obtainable in the current prototype; planned for a later region. */
  | { kind: 'future'; regionId: string }
  | { kind: 'unavailable' };

/**
 * Cards with no source in Chapter 1 that are explicitly parked for a later region. Adding a card here
 * is a deliberate decision - a card missing from BOTH here and the Campaign/starter data shows up in
 * getUnavailableCards() (and fails the coverage test) instead of silently being impossible to obtain.
 */
export const FUTURE_REGION_CARDS: Readonly<Record<string, string>> = {
  // Region 2 - Grave Country (Undead / Kingdom utility)
  'spl-cursed-ground': 'region-2',
  'spl-war-cry': 'region-2',
  'spl-dispel': 'region-2',
  'spl-fortify': 'region-2',
  // Region 3 - The Cinder Coast (the Infernal path)
  'inf-flame-imp': 'region-3',
  'inf-cultist': 'region-3',
  'inf-pit-fiend': 'region-3',
  'inf-hellhound': 'region-3',
  'inf-blood-demon': 'region-3',
  'inf-infernal-lord': 'region-3',
  'spl-weakness': 'region-3',
  'spl-fireball': 'region-3',
  'spl-soul-burn': 'region-3',
  'spl-burning-ground': 'region-3',
  'spl-siege-fire': 'region-3',
  // Card-pool expansion: not in any current banner or Campaign reward. Each group is parked for the banner
  // that will carry its archetype (dev "unlock all" still grants them for playtesting).
  'kng-apprentice-mage': 'banner-arcane',
  'kng-archmage-vael': 'banner-arcane',
  'und-grave-sage': 'banner-arcane',
  'spl-aegis-ward': 'banner-arcane',
  'spl-ward-circle': 'banner-arcane',
  'spl-stasis-field': 'banner-arcane',
  'spl-arcane-bolt': 'banner-arcane',
  'kng-null-templar': 'banner-mage-slayer',
  'inf-runebreaker': 'banner-mage-slayer',
  'inf-packhound': 'banner-beast',
  'inf-alpha-hound': 'banner-beast',
  'und-shade-thief': 'banner-trickster',
  'und-wraith-prince': 'banner-trickster',
  'inf-mirage-imp': 'banner-trickster',
  'spl-giants-bane': 'banner-general',
  'spl-blood-pact': 'banner-general',
};

/** Every Campaign card reward: which stage gives which card, and how many copies. */
function campaignSources(): Map<string, AcquisitionSource[]> {
  const map = new Map<string, AcquisitionSource[]>();
  for (const node of CHAPTER_1.nodes) {
    const reward = node.encounter?.firstClearReward ?? node.reward;
    if (!reward?.cardId) continue;
    const list = map.get(reward.cardId) ?? [];
    list.push({ kind: 'campaign', nodeId: node.id, copies: reward.count ?? 1 });
    map.set(reward.cardId, list);
  }
  return map;
}

/** All the ways a card can be obtained, starter first. Never empty: a card with no path reports [{ kind: 'unavailable' }]. */
export function getCardAcquisitionSources(cardId: string): AcquisitionSource[] {
  const out: AcquisitionSource[] = [];
  if ((buildStarterCollection()[cardId] ?? 0) > 0) out.push({ kind: 'starter' });
  out.push(...(campaignSources().get(cardId) ?? []));
  for (const b of bannersFor(cardId)) out.push({ kind: 'summon', bannerId: b.id });
  const region = FUTURE_REGION_CARDS[cardId];
  if (region) out.push({ kind: 'future', regionId: region });
  return out.length > 0 ? out : [{ kind: 'unavailable' }];
}

/** Roster cards that can't be obtained and aren't explicitly parked - should always be empty. */
export function getUnavailableCards(): string[] {
  return PLAYTEST_ROSTER.filter((id) => getCardAcquisitionSources(id).every((s) => s.kind === 'unavailable'));
}

/** Player-facing line for a source. */
export function describeAcquisition(source: AcquisitionSource): string {
  switch (source.kind) {
    case 'starter':
      return 'Starter collection';
    case 'campaign': {
      const name = CHAPTER_1.nodes.find((n) => n.id === source.nodeId)?.name ?? 'The Ashen Road';
      return `Campaign · ${name}`;
    }
    case 'summon':
      return `Summon · ${getBanner(source.bannerId)?.name ?? 'Banner'}`;
    case 'future':
      return 'Future region';
    default:
      return 'Not obtainable yet';
  }
}

/**
 * Every real way to get a card, as one line: "Campaign · Broken Palisade / Summon · Gravebound", "Summon · Infernal Hunt / Future region",
 * "Campaign exclusive · Grave Tyrant". "Future region" only appears alongside real sources (or alone if parked).
 */
export function acquisitionSummary(cardId: string): string {
  const sources = getCardAcquisitionSources(cardId);
  const parts: string[] = [];
  const starter = sources.find((s) => s.kind === 'starter');
  const campaign = sources.find((s) => s.kind === 'campaign');
  if (starter) parts.push(describeAcquisition(starter));
  if (campaign) {
    const line = describeAcquisition(campaign);
    parts.push(isCampaignExclusive(cardId) && !sources.some((s) => s.kind === 'summon') ? line.replace('Campaign ·', 'Campaign exclusive ·') : line);
  }
  const banners = sources.flatMap((s) => (s.kind === 'summon' ? [getBanner(s.bannerId)?.name ?? 'Banner'] : []));
  if (banners.length > 0) parts.push(`Summon · ${banners.join(', ')}`);
  if (sources.some((s) => s.kind === 'future')) parts.push('Future region');
  return parts.length > 0 ? parts.join(' / ') : describeAcquisition({ kind: 'unavailable' });
}

/** The one line to show on a card: the best real source (starter, then the first Campaign stage), else the parked/unavailable note. */
export function primaryAcquisitionLabel(cardId: string): string {
  const sources = getCardAcquisitionSources(cardId);
  const best = sources.find((s) => s.kind === 'starter') ?? sources.find((s) => s.kind === 'campaign') ?? sources[0];
  return describeAcquisition(best);
}
