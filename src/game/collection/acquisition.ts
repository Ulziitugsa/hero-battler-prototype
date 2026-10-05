import { CHAPTER_1 } from '../campaign/chapter1';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { getCard } from '../cards';
import { launchInfo } from '../cards/launchRoster';
import { eventCardPlan } from '../cards/eventCards';
import { getArchetypeBox, type ArchetypeBoxId } from '../box/archetypeBoxes';
import { CORE_FACTION_NAMES, isCoreCard } from '../core/corePackages';
import { getStructureDeck } from '../structureDecks/definitions';
import type { StarterFaction } from '../cards/starterDecks';

// Where every collectible card comes from - the single source of truth the UI reads. Sources are stable ids (a
// faction, a stage id, a Box id, a Structure Deck id), never display strings; labels are derived in
// describeAcquisition(). The launch set's sources (cards/launchRoster.ts) are Core, the archetype Boxes, the
// Structure Decks and event / progression rewards; Campaign card rewards come on top.

export type AcquisitionSource =
  /** A free Core package (core/corePackages.ts): the starter faction's, or one unlocked in the Campaign. */
  | { kind: 'core'; faction: StarterFaction }
  | { kind: 'campaign'; nodeId: string; copies: number }
  /** An archetype Box that holds copies of the card (box/archetypeBoxes.ts). */
  | { kind: 'box'; boxId: ArchetypeBoxId }
  /** The Structure Deck the card debuts in. */
  | { kind: 'structure-deck'; deckId: string }
  /** An event / progression card whose source is not live yet (cards/eventCards.ts). */
  | { kind: 'planned'; note: string }
  | { kind: 'unavailable' };

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

/** All the ways a card can be obtained, Core first. Never empty: a card with no path reports [{ kind: 'unavailable' }]. */
export function getCardAcquisitionSources(cardId: string): AcquisitionSource[] {
  const out: AcquisitionSource[] = [];
  const info = launchInfo(cardId);
  if (isCoreCard(cardId)) out.push({ kind: 'core', faction: getCard(cardId).faction as StarterFaction });
  out.push(...(campaignSources().get(cardId) ?? []));
  for (const boxId of info?.boxes ?? []) out.push({ kind: 'box', boxId });
  if (info?.structureDeck) out.push({ kind: 'structure-deck', deckId: info.structureDeck });
  const plan = eventCardPlan(cardId);
  if (plan) out.push({ kind: 'planned', note: plan.note });
  return out.length > 0 ? out : [{ kind: 'unavailable' }];
}

/** Roster cards that can't be obtained and aren't explicitly planned - should always be empty. */
export function getUnavailableCards(): string[] {
  return PLAYTEST_ROSTER.filter((id) => getCardAcquisitionSources(id).every((s) => s.kind === 'unavailable'));
}

/** Player-facing line for a source. */
export function describeAcquisition(source: AcquisitionSource): string {
  switch (source.kind) {
    case 'core':
      return `Core · ${CORE_FACTION_NAMES[source.faction]}`;
    case 'campaign': {
      const name = CHAPTER_1.nodes.find((n) => n.id === source.nodeId)?.name ?? 'The Ashen Road';
      return `Campaign · ${name}`;
    }
    case 'box':
      return getArchetypeBox(source.boxId).name;
    case 'structure-deck':
      return `Structure Deck · ${getStructureDeck(source.deckId)?.name ?? 'Structure Deck'}`;
    case 'planned':
      return `${source.note} · coming later`;
    default:
      return 'Not obtainable yet';
  }
}

/**
 * Every real way to get a card, as one line: "Core · Undead / Campaign · Broken Palisade", "Wither Box, Bone Legion Box",
 * "Structure Deck · Hellfire", "Campaign boss reward (a later chapter) · coming later".
 */
export function acquisitionSummary(cardId: string): string {
  const sources = getCardAcquisitionSources(cardId);
  const parts: string[] = [];
  const core = sources.find((s) => s.kind === 'core');
  const campaign = sources.find((s) => s.kind === 'campaign');
  if (core) parts.push(describeAcquisition(core));
  if (campaign) parts.push(describeAcquisition(campaign));
  const boxes = sources.flatMap((s) => (s.kind === 'box' ? [describeAcquisition(s)] : []));
  if (boxes.length > 0) parts.push(boxes.join(', '));
  for (const s of sources) if (s.kind === 'structure-deck' || s.kind === 'planned') parts.push(describeAcquisition(s));
  return parts.length > 0 ? parts.join(' / ') : describeAcquisition({ kind: 'unavailable' });
}

/** The one line to show on a card: the best real source (Core, then the first Campaign stage, then its Box), else the planned/unavailable note. */
export function primaryAcquisitionLabel(cardId: string): string {
  const sources = getCardAcquisitionSources(cardId);
  const best = sources.find((s) => s.kind === 'core') ?? sources.find((s) => s.kind === 'campaign') ?? sources[0];
  return describeAcquisition(best);
}
