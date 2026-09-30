import type { AbilityDefinition, CardDefinition } from '../../types/index.js';
import type { Rules } from '../engine.js';
import { simAbility } from '../simActions.js';
import { boneSoldierCapped } from '../outliers.js';
import { BULWARK_DECK } from './defensive.js';
import { BALANCE_RULES, BALANCE_VARIANTS, BALANCED_V5, type BalanceVariant, getVariant as getBatch3Variant } from './proposal.js';

// Difference-damage pass (approved core rule, 2026-09-29): ATK difference Clash Damage. Sim-only rule presets and
// card rewrites, measured by scripts/simulate-balance.mjs. The production card data mirrors the chosen variant
// (src/game/cardCombat/cards.ts), and a parity test keeps them identical.
//
// The rule: opposed Units compare ATK. The higher one wins and stays; the lower one is destroyed and its player
// takes winner ATK - loser ATK as Clash Damage (the loser's ATK is absorbed). A tie destroys both with no Player
// damage. An unopposed Unit still hits for its full ATK. Before Combat resolves in initiative order, like the
// production resolver.

/** The approved rules under difference damage: batch 3's rules plus Clash Damage and initiative order. */
export const DIFFERENCE_RULES: Rules = { ...BALANCE_RULES, clashDamage: true, beforeCombatOrder: 'initiative' };

const final = getBatch3Variant('final');

/** Batch 3's approved card set (the 'final' variant), by id. */
function batch3(id: string): CardDefinition {
  const card = final.cards().find((c) => c.id === id);
  if (!card) throw new Error(`${id} is not in batch 3's final card set`);
  return card;
}

/** Batch 3's approved cards with `changes` replacing cards of the same id. */
function withChanges(changes: CardDefinition[]): CardDefinition[] {
  const byId = new Map(final.cards().map((c) => [c.id, c]));
  for (const c of changes) byId.set(c.id, c);
  return [...byId.values()];
}

const isAtkGuard = (a: AbilityDefinition) => a.trigger === 'BEFORE_COMBAT' && a.conditions?.length === 1 && a.conditions[0].type === 'SELF_LOSING_LANE';

/**
 * Guard under difference damage (one meaning everywhere): "When this Unit loses a clash, your player takes
 * N x 15 less Clash Damage." It never changes ATK, so it never flips a clash and does not depend on who
 * resolves Before Combat first. `steps` is in legacy Power steps (15 ATK each), like every other amount.
 */
export function clashGuard(steps: number): AbilityDefinition {
  return simAbility({ trigger: 'PASSIVE', actions: [{ type: 'REDUCE_CLASH_DAMAGE', amount: steps, target: 'SELF' }], text: `Guard ${steps * 15}: when this Unit loses a clash, your player takes ${steps * 15} less Clash Damage.` });
}

/** `id` with its ATK Guard line (batch 3) replaced by a Clash Damage Guard of `steps`. */
export function withClashGuard(id: string, steps: number): CardDefinition {
  const card = batch3(id);
  return { ...card, abilities: card.abilities.map((a) => (isAtkGuard(a) ? clashGuard(steps) : a)) };
}

const GUARD_CARDS = ['und-dark-priest', 'und-grave-knight', 'und-crypt-warden'];

/** Every Guard card on the Clash Damage Guard: `steps` for the Rares/Common, `paladin` for the Legendary Paladin. */
function clashGuards(steps: number, paladin: number): CardDefinition[] {
  return [...GUARD_CARDS.map((id) => withClashGuard(id, steps)), withClashGuard('kng-paladin', paladin)];
}

/** Aegis Ward: "Prevent up to N x 15 Clash Damage to your player this round. Your Unit in this lane gains a Shield." */
export function aegisClashShield(steps: number): CardDefinition {
  const card = batch3('spl-aegis-ward');
  return {
    ...card,
    boardText: `Prevent ${steps * 15} Clash Dmg; Shield`,
    abilities: [
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'CLASH_SHIELD', amount: steps }], text: `Prevent up to ${steps * 15} Clash Damage to your player this round.` }),
      ...card.abilities.filter((a) => a.actions.some((x) => x.type === 'GRANT_SHIELD')),
    ],
  };
}

