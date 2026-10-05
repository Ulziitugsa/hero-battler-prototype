import { beforeEach, describe, expect, it } from 'vitest';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems, setTickets } from '../economy/economy';
import { getCard } from '../cards';
import { LAUNCH_ROSTER } from '../cards/launchRoster';
import { BOX_PULL_GEMS } from '../economy/config';
import { ARCHETYPE_BOXES, ARCHETYPE_BOX_IDS, BOX_FACTION_GROUPS, boxRarityTotals, boxSize, boxesWithCard, fullBoxContents, getArchetypeBox, type ArchetypeBoxId } from './archetypeBoxes';
import { ARCHETYPE_BOXES_STORAGE_KEY, boxCardsRemaining, boxContents, boxNextCardOdds, canPull, canRestockBox, getActiveBoxId, getBoxPool, getBoxesState, previewPulls, pullFromBox, reloadArchetypeBoxes, restockBox, totalBoxPulls } from './boxPool';
import { boxPullPrice, boxPullTickets, buyBoxPulls, canAffordAPull, hasOpenedPacks } from './boxProduct';

// The nine archetype Boxes of the launch set (docs/BOX-ARCHITECTURE.md): composition, finite draws without replacement,
// restock, and the pull product (1 pull = 1 card, a 10-pull = 10 cards, a Ticket = 1 pull).

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadCollection();
  setCollection({});
  reloadArchetypeBoxes();
});

const ownedTotal = () => Object.values(getCollection()).reduce((sum, n) => sum + n, 0);
/** Empties a Box with free pulls (no Gems involved), 10 at a time while it can. */
function emptyBox(id: ArchetypeBoxId): string[] {
  const drawn: string[] = [];
  while (boxCardsRemaining(id) > 0) drawn.push(...pullFromBox(id, boxCardsRemaining(id) >= 10 ? 10 : 1).pulls.map((p) => p.cardId));
  return drawn;
}

describe('the nine archetype Boxes', () => {
  it('are nine Boxes in three faction groups of three, each id once', () => {
    expect(ARCHETYPE_BOX_IDS).toHaveLength(9);
    expect(BOX_FACTION_GROUPS.map((g) => g.name)).toEqual(['Kingdom', 'Undead', 'Infernal']);
    expect(BOX_FACTION_GROUPS.flatMap((g) => g.boxIds).sort()).toEqual([...ARCHETYPE_BOX_IDS].sort());
    for (const group of BOX_FACTION_GROUPS) for (const id of group.boxIds) expect(getArchetypeBox(id).faction).toBe(group.faction);
  });

  it('have the approved sizes (not normalized): 25 to 33 cards', () => {
    expect(Object.fromEntries(ARCHETYPE_BOX_IDS.map((id) => [id, boxSize(id)]))).toEqual({ vanguard: 33, arcane: 30, crusade: 25, 'bone-legion': 26, phantoms: 28, wither: 27, hellpack: 28, hellfire: 29, bloodbound: 30 });
  });

  it('hold each card at the copy shape L1 E2 R3 C4', () => {
    for (const id of ARCHETYPE_BOX_IDS) for (const [cardId, n] of Object.entries(fullBoxContents(id))) expect(n).toBe({ legendary: 1, epic: 2, rare: 3, common: 4 }[getCard(cardId).rarity]);
  });

  it('hold exactly one Legendary each: the archetype flagship, and every banner card is inside', () => {
    for (const box of ARCHETYPE_BOXES) {
      expect(boxRarityTotals(box.id).legendary).toBe(1);
      expect(getCard(box.flagshipId).rarity).toBe('legendary');
      expect(fullBoxContents(box.id)[box.flagshipId]).toBe(1);
      expect(box.bannerCardIds[0]).toBe(box.flagshipId);
      for (const id of box.bannerCardIds) expect(fullBoxContents(box.id)[id]).toBeGreaterThan(0);
    }
  });

  it('draw only Box cards: no Core, Structure Deck debut or event card is in any Box', () => {
    for (const row of LAUNCH_ROSTER) {
      if (row.source === 'box') expect(boxesWithCard(row.id).length).toBeGreaterThan(0);
      else expect(boxesWithCard(row.id)).toEqual([]);
    }
  });
});

