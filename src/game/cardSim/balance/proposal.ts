import type { CardDefinition } from '../../types/index.js';
import { getCard as getLiveCard } from '../../cards/index.js';
import { BASE_RULES, type Rules } from '../engine.js';
import { CONTROL_PROPOSAL } from '../controlPass.js';
import type { CardPatchSet } from '../overrides.js';
import { BLOOD_DEMON, BONE_SOLDIER, PALADIN_HEAL_ON_WIN, PROPOSED_RULES, WARD_TOKEN, boneSoldierCapped } from '../outliers.js';
import { DEFENSIVE_OVERRIDES, guard } from './defensive.js';
import { THREAD_C_PACKAGE } from './threadC.js';

// The effect / archetype balance proposal: Threads A to D merged by Thread E (docs/CARD-COMBAT-DESIGN.md,
// "Balance pass"). Sim-only card definitions and rules; the live card files are untouched until ozi approves.
//
// Where threads touched the same card:
//   - Paladin: line 3 is Thread D's "heal 45 when the lane enemy dies"; lines 1-2 unchanged (Thread C), shown as
//     "Guard 4" on the card (Thread A, text only).
//   - Dark Priest / Grave Knight: Thread A's Guard 2 replaces their permanent growth lines, so Thread D's growth
//     cap no longer applies to them.
//   - Battle Captain: Thread C's adjacent aura, which C recommends only together with D's caps (both are in).

/** Thread B's patch sets, as whole card definitions for the override hook. */
export function patchesToCards(set: CardPatchSet): CardDefinition[] {
  return Object.entries(set).map(([id, patch]) => ({ ...getLiveCard(id), ...patch }));
}

/** Approved re-band: the two Power 7 Legendaries become Power 6. Part of every balance-pass run. */
export const REBAND: CardDefinition[] = ['und-vharos', 'inf-infernal-lord'].map((id) => ({ ...getLiveCard(id), power: 6 }));

/** Rules of the proposal: approved rules + Thread D's per-copy Graveyard return and +45 ATK growth cap. */
export const BALANCE_RULES: Rules = PROPOSED_RULES;

/** Which thread each overridden card comes from (for the report and the card-change table). */
export const PROPOSAL_OWNERS: Record<string, string> = {};

function owned(thread: string, cards: CardDefinition[]): CardDefinition[] {
  for (const c of cards) PROPOSAL_OWNERS[c.id] = thread;
  return cards;
}

