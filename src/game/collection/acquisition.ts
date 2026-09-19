import { CHAPTER_1 } from '../campaign/chapter1';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { buildStarterCollection } from './starterCollection';

// Where every collectible card comes from - the single source of truth the UI reads. Sources are stable
// ids (a stage id, a region id), never display strings; labels are derived in describeAcquisition().

export type AcquisitionSource =
  | { kind: 'starter' }
  | { kind: 'campaign'; nodeId: string; copies: number }
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
    case 'future':
      return 'Future region';
    default:
      return 'Not obtainable yet';
  }
}

/** The one line to show on a card: the best real source (starter, then the first Campaign stage), else the parked/unavailable note. */
export function primaryAcquisitionLabel(cardId: string): string {
  const sources = getCardAcquisitionSources(cardId);
  const best = sources.find((s) => s.kind === 'starter') ?? sources.find((s) => s.kind === 'campaign') ?? sources[0];
  return describeAcquisition(best);
}
