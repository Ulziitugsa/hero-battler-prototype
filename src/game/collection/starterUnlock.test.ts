import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../cards/starterDecks';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { getCardAcquisitionSources, getUnavailableCards, describeAcquisition, primaryAcquisitionLabel, FUTURE_REGION_CARDS } from './acquisition';
import { buildStarterCollection } from './starterCollection';
import { getStarterDeckUnlockProgress, getStarterProgressUpdate, isStarterDeckUnlocked } from './starterUnlock';
import { CHAPTER_1 } from '../campaign/chapter1';

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
    expect(p0.requirements).toHaveLength(8);
    const p1 = getStarterDeckUnlockProgress('starter-undead', { ...fresh, 'und-bone-soldier': 1, 'und-mira': 5 })!;
    expect(p1.collected).toBe(1 + 2); // 1 of 2 Bone Soldier + Mira capped at the 2 needed
    expect(p1.requirements.find((r) => r.cardId === 'und-bone-soldier')).toMatchObject({ have: 1, need: 2, met: false });
    expect(p1.requirements.find((r) => r.cardId === 'und-mira')).toMatchObject({ have: 5, need: 2, met: true });
  });
  it('exact copy counts matter: one short is still locked, the final copy unlocks it', () => {
    const all: Record<string, number> = { ...fresh };
    for (const id of STARTER_DECKS.undead) all[id] = 1;
    // one copy of everything: 2-copy cards are short
    expect(isStarterDeckUnlocked('starter-undead', all)).toBe(false);
    const nearly = { ...all, 'und-bone-soldier': 2, 'und-cursed-warrior': 2, 'und-dark-priest': 2, 'und-grave-knight': 2, 'und-mira': 2, 'spl-second-chance': 2, 'spl-raise-fallen': 1 };
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
  it('every roster card has a source: starter, Campaign, or explicitly future', () => {
    expect(getUnavailableCards()).toEqual([]);
    for (const id of PLAYTEST_ROSTER) {
      const kinds = getCardAcquisitionSources(id).map((s) => s.kind);
      expect(kinds.length, id).toBeGreaterThan(0);
      expect(kinds.every((k) => k === 'unavailable'), `${id} has no acquisition path`).toBe(false);
    }
  });
  it('starter cards are starter, Campaign rewards point at real stages, future cards name a region', () => {
    expect(getCardAcquisitionSources('kng-paladin')).toEqual([{ kind: 'starter' }]);
    expect(getCardAcquisitionSources('und-vharos')).toEqual([{ kind: 'campaign', nodeId: 'boss-grave-tyrant', copies: 1 }]);
    expect(getCardAcquisitionSources('inf-infernal-lord')).toEqual([{ kind: 'future', regionId: 'region-3' }]);
    const nodeIds = new Set(CHAPTER_1.nodes.map((n) => n.id));
    for (const id of PLAYTEST_ROSTER) for (const s of getCardAcquisitionSources(id)) if (s.kind === 'campaign') expect(nodeIds.has(s.nodeId)).toBe(true);
  });
  it('a card with no path at all is reported as unavailable, explicitly', () => {
    expect(getCardAcquisitionSources('not-a-real-card')).toEqual([{ kind: 'unavailable' }]);
    expect(describeAcquisition({ kind: 'unavailable' })).toBe('Not obtainable yet');
  });
  it('resolves player-facing labels without ids', () => {
    expect(primaryAcquisitionLabel('kng-archer')).toBe('Starter collection');
    expect(primaryAcquisitionLabel('und-bone-soldier')).toBe('Campaign · Broken Palisade');
    expect(primaryAcquisitionLabel('spl-fireball')).toBe('Future region');
  });
  it('every Undead-starter requirement is fully obtainable in Chapter 1 (copies add up), with no accidental duplicates', () => {
    const need = new Map<string, number>();
    for (const id of STARTER_DECKS.undead) need.set(id, (need.get(id) ?? 0) + 1);
    for (const [id, n] of need) {
      const given = getCardAcquisitionSources(id).reduce((sum, s) => sum + (s.kind === 'campaign' ? s.copies : 0), 0);
      expect(given, id).toBe(n);
    }
  });
  it('the parked-for-later list only contains cards without a Campaign or starter source', () => {
    for (const id of Object.keys(FUTURE_REGION_CARDS)) {
      const kinds = getCardAcquisitionSources(id).map((s) => s.kind);
      expect(kinds).not.toContain('starter');
      expect(kinds).not.toContain('campaign');
    }
  });
});
