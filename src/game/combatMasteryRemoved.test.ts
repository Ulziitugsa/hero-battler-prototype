/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState, Side } from './types';
import { getCard } from './cards';
import { PLAYTEST_ROSTER } from './cards/roster';
import { STARTER_DECKS } from './cards/starterDecks';
import { cardCopyView } from './cards/cardCopy';
import { cardEffects, printedAtk } from './cards/cardPresentation';
import { reloadCollection, setCollection, getCollection, getOwnedCount } from './collection/collection';
import { ASCENSION_STORAGE_KEY, getAscensionState, reloadAscension } from './ascension/store';
import { ascendCard } from './ascension/ascend';
import { reloadEconomy, getGold, setGold } from './economy/economy';
import { reloadHeroLevels, setHeroLevel } from './heroLevel/store';
import { cardAtk, createCardMatch, matchHpContribution, resolveCardRound } from './cardCombat/engine';
import { deckStartingHp, printedStats } from './cardCombat/stats';
import { deckSummary } from './decks/deckSummary';
import { campaignBattleHp, campaignBattlePlan } from './campaign/battleSetup';
import { CHAPTER_1 } from './campaign/chapter1';
import { chooseRankedOpponent } from './ranked/store';
import { RANKED_TIERS } from './ranked/tiers';
import { GameCard } from '../components/card/GameCard';
import { CardInspect } from '../components/card/CardInspect';

// Combat Card Mastery is removed (docs/CARD-COMBAT-DESIGN.md section 7). Every test here runs the same thing twice:
// once on a save with no Mastery history, once on a save where every collectible card carries a historical Mastery V
// record (rank 4, 10 duplicates spent). Nothing a player sees or plays may differ.

function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const M5_SAVE = { version: 1, cards: Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, { rank: 4, duplicatesSpent: 10 }])) };

/** Runs `read` with no Mastery history, then with a Mastery V history on every card, and returns both results. */
function baseAndM5<T>(read: () => T): [T, T] {
  localStorage.removeItem(ASCENSION_STORAGE_KEY);
  reloadAscension();
  const base = read();
  localStorage.setItem(ASCENSION_STORAGE_KEY, JSON.stringify(M5_SAVE));
  reloadAscension();
  expect(getAscensionState().cards['kng-paladin']).toEqual({ rank: 4, duplicatesSpent: 10 });
  const m5 = read();
  return [base, m5];
}

const UNITS = PLAYTEST_ROSTER.filter((id) => getCard(id).type === 'hero');
const code = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadCollection();
  reloadAscension();
  reloadEconomy();
  reloadHeroLevels();
});