describe('finite pulls without replacement', () => {
  it('a pull is exactly 1 card and a 10-pull exactly 10, granted to the collection and taken out of the Box', () => {
    expect(pullFromBox('vanguard', 1).pulls).toHaveLength(1);
    expect(pullFromBox('vanguard', 10).pulls).toHaveLength(10);
    expect(ownedTotal()).toBe(11);
    expect(boxCardsRemaining('vanguard')).toBe(33 - 11);
    expect(getBoxPool('vanguard').pulls).toBe(11);
  });

  it('emptying a Box collects every copy in it exactly once, the Legendary included', () => {
    for (const id of ARCHETYPE_BOX_IDS) {
      const drawn = emptyBox(id);
      const counts: Record<string, number> = {};
      for (const c of drawn) counts[c] = (counts[c] ?? 0) + 1;
      expect(counts).toEqual(fullBoxContents(id));
      expect(drawn).toContain(getArchetypeBox(id).flagshipId);
    }
  });

  it('each Box tracks its own remaining cards: pulling one leaves the other eight untouched', () => {
    pullFromBox('hellfire', 10);
    for (const id of ARCHETYPE_BOX_IDS) expect(boxCardsRemaining(id)).toBe(id === 'hellfire' ? boxSize(id) - 10 : boxSize(id));
  });

  it('a 10-pull needs 10 cards left: with fewer, only single pulls remain until the Box is empty', () => {
    while (boxCardsRemaining('crusade') > 9) pullFromBox('crusade', 1);
    expect(canPull('crusade', 10)).toBe(false);
    expect(canPull('crusade', 1)).toBe(true);
    expect(() => pullFromBox('crusade', 10)).toThrow();
  });

  it('reports exact next-card odds and contents from what is left', () => {
    const odds = boxNextCardOdds('wither');
    expect(odds.legendary).toBeCloseTo(1 / boxSize('wither'));
    expect(odds.common + odds.rare + odds.epic + odds.legendary).toBeCloseTo(1);
    const flagship = getArchetypeBox('wither').flagshipId;
    emptyBox('wither');
    expect(boxContents('wither').find((l) => l.cardId === flagship)).toMatchObject({ remaining: 0, total: 1 });
  });

  it('draws are reproducible from the saved state, and the preview matches the real pull', () => {
    const preview = previewPulls('arcane', 10);
    expect(pullFromBox('arcane', 10).pulls.map((p) => p.cardId)).toEqual(preview);
  });

  it('persists every Box and repairs a tampered save (never more copies than a full Box)', () => {
    pullFromBox('phantoms', 10);
    reloadArchetypeBoxes();
    expect(boxCardsRemaining('phantoms')).toBe(boxSize('phantoms') - 10);
    const raw = JSON.parse(localStorage.getItem(ARCHETYPE_BOXES_STORAGE_KEY)!);
    raw.boxes.phantoms.remaining['und-duchess-nyx'] = 7;
    raw.boxes.phantoms.remaining['not-a-card'] = 3;
    localStorage.setItem(ARCHETYPE_BOXES_STORAGE_KEY, JSON.stringify(raw));
    reloadArchetypeBoxes();
    expect(getBoxPool('phantoms').remaining['und-duchess-nyx']).toBeLessThanOrEqual(1);
    expect(getBoxPool('phantoms').remaining['not-a-card']).toBeUndefined();
  });
});