/** Aegis Ward: "Prevent up to N x 45 damage to your player this round. Your Unit in this lane gains a Shield." */
export function aegisPlayerShield(points: number): CardDefinition {
  const card = batch3('spl-aegis-ward');
  return {
    ...card,
    boardText: `Prevent ${points * 45} dmg; Shield`,
    abilities: [
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'PLAYER_SHIELD', amount: points }], text: `Prevent up to ${points * 45} damage to your player this round.` }),
      ...card.abilities.filter((a) => a.actions.some((x) => x.type === 'GRANT_SHIELD')),
    ],
  };
}

/** `id` with its ATK Guard line re-set to `steps` (Guard keeps its batch 3 meaning: +N x 15 ATK when it would lose). */
export function withAtkGuard(id: string, steps: number): CardDefinition {
  const card = batch3(id);
  return {
    ...card,
    abilities: card.abilities.map((a) =>
      isAtkGuard(a) ? { ...a, actions: [{ type: 'CHANGE_POWER' as const, amount: steps, duration: 'UNTIL_ROUND_END' as const, target: 'SELF' as const }], text: `Guard ${steps}: Before Combat, if this Unit would lose its lane, gain +${steps * 15} ATK this round.` } : a,
    ),
  };
}

const dd = (id: string, label: string, changes: () => CardDefinition[], extra: Partial<BalanceVariant> = {}): BalanceVariant => ({
  id,
  label,
  rules: DIFFERENCE_RULES,
  cards: () => withChanges(changes()),
  decks: { balanced: BALANCED_V5 },
  ...extra,
});

export const DD_VARIANTS: BalanceVariant[] = [
  { id: 'dd-carry', label: 'Batch 3 final cards carried over unchanged, difference damage', rules: DIFFERENCE_RULES, cards: final.cards, decks: { balanced: BALANCED_V5 } },
  // The proposal: every tested card change measured worse than the carried-over set (see the report), so the
  // approved batch 3 cards stay as they are under the new rule. The production card data (cardCombat/cards.ts)
  // mirrors this variant, and the parity test plays both side by side.
  { id: 'dd-final', label: 'Difference damage proposal: batch 3 cards unchanged, Clash Damage, initiative order', rules: DIFFERENCE_RULES, cards: final.cards, decks: { balanced: BALANCED_V5 } },
  dd('dd-g2r', 'Guard as Clash Damage reduction, same steps (30 / Paladin 45)', () => clashGuards(2, 3)),
  dd('dd-g3r', 'Guard as Clash Damage reduction, 45 / Paladin 60', () => clashGuards(3, 4)),
  dd('dd-g4r', 'Guard as Clash Damage reduction, 60 / Paladin 75', () => clashGuards(4, 5)),
  dd('dd-guard3', 'ATK Guard 3 (+45) on Dark Priest, Grave Knight and Crypt Warden', () => GUARD_CARDS.map((id) => withAtkGuard(id, 3))),
  dd('dd-warden3', 'ATK Guard 3 (+45) on Crypt Warden only', () => [withAtkGuard('und-crypt-warden', 3)]),
  dd('dd-bulwark-soulburn', 'Cards unchanged; Bulwark study list swaps one Stasis Field for Soul Burn (Graveyard answer)', () => [], {
    decks: { balanced: BALANCED_V5, 'defensive-bulwark': [...BULWARK_DECK.filter((id, i) => !(id === 'spl-stasis-field' && i === BULWARK_DECK.indexOf('spl-stasis-field'))), 'spl-soul-burn'] },
  }),
  dd('dd-bone45', 'Bone Soldier back to up to +45', () => [boneSoldierCapped(3)]),
  dd('dd-aegis-cs4', 'Aegis Ward: prevent 60 Clash Damage + Shield', () => [aegisClashShield(4)]),
  dd('dd-aegis-ps2', 'Aegis Ward: prevent 90 damage + Shield', () => [aegisPlayerShield(2)]),
];

/** Any balance variant: batch 3's (proposal.ts) or this pass's. */
export function getVariant(id: string): BalanceVariant {
  const v = DD_VARIANTS.find((x) => x.id === id);
  return v ?? getBatch3Variant(id);
}

export const ALL_VARIANTS: BalanceVariant[] = [...BALANCE_VARIANTS, ...DD_VARIANTS];

export type { CardDefinition };
