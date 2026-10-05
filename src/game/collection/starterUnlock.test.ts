import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../cards/starterDecks';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { getCardAcquisitionSources, getUnavailableCards, describeAcquisition, primaryAcquisitionLabel, acquisitionSummary } from './acquisition';
import { LAUNCH_ROSTER } from '../cards/launchRoster';
import { EVENT_CARD_PLANS, launchEventCardIds } from '../cards/eventCards';
import { CORE_FACTIONS, corePackage } from '../core/corePackages';
import { buildStarterCollection } from './starterCollection';
import { getStarterDeckUnlockProgress, getStarterProgressUpdate, isStarterDeckUnlocked } from './starterUnlock';
import { CHAPTER_1 } from '../campaign/chapter1';

// A fresh profile (no Core record yet) holds the Kingdom Core package provisionally (core/coreAccess.ts).
const fresh = buildStarterCollection();

describe('starter deck unlock progress', () => {
  it('Kingdom is unlocked on a fresh profile; Undead and Infernal are locked', () => {
    expect(isStarterDeckUnlocked('starter-kingdom', fresh)).toBe(true);
    expect(isStarterDeckUnlocked('starter-undead', fresh)).toBe(false);
    expect(isStarterDeckUnlocked('starter-infernal', fresh)).toBe(false);
  });
  it('is not a starter deck for custom ids', () => {
    expect(getStarterDeckUnlockProgress('deck-123', fresh)).toBeNull();
    expect(isStarterDeckUnlocked('deck-123', fresh)).toBe(false);
  });
  it('counts copies collected toward the deck, capped at what each card needs', () => {
    const p0 = getStarterDeckUnlockProgress('starter-undead', fresh)!;
    expect(p0).toMatchObject({ collected: 0, total: 15, unlocked: false, name: 'Undead Starter' });
    expect(p0.requirements).toHaveLength(9);
    const p1 = getStarterDeckUnlockProgress('starter-undead', { ...fresh, 'und-bone-soldier': 1, 'und-ghoul-brute': 5 })!;
    expect(p1.collected).toBe(1 + 2); // 1 of 2 Bone Soldier + Ghoul Brute capped at the 2 needed
    expect(p1.requirements.find((r) => r.cardId === 'und-bone-soldier')).toMatchObject({ have: 1, need: 2, met: false });
    expect(p1.requirements.find((r) => r.cardId === 'und-ghoul-brute')).toMatchObject({ have: 5, need: 2, met: true });
  });
  it('exact copy counts matter: one short is still locked, the final copy unlocks it', () => {
    const all: Record<string, number> = { ...fresh };
    for (const id of STARTER_DECKS.undead) all[id] = 1;
    // one copy of everything: 2-copy cards are short
    expect(isStarterDeckUnlocked('starter-undead', all)).toBe(false);
    const nearly = { ...all, 'und-bone-soldier': 2, 'und-cursed-warrior': 2, 'und-crypt-warden': 2, 'und-dark-priest': 2, 'und-ghoul-brute': 2, 'spl-raise-fallen': 1 };
    expect(isStarterDeckUnlocked('starter-undead', nearly)).toBe(false);
    expect(getStarterDeckUnlockProgress('starter-undead', nearly)!.collected).toBe(14);
    expect(isStarterDeckUnlocked('starter-undead', { ...nearly, 'spl-raise-fallen': 2 })).toBe(true);
  });
  it('orders requirements heroes first, rarest first', () => {
    const r = getStarterDeckUnlockProgress('starter-undead', fresh)!.requirements;
    expect(r[0].cardId).toBe('und-vharos');
    expect(r[r.length - 1].cardId.startsWith('spl-')).toBe(true);
  });
  it('progress update flags the grant that completes a deck, and ignores unlocked decks', () => {
    const before = { ...fresh };
    for (const id of STARTER_DECKS.undead) before[id] = STARTER_DECKS.undead.filter((x) => x === id).length;
    before['und-vharos'] = 0;
    const after = { ...before, 'und-vharos': 1 };
    expect(getStarterProgressUpdate('und-vharos', before, after)).toMatchObject({ deckId: 'starter-undead', unlockedNow: true, collected: 15, total: 15 });
    expect(getStarterProgressUpdate('und-vharos', after, { ...after, 'und-vharos': 2 })).toBeNull(); // already unlocked
    expect(getStarterProgressUpdate('kng-archer', fresh, { ...fresh, 'kng-archer': 3 })).toBeNull(); // Kingdom already unlocked
  });
});

