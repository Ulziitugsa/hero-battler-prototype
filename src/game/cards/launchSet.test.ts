import { describe, expect, it } from 'vitest';
import { getCard } from './index';
import { PLAYTEST_ROSTER } from './roster';
import { LAUNCH_ROSTER, launchInfo } from './launchRoster';
import { LAUNCH_DECKS, launchDeckList } from './launchDecks';
import { STARTER_DECKS } from './starterDecks';
import { printedStats } from '../cardCombat/stats';
import { validateDeck } from '../engine/deckRules';
import { getArchetypeBox } from '../box/archetypeBoxes';

// The 116-card launch set (cards/launchRoster.ts) and its reference decks (cards/launchDecks.ts).

/** Every card id on the roster before the launch set: all kept, never renamed. */
const PRE_LAUNCH_IDS = ['inf-alpha-hound','inf-ash-jackal','inf-blood-demon','inf-cultist','inf-flame-imp','inf-hellhound','inf-infernal-lord','inf-mirage-imp','inf-packhound','inf-pit-fiend','inf-runebreaker','kng-apprentice-mage','kng-archer','kng-archmage-vael','kng-battle-captain','kng-common-knight','kng-light-priest','kng-null-templar','kng-paladin','kng-royal-guard','kng-spellbreaker','spl-aegis-ward','spl-arcane-bolt','spl-battle-banner','spl-blood-pact','spl-burning-ground','spl-cursed-ground','spl-dispel','spl-fireball','spl-fortify','spl-giants-bane','spl-grave-totem','spl-hush','spl-power-surge','spl-raise-fallen','spl-second-chance','spl-siege-fire','spl-soul-burn','spl-stasis-field','spl-war-cry','spl-ward-circle','spl-weakness','und-bone-soldier','und-crypt-warden','und-cursed-warrior','und-dark-priest','und-grave-knight','und-grave-sage','und-mira','und-shade-thief','und-vharos','und-wraith-prince'];

describe('the launch roster', () => {
  it('keeps every pre-launch card id', () => {
    for (const id of PRE_LAUNCH_IDS) expect(PLAYTEST_ROSTER, id).toContain(id);
  });
  it('splits by source: 30 Core, 74 Box, 6 Structure Deck debuts, 6 event cards', () => {
    const count = (source: string) => LAUNCH_ROSTER.filter((c) => c.source === source).length;
    expect([count('core'), count('box'), count('structure-deck'), count('event')]).toEqual([30, 74, 6, 6]);
    expect(new Set(LAUNCH_ROSTER.map((c) => c.id)).size).toBe(116);
  });
  it('prints the roster ATK for every Unit, and HPC follows the formula from it', () => {
    for (const row of LAUNCH_ROSTER) {
      const stats = printedStats(row.id);
      if (getCard(row.id).type !== 'hero') { expect(stats, row.id).toBeNull(); expect(row.atk, row.id).toBeUndefined(); continue; }
      expect(stats, row.id).toEqual({ atk: row.atk, hpc: row.hpc });
    }
  });
  it('every card has a C1-C6 complexity band', () => {
    for (const row of LAUNCH_ROSTER) {
      expect(row.complexity, row.id).toBeGreaterThanOrEqual(1);
      expect(row.complexity, row.id).toBeLessThanOrEqual(6);
    }
  });
});

describe('the launch reference decks', () => {
  it('are 21 legal decks: 3 starters, 9 optimized, 6 budget, 3 Structure Decks', () => {
    expect(LAUNCH_DECKS).toHaveLength(21);
    const kinds = (k: string) => LAUNCH_DECKS.filter((d) => d.kind === k).length;
    expect([kinds('starter'), kinds('optimized'), kinds('budget'), kinds('structure-deck')]).toEqual([3, 9, 6, 3]);
    for (const deck of LAUNCH_DECKS) expect(validateDeck(launchDeckList(deck)).errors, deck.id).toEqual([]);
  });
  it('the starters are the free starter decks, made only of Core cards', () => {
    for (const faction of ['kingdom', 'undead', 'infernal'] as const) {
      const deck = LAUNCH_DECKS.find((d) => d.id === `${faction}-starter`)!;
      expect(launchDeckList(deck)).toEqual(STARTER_DECKS[faction]);
      for (const id of STARTER_DECKS[faction]) expect(launchInfo(id)?.source, id).toBe('core');
    }
  });
  it('each optimized list carries its archetype Box flagship', () => {
    for (const deck of LAUNCH_DECKS.filter((d) => d.kind === 'optimized')) expect(launchDeckList(deck), deck.id).toContain(getArchetypeBox(deck.archetype!).flagshipId);
  });
});