describe('restock', () => {
  it('is only possible once the Box is empty', () => {
    expect(canRestockBox('bone-legion')).toBe(false);
    expect(() => restockBox('bone-legion')).toThrow();
    pullFromBox('bone-legion', 10);
    expect(canRestockBox('bone-legion')).toBe(false);
    emptyBox('bone-legion');
    expect(canRestockBox('bone-legion')).toBe(true);
  });

  it('restores the original contents, keeps the collection, gives nothing and counts the restock', () => {
    emptyBox('hellpack');
    const owned = { ...getCollection() };
    const economy = getEconomy();
    restockBox('hellpack');
    expect(getBoxPool('hellpack').remaining).toEqual(fullBoxContents('hellpack'));
    expect(getBoxPool('hellpack').restockCount).toBe(1);
    expect(getBoxPool('hellpack').pulls).toBe(boxSize('hellpack'));
    expect(getCollection()).toEqual(owned);
    expect(getEconomy()).toEqual(economy);
    expect(emptyBox('hellpack').sort()).toEqual(Object.entries(fullBoxContents('hellpack')).flatMap(([id, n]) => Array.from({ length: n }, () => id)).sort());
  });
});

describe('the pull product', () => {
  it('prices a 10-pull at exactly ten pulls, from the configurable placeholder', () => {
    expect(boxPullPrice(1)).toBe(BOX_PULL_GEMS);
    expect(boxPullPrice(10)).toBe(BOX_PULL_GEMS * 10);
    expect(boxPullTickets(1)).toBe(1);
    expect(boxPullTickets(10)).toBe(10);
  });

  it('spends Gems, pulls from the chosen Box and makes it the active Box', () => {
    setGems(boxPullPrice(10));
    const result = buyBoxPulls('bloodbound', 10);
    expect(result.ok && result.opening.pulls).toHaveLength(10);
    expect(getEconomy().gems).toBe(0);
    expect(boxCardsRemaining('bloodbound')).toBe(boxSize('bloodbound') - 10);
    expect(getActiveBoxId()).toBe('bloodbound');
    expect(totalBoxPulls()).toBe(10);
  });

  it('a Pack Ticket pays for exactly one pull, drawn like a bought one', () => {
    setTickets(1);
    const preview = previewPulls('vanguard', 1);
    const result = buyBoxPulls('vanguard', 1, 'tickets');
    expect(result.ok && result.opening.pulls.map((p) => p.cardId)).toEqual(preview);
    expect(getEconomy().tickets).toBe(0);
    expect(buyBoxPulls('vanguard', 1, 'tickets')).toEqual({ ok: false, reason: 'not-enough-tickets' });
  });

  it('charges nothing when the player cannot pay or the Box cannot supply the pull', () => {
    setGems(boxPullPrice(1) - 1);
    expect(buyBoxPulls('arcane', 1)).toEqual({ ok: false, reason: 'not-enough-gems' });
    expect(boxCardsRemaining('arcane')).toBe(boxSize('arcane'));
    while (boxCardsRemaining('arcane') > 5) pullFromBox('arcane', 1);
    setGems(999_999);
    expect(buyBoxPulls('arcane', 10)).toEqual({ ok: false, reason: 'sold-out' });
    expect(getEconomy().gems).toBe(999_999);
  });

  it('canAffordAPull and hasOpenedPacks follow Gems, Tickets and pulls', () => {
    expect(canAffordAPull({ gems: boxPullPrice(1), tickets: 0 })).toBe(true);
    expect(canAffordAPull({ gems: 0, tickets: 1 })).toBe(true);
    expect(canAffordAPull({ gems: boxPullPrice(1) - 1, tickets: 0 })).toBe(false);
    expect(hasOpenedPacks(getEconomy())).toBe(false);
    pullFromBox('vanguard', 1);
    expect(hasOpenedPacks(getEconomy())).toBe(true);
  });

  it('a save with no Box state reads as nine full Boxes with Vanguard active', () => {
    expect(getBoxesState().boxes).toEqual({});
    expect(getActiveBoxId()).toBe('vanguard');
    for (const id of ARCHETYPE_BOX_IDS) expect(boxCardsRemaining(id)).toBe(boxSize(id));
  });
});
