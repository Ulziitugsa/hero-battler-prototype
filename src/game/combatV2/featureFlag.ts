export type LocalPveMode = 'quickBattle' | 'campaign' | 'ranked';
export type CombatModel = 'legacy' | 'v2' | 'card';

/**
 * Modes allowed to play the card-combat model (ATK + HP Contribution, src/game/cardCombat). Quick Battle only
 * for the first playable prototype: Campaign, Ranked, Friendly and every other mode stay on the legacy
 * resolver whatever the env list or the URL says.
 */
export const CARD_COMBAT_SUPPORTED_MODES: readonly LocalPveMode[] = ['quickBattle'];

function listFromEnv(configured: string | undefined): string[] {
  return configured === undefined ? [] : configured.split(',').map((value: string) => value.trim()).filter(Boolean);
}

/**
 * Pure resolution of a mode's combat model, for tests. Order: the ?combat= override, then
 * VITE_CARD_COMBAT_MODES, then VITE_COMBAT_V2_MODES, else legacy.
 *  - ?combat=card works in any build (so the prototype can be played on a preview deploy) but only for a
 *    mode in CARD_COMBAT_SUPPORTED_MODES; anywhere else it is ignored.
 *  - ?combat=legacy / ?combat=v2 stay development-only, as before.
 */
export function resolveCombatModel(mode: LocalPveMode, env: { dev: boolean; search: string; cardModes?: string; v2Modes?: string }): CombatModel {
  const cardAllowed = CARD_COMBAT_SUPPORTED_MODES.includes(mode);
  const override = new URLSearchParams(env.search).get('combat');
  if (override === 'card' && cardAllowed) return 'card';
  if (env.dev && override === 'legacy') return 'legacy';
  if (env.dev && override === 'v2') return 'v2';
  if (cardAllowed && listFromEnv(env.cardModes).includes(mode)) return 'card';
  return listFromEnv(env.v2Modes).includes(mode) ? 'v2' : 'legacy';
}

/**
 * V2 promotion is explicit per local PvE mode. Set VITE_COMBAT_V2_MODES to a comma-separated list;
 * an empty value returns all listed modes to legacy while leaving the V2 engine available.
 * Card combat is opt-in the same way through VITE_CARD_COMBAT_MODES (only 'quickBattle' is honoured) or
 * ?combat=card. During local development, ?combat=legacy or ?combat=v2 overrides the list for verification.
 */
export function combatModelForMode(mode: LocalPveMode): CombatModel {
  return resolveCombatModel(mode, {
    dev: import.meta.env.DEV,
    search: window.location.search,
    cardModes: import.meta.env.VITE_CARD_COMBAT_MODES,
    v2Modes: import.meta.env.VITE_COMBAT_V2_MODES,
  });
}