/** Every card definition the merged proposal changes (plus the approved re-band). Later entries win. */
export function proposalCards(extra: CardDefinition[] = []): CardDefinition[] {
  const byId = new Map<string, CardDefinition>();
  const add = (cards: CardDefinition[]) => cards.forEach((c) => byId.set(c.id, c));
  add(REBAND);
  add(owned('A', DEFENSIVE_OVERRIDES));
  add(owned('B', patchesToCards(CONTROL_PROPOSAL)));
  add(owned('C', THREAD_C_PACKAGE.cards()));
  add(owned('D', [BONE_SOLDIER, BLOOD_DEMON, PALADIN_HEAL_ON_WIN, WARD_TOKEN]));
  add(owned('E', extra));
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Thread E tuning on top of the merge (candidates; the chosen ones go into E_CHANGES)
// ---------------------------------------------------------------------------

const live = (id: string) => getLiveCard(id);

/** Crypt Warden: the weakest clash card on the roster (0.19). Guard 2 makes it the Commons' lane holder. */
export const WARDEN_GUARD: CardDefinition = { ...live('und-crypt-warden'), boardText: 'Guard 2; Shield if 2+ Grave', abilities: [guard(2), ...live('und-crypt-warden').abilities] };

/** Crypt Warden with Guard 1 instead of 2. */
export const WARDEN_GUARD_ONE: CardDefinition = { ...live('und-crypt-warden'), boardText: 'Guard 1; Shield if 2+ Grave', abilities: [guard(1), ...live('und-crypt-warden').abilities] };

/** War Cry: all allies +2 Power this round becomes +1 (the Kingdom bonus line stays +1). */
export const WAR_CRY_ONE: CardDefinition = {
  ...live('spl-war-cry'),
  abilities: live('spl-war-cry').abilities.map((ab, i) => (i === 0 ? { ...ab, actions: [{ type: 'CHANGE_POWER' as const, amount: 1, duration: 'UNTIL_ROUND_END' as const, target: 'ALL_ALLIES' as const }], text: 'All allied Heroes gain +1 Power this round.' } : ab)),
};

/** Battle Banner: +2 Power while active becomes +1 (Kingdom's permanent lane swing, doubled by Archer). */
export const BANNER_ONE: CardDefinition = {
  ...live('spl-battle-banner'),
  boardText: '+1 Power while active',
  abilities: [{ ...live('spl-battle-banner').abilities[0], actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ALLY_SAME_LANE' }], text: 'Your Hero in this lane has +1 Power.' }],
};

/** Power Surge: +3 Power this round becomes +2. */
export const SURGE_TWO: CardDefinition = {
  ...live('spl-power-surge'),
  boardText: '+2 Power this round',
  abilities: [{ ...live('spl-power-surge').abilities[0], actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'ALLY_SAME_LANE' }], text: 'Your Hero in this lane gains +2 Power this round.' }],
};

/** Grave Knight (after Thread A's Guard 2): the once-per-round heal drops from 90 to 45 HP, since Guard makes it fire most rounds. */
export function graveKnightHeal(amount: number): CardDefinition {
  const a = DEFENSIVE_OVERRIDES.find((c) => c.id === 'und-grave-knight')!;
  return {
    ...a,
    boardText: `Guard 2; 1st/rnd: Heal${amount}`,
    abilities: a.abilities.map((ab) => (ab.actions.some((x) => x.type === 'PLAYER_HEAL') ? { ...ab, actions: [{ type: 'PLAYER_HEAL' as const, amount }], text: `The first time an enemy Hero dies each round, heal your player for ${amount}.` } : ab)),
  };
}

/** Dark Priest (after Thread A's Guard 2): the Graveyard line drops from +2 to +1 Power, so a blocking Priest tops out at 125 ATK, not 140. */
export const DARK_PRIEST_GRAVE_ONE: CardDefinition = (() => {
  const a = DEFENSIVE_OVERRIDES.find((c) => c.id === 'und-dark-priest')!;
  return {
    ...a,
    boardText: 'Guard 2; +1 w/3+ Grave',
    abilities: a.abilities.map((ab, i) => (i === 1 ? { ...ab, actions: [{ type: 'CHANGE_POWER' as const, amount: 1, duration: 'UNTIL_ROUND_END' as const, target: 'SELF' as const }], text: 'Before Combat: if your Graveyard holds 3 or more cards, gain +1 Power this round.' } : ab)),
  };
})();

/** Balanced study deck with its two dead Spells (Giant's Bane, Blood Pact) swapped for flexible ones. */
export const BALANCED_V2: string[] = [
  'kng-royal-guard', 'kng-royal-guard', 'kng-null-templar', 'kng-null-templar', 'und-grave-knight', 'und-grave-knight',
  'und-crypt-warden', 'und-crypt-warden', 'inf-packhound', 'inf-packhound', 'kng-battle-captain',
  'spl-power-surge', 'spl-weakness', 'spl-aegis-ward', 'spl-stasis-field',
];

/** Balanced rebuilt from mid-Power cards of all three factions: 11 Units, 4 flexible Spells, no dead Spells or orphan Beasts. */
export const BALANCED_V3: string[] = [
  'kng-royal-guard', 'kng-royal-guard', 'und-grave-knight', 'und-grave-knight', 'und-crypt-warden', 'und-crypt-warden',
  'inf-hellhound', 'inf-hellhound', 'kng-common-knight', 'kng-common-knight', 'kng-battle-captain',
  'spl-power-surge', 'spl-weakness', 'spl-aegis-ward', 'spl-stasis-field',
];

/** Balanced v2 with its orphan Beasts (Packhound, no other Beast in the deck) swapped for Common Knights. */
export const BALANCED_V4: string[] = [
  'kng-royal-guard', 'kng-royal-guard', 'kng-null-templar', 'kng-null-templar', 'und-grave-knight', 'und-grave-knight',
  'und-crypt-warden', 'und-crypt-warden', 'kng-common-knight', 'kng-common-knight', 'kng-battle-captain',
  'spl-power-surge', 'spl-weakness', 'spl-aegis-ward', 'spl-stasis-field',
];

/** Paladin with Guard 3 (+45) instead of +4 (+60), and Thread D's line 3. */
export const PALADIN_GUARD_THREE: CardDefinition = {
  ...PALADIN_HEAL_ON_WIN,
  boardText: 'Shield; Guard 3; win: Heal1',
  abilities: PALADIN_HEAL_ON_WIN.abilities.map((ab, i) => (i === 1 ? { ...ab, actions: [{ type: 'CHANGE_POWER' as const, amount: 3, duration: 'UNTIL_ROUND_END' as const, target: 'SELF' as const }], text: 'Guard 3: Before Combat, if this Hero would lose its lane, gain +3 Power this round.' } : ab)),
};

/** Balanced v4 with one Null Templar swapped for a Hellhound. */
export const BALANCED_V5: string[] = BALANCED_V4.map((id, i) => (i === 3 ? 'inf-hellhound' : id));

const R3 = () => proposalCards([WARDEN_GUARD, BANNER_ONE, WAR_CRY_ONE, boneSoldierCapped(4), PALADIN_GUARD_THREE]);

export interface BalanceVariant {
  id: string;
  label: string;
  rules: Rules;
  cards: () => CardDefinition[];
  /** Deck lists replaced in this variant (id -> 15 cards). */
  decks?: Record<string, string[]>;
  /** HP Contribution multiplier on top of the approved ¾ scale (sensitivity only; 1 = approved). */
  hpcScale?: number;
}

const APPROVED: Rules = { ...BASE_RULES, recursionCap: 1 };
const only = (thread: string) => () => proposalCards().filter((c) => PROPOSAL_OWNERS[c.id] === thread || REBAND.some((r) => r.id === c.id));

export const BALANCE_VARIANTS: BalanceVariant[] = [
  { id: 'before', label: 'Approved baseline, printed cards', rules: APPROVED, cards: () => REBAND },
  { id: 'only-a', label: 'Thread A only (Guard)', rules: APPROVED, cards: only('A') },
  { id: 'only-b', label: 'Thread B only (control Spells)', rules: APPROVED, cards: only('B') },
  { id: 'only-c', label: 'Thread C only (Battle Captain)', rules: APPROVED, cards: only('C') },
  { id: 'only-d', label: 'Thread D only (caps, per-copy return)', rules: BALANCE_RULES, cards: only('D') },
  { id: 'merged', label: 'Threads A-D merged', rules: BALANCE_RULES, cards: () => proposalCards() },
  { id: 'e-warden', label: 'Merged + Crypt Warden Guard 2', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD]) },
  { id: 'e-banner', label: 'Merged + Battle Banner +1', rules: BALANCE_RULES, cards: () => proposalCards([BANNER_ONE]) },
  { id: 'e-warden-banner', label: 'Merged + Warden Guard 2 + Banner +1', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE]) },
  { id: 'e-wb-gk1', label: 'Merged + Warden Guard 2 + Banner +1 + Grave Knight heal 45', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, graveKnightHeal(1)]) },
  { id: 'wb-dp1', label: 'W+B + Dark Priest Graveyard +1', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, DARK_PRIEST_GRAVE_ONE]) },
  { id: 'wb-bal2', label: 'W+B + Balanced list v2', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE]), decks: { balanced: BALANCED_V2 } },
  { id: 'wb-dp1-bal2', label: 'W+B + Dark Priest +1 + Balanced v2', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, DARK_PRIEST_GRAVE_ONE]), decks: { balanced: BALANCED_V2 } },
  { id: 'w1b-wc', label: 'Warden Guard 1 + Banner +1 + War Cry +1', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD_ONE, BANNER_ONE, WAR_CRY_ONE]) },
  { id: 'wb-wc-bal3', label: 'W+B + War Cry +1 + Balanced v3', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, WAR_CRY_ONE]), decks: { balanced: BALANCED_V3 } },
  { id: 'w1b-wc-bal3', label: 'Warden Guard 1 + Banner +1 + War Cry +1 + Balanced v3', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD_ONE, BANNER_ONE, WAR_CRY_ONE]), decks: { balanced: BALANCED_V3 } },
  { id: 'r3-bal4', label: 'R (Warden G2, Banner +1, War Cry +1) + Balanced v4', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, WAR_CRY_ONE]), decks: { balanced: BALANCED_V4 } },
  { id: 'r3-bal4-bone60', label: 'R + Balanced v4 + Bone Soldier up to +60', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, WAR_CRY_ONE, boneSoldierCapped(4)]), decks: { balanced: BALANCED_V4 } },
  { id: 'r3-bal4-bone60-pal3', label: 'R + Balanced v4 + Bone Soldier +60 + Paladin Guard 3', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, WAR_CRY_ONE, boneSoldierCapped(4), PALADIN_GUARD_THREE]), decks: { balanced: BALANCED_V4 } },
  { id: 'r4-name', label: 'R3 with the Graveyard return counted per card name', rules: { ...BALANCE_RULES, recursionScope: 'name' }, cards: R3, decks: { balanced: BALANCED_V4 } },
  { id: 'r4-name-bal5', label: 'R3, per-name return, Balanced v5', rules: { ...BALANCE_RULES, recursionScope: 'name' }, cards: R3, decks: { balanced: BALANCED_V5 } },
  { id: 'final', label: 'Final proposal: R3 cards, per-copy return, Balanced v5', rules: BALANCE_RULES, cards: R3, decks: { balanced: BALANCED_V5 } },
  { id: 'r6-bone45', label: 'R3 with Bone Soldier back at up to +45, Balanced v5', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, WAR_CRY_ONE, PALADIN_GUARD_THREE]), decks: { balanced: BALANCED_V5 } },
  { id: 'r6-no-warden', label: 'R3 without Crypt Warden Guard, Balanced v5', rules: BALANCE_RULES, cards: () => proposalCards([BANNER_ONE, WAR_CRY_ONE, boneSoldierCapped(4), PALADIN_GUARD_THREE]), decks: { balanced: BALANCED_V5 } },
  { id: 'r4-bal5', label: 'R3, Balanced v5', rules: BALANCE_RULES, cards: R3, decks: { balanced: BALANCED_V5 } },
  { id: 'r4-bal5-hpc90', label: 'R3, Balanced v5, HPC x0.9 (length sensitivity)', rules: BALANCE_RULES, cards: R3, decks: { balanced: BALANCED_V5 }, hpcScale: 0.9 },
  { id: 'r4-bal5-hpc80', label: 'R3, Balanced v5, HPC x0.8 (length sensitivity)', rules: BALANCE_RULES, cards: R3, decks: { balanced: BALANCED_V5 }, hpcScale: 0.8 },
  { id: 'e-warden-banner-surge', label: 'Merged + Warden Guard 2 + Banner +1 + Surge +2', rules: BALANCE_RULES, cards: () => proposalCards([WARDEN_GUARD, BANNER_ONE, SURGE_TWO]) },
];

export function getVariant(id: string): BalanceVariant {
  const v = BALANCE_VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown balance variant: ${id}`);
  return v;
}