describe('acquisition coverage', () => {
  it('every roster card has a source: Core, Campaign, a Box, a Structure Deck, or a planned event source', () => {
    expect(getUnavailableCards()).toEqual([]);
    for (const id of PLAYTEST_ROSTER) {
      const kinds = getCardAcquisitionSources(id).map((s) => s.kind);
      expect(kinds.length, id).toBeGreaterThan(0);
      expect(kinds.every((k) => k === 'unavailable'), `${id} has no acquisition path`).toBe(false);
    }
  });
  it('sources follow the launch roster: Core packages, archetype Boxes (headline first), Structure Deck debuts, planned event cards', () => {
    expect(getCardAcquisitionSources('kng-paladin')).toEqual([{ kind: 'core', faction: 'kingdom' }]);
    expect(getCardAcquisitionSources('und-vharos')).toEqual([{ kind: 'core', faction: 'undead' }, { kind: 'campaign', nodeId: 'boss-grave-tyrant', copies: 1 }]);
    expect(getCardAcquisitionSources('und-grave-knight').flatMap((s) => (s.kind === 'box' ? [s.boxId] : []))).toEqual(['wither', 'bone-legion']); // headline Box first
    expect(getCardAcquisitionSources('spl-meteor')).toEqual([{ kind: 'structure-deck', deckId: 'sd-hellfire' }]);
    expect(getCardAcquisitionSources('und-grave-tyrant')).toEqual([{ kind: 'planned', note: 'Campaign boss reward (a later chapter)' }]);
    for (const row of LAUNCH_ROSTER) {
      const kinds = getCardAcquisitionSources(row.id).map((s) => s.kind);
      if (row.source === 'core') expect(kinds[0], row.id).toBe('core');
      if (row.source === 'box') expect(kinds, row.id).toContain('box');
      if (row.source === 'structure-deck') expect(kinds, row.id).toContain('structure-deck');
      if (row.source === 'event') expect(kinds, row.id).toContain('planned');
    }
    // The retired Moonwell Summon and Moonfall Box are no card source anywhere.
    for (const id of PLAYTEST_ROSTER) expect(JSON.stringify(getCardAcquisitionSources(id)), id).not.toMatch(/summon|moonfall/i);
    const nodeIds = new Set(CHAPTER_1.nodes.map((n) => n.id));
    for (const id of PLAYTEST_ROSTER) for (const s of getCardAcquisitionSources(id)) if (s.kind === 'campaign') expect(nodeIds.has(s.nodeId)).toBe(true);
  });
  it('the event card registry covers exactly the roster\'s event cards (a TODO until their sources are built)', () => {
    expect(EVENT_CARD_PLANS.map((p) => p.cardId).sort()).toEqual(launchEventCardIds().sort());
    expect(launchEventCardIds()).toHaveLength(6);
  });
  it('a card with no path at all is reported as unavailable, explicitly', () => {
    expect(getCardAcquisitionSources('not-a-real-card')).toEqual([{ kind: 'unavailable' }]);
    expect(describeAcquisition({ kind: 'unavailable' })).toBe('Not obtainable yet');
  });
  it('resolves player-facing labels without ids', () => {
    expect(primaryAcquisitionLabel('kng-archer')).toBe('Core · Kingdom');
    expect(primaryAcquisitionLabel('spl-mirror-image')).toBe('Arcane Box');
    expect(primaryAcquisitionLabel('kng-banner-knight')).toBe('Structure Deck · Crusade');
    expect(acquisitionSummary('und-grave-sage')).toBe('Arcane Box, Phantoms Box');
    expect(primaryAcquisitionLabel('und-night-courier')).toBe('Event or progression reward · coming later');
    for (const id of PLAYTEST_ROSTER) expect(acquisitionSummary(id), id).not.toMatch(/[a-z]+-[a-z]+-|undefined/);
  });
  it('every starter deck is owned outright by its faction\'s Core package', () => {
    for (const faction of CORE_FACTIONS) {
      const pkg = corePackage(faction);
      for (const id of new Set(STARTER_DECKS[faction])) expect(pkg[id], id).toBeGreaterThanOrEqual(STARTER_DECKS[faction].filter((x) => x === id).length);
      expect(isStarterDeckUnlocked(`starter-${faction}`, pkg)).toBe(true);
    }
  });
});
