export type LocalPveMode = 'quickBattle' | 'campaign' | 'ranked';
export type CombatModel = 'legacy' | 'v2';

/**
 * V2 promotion is explicit per local PvE mode. Set VITE_COMBAT_V2_MODES to a comma-separated list;
 * an empty value returns all listed modes to legacy while leaving the V2 engine available.
 * During local development, ?combat=legacy or ?combat=v2 overrides the list for verification.
 */
export function combatModelForMode(mode: LocalPveMode): CombatModel {
  const override = new URLSearchParams(window.location.search).get('combat');
  if (import.meta.env.DEV && override === 'legacy') return 'legacy';
  if (import.meta.env.DEV && override === 'v2') return 'v2';
  const configured = import.meta.env.VITE_COMBAT_V2_MODES;
  const enabled: string[] = configured === undefined ? [] : configured.split(',').map((value: string) => value.trim()).filter(Boolean);
  return enabled.includes(mode) ? 'v2' : 'legacy';
}