describe('combat Card Mastery is removed: a historical Mastery V copy plays exactly like a base copy', () => {
  it('1. identical ATK', () => {
    const [base, m5] = baseAndM5(() => UNITS.map((id) => [printedAtk(id), cardAtk(id), printedStats(id)!.atk]));
    expect(m5).toEqual(base);
  });

  it('2. identical HP Contribution (Collection copy and battle copy)', () => {
    setCollection({ ...getCollection(), ...Object.fromEntries(UNITS.map((id) => [id, 3])) });
    const [base, m5] = baseAndM5(() => UNITS.map((id) => [cardCopyView(id).hpContribution, matchHpContribution(id)]));
    expect(m5).toEqual(base);
    for (const [i, id] of UNITS.entries()) expect(base[i], id).toEqual([printedStats(id)!.hpc, printedStats(id)!.hpc]);
  });

  it('3. the same deck has the same Starting HP everywhere: Deck Builder, Battle Setup, Home, Campaign, battle', () => {
    const decks = [...Object.values(STARTER_DECKS), ...RANKED_TIERS.flatMap((t) => t.decks.map((d) => d.cardIds))];
    const read = () =>
      decks.map((deck) => [
        deckSummary(deck).startingHp,
        deckStartingHp(deck).total,
        createCardMatch({ seed: 1, playerDeck: deck, enemyDeck: deck }).nextState.player.maxHp,
      ]);
    const [base, m5] = baseAndM5(read);
    expect(m5).toEqual(base);
    for (const row of base) expect(new Set(row).size).toBe(1);
    // Battle Setup and Home call the same helper with the deck alone.
    expect(code('../pages/BattleSetupPage.tsx')).toMatch(/deckStartingHp\(playerDeck\.cardIds\)/);
    expect(code('../pages/HomePage.tsx')).toMatch(/deckStartingHp\(deck\.cardIds\)\.total/);
  });

  it('4. effect text and effect numbers never change', () => {
    const [base, m5] = baseAndM5(() => PLAYTEST_ROSTER.map((id) => cardEffects(id)));
    expect(m5).toEqual(base);
    // Card rules have no Mastery input: a rank passed by mistake changes nothing.
    for (const id of PLAYTEST_ROSTER) expect(cardEffects(id, { rules: 'card', masteryRank: 3 }), id).toEqual(cardEffects(id));
  });

  it('5. Quick Battle ignores Mastery: the battle is built from the two deck lists only', () => {
    const app = code('../App.tsx');
    const game = code('../pages/GamePage.tsx');
    expect(app).not.toMatch(/ascensionRanksFor|getAscensionState|enemyMasteryStages|masteryStages/);
    expect(game).toMatch(/createCardMatch\(\{ seed: matchSeed, playerDeck, enemyDeck, startingHpOverride \}\)/);
    expect(game).not.toMatch(/stagesFromAscensionRanks|enemyMasteryStages|masteryStage/);
  });

  it('6. Campaign ignores Mastery (both sides)', () => {
    const encounters = CHAPTER_1.nodes.filter((n) => n.encounter);
    const [base, m5] = baseAndM5(() =>
      encounters.map((node) => {
        const plan = campaignBattlePlan(node, STARTER_DECKS.kingdom)!;
        const built = createCardMatch({ seed: 9, playerDeck: STARTER_DECKS.kingdom, enemyDeck: plan.enemyDeck, startingHpOverride: plan.startingHpOverride }).nextState;
        return [campaignBattleHp(node, STARTER_DECKS.kingdom), built.player.hp, built.enemy.hp];
      }),
    );
    expect(m5).toEqual(base);
  });

  it('7 and 9. Ranked ignores Mastery, and rivals have no Mastery tier', () => {
    const [base, m5] = baseAndM5(() =>
      [0, 100, 250, 450, 700, 1000].map((rating) => {
        const rival = chooseRankedOpponent({ rating, wins: 0, losses: 0 });
        const built = createCardMatch({ seed: 3, playerDeck: STARTER_DECKS.undead, enemyDeck: rival.deck.cardIds }).nextState;
        return { rival: rival.deck.id, keys: Object.keys(rival).sort(), hp: [built.player.maxHp, built.enemy.maxHp], rivalHp: deckStartingHp(rival.deck.cardIds).total };
      }),
    );
    expect(m5).toEqual(base);
    for (const row of base) {
      expect(row.keys).toEqual(['deck', 'tier']);
      expect(row.hp[1]).toBe(row.rivalHp);
    }
    expect(code('./ranked/tiers.ts')).not.toMatch(/mastery/i);
  });

  it('8. Friendly ignores Mastery and has no Mastery equalization', () => {
    const create = code('../../api/create-match.ts');
    expect(create).toMatch(/createCardMatch\(\{\s*seed,\s*playerDeck: hostDeck\.cardIds,\s*enemyDeck: guestDeck\.cardIds,\s*\}\)/);
    // The snapshot type still lists the old fields so an old client's payload parses; nothing reads them.
    expect(create.replace(/^\s*(masteryId|masteryRank|ascensions)\?:.*$/gm, '')).not.toMatch(/mastery|ascension/i);
    expect(code('../../api/_lib/resolveRoundInternal.ts')).not.toMatch(/mastery|ascension/i);
    expect(code('../pages/FriendlyBattlePage.tsx')).not.toMatch(/mastery|ascension/i);
  });

  it('13 and 14. no Mastery purchase can spend Gold or copies', () => {
    setCollection({ ...getCollection(), 'kng-royal-guard': 11 });
    setGold(9_999);
    for (let i = 0; i < 4; i++) expect(ascendCard('kng-royal-guard').ok).toBe(false);
    expect(getGold()).toBe(9_999);
    expect(getOwnedCount('kng-royal-guard')).toBe(11);
    // No screen offers the action any more.
    for (const file of ['../components/card/CardInspect.tsx', '../pages/HeroesPage.tsx', '../pages/DecksPage.tsx', '../pages/campaign/StageResultSheet.tsx', '../pages/summon/RitualStage.tsx']) expect(code(file), file).not.toMatch(/ascendCard|AscensionPanel|getAscensionStatus/);
  });

  it('15. Legacy Level remains retired: it changes no battle', () => {
    const before = createCardMatch({ seed: 5, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.infernal }).nextState;
    setHeroLevel('kng-royal-guard', 60);
    setHeroLevel('kng-paladin', 60);
    expect(createCardMatch({ seed: 5, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.infernal }).nextState).toEqual(before);
  });

  it('16. Deck Strength remains removed from every screen', () => {
    const files = import.meta.glob(['../pages/**/*.tsx', '../components/**/*.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [file, src] of Object.entries(files)) expect(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), file).not.toMatch(/Deck Strength|deckStrength/);
  });

  it('17 and 18. Clash Damage and immediate destruction are unchanged, with or without Mastery history', () => {
    const clash = () => {
      const s = createCardMatch({ seed: 7, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
      for (const side of ['player', 'enemy'] as Side[]) {
        s[side].hand = [];
        s[side].deck = [];
        s.cardCombat!.deckMarks[side] = [];
      }
      s.player.hand = [{ handId: 'h-knight', cardId: 'kng-common-knight' }];
      s.enemy.hand = [{ handId: 'h-warrior', cardId: 'und-cursed-warrior' }];
      const r = resolveCardRound(s as GameState, { plays: [{ handId: 'h-knight', cardId: 'kng-common-knight', lane: 'left' }] }, { plays: [{ handId: 'h-warrior', cardId: 'und-cursed-warrior', lane: 'left' }] });
      const record = r.events.find((e) => e.type === 'CLASH_DAMAGE');
      const destroyed = r.events.filter((e) => e.type === 'HERO_DESTROYED').map((e) => (e.type === 'HERO_DESTROYED' ? e.side : null));
      return { record, destroyed, enemyLeft: r.nextState.enemy.heroZones.left, enemyHp: s.enemy.hp - r.nextState.enemy.hp };
    };
    const [base, m5] = baseAndM5(clash);
    expect(m5).toEqual(base);
    // Knight 128 vs Cursed Warrior 99: the Warrior is destroyed in this same round and its player takes the 29 ATK
    // difference.
    expect(base.record).toMatchObject({ type: 'CLASH_DAMAGE', winner: 'player', playerAtk: 128, enemyAtk: 99, clashDamage: 29 });
    expect(base.destroyed).toEqual(['enemy']);
    expect(base.enemyLeft).toBeNull();
    expect(base.enemyHp).toBe(base.record && base.record.type === 'CLASH_DAMAGE' ? base.record.clashDamage : -1);
  });

  it('19. the Collection and the battle show the same printed card values, and no Mastery mark', () => {
    setCollection({ ...getCollection(), 'kng-paladin': 3, 'spl-power-surge': 2 });
    const [base, m5] = baseAndM5(() => [
      renderToStaticMarkup(createElement(GameCard, { cardId: 'kng-paladin', density: 'tile', hpContribution: cardCopyView('kng-paladin').hpContribution, copies: 3 })),
      renderToStaticMarkup(createElement(GameCard, { cardId: 'spl-power-surge', density: 'tile', copies: 2 })),
    ]);
    expect(m5).toEqual(base);
    expect(base[0]).toContain(`${printedStats('kng-paladin')!.hpc}`);
    expect(base.join('')).not.toMatch(/gc-mark mastery|Card Mastery/);
    expect(cardCopyView('kng-paladin').hpContribution).toBe(matchHpContribution('kng-paladin'));
  });

  it('21. historical rank is never shown to players, and stays in the save untouched', () => {
    setCollection({ ...getCollection(), 'kng-paladin': 3 });
    const [base, m5] = baseAndM5(() => renderToStaticMarkup(createElement(CardInspect, { cardId: 'kng-paladin', context: 'collection', onClose: () => {} })));
    expect(m5).toEqual(base);
    expect(m5).not.toMatch(/Mastery|Ascension|on record/);
    expect(localStorage.getItem(ASCENSION_STORAGE_KEY)).toBe(JSON.stringify(M5_SAVE));
    // Only the dev tools read the historical record; no screen does.
    const files = import.meta.glob(['../pages/**/*.tsx', '../components/**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [file, src] of Object.entries(files)) expect(src, file).not.toMatch(/historicalMastery|getDuplicatesSpent|Legacy Mastery/);
  });
});
