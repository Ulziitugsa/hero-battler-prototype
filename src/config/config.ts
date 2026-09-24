import { DEFAULT_CONFIG } from './defaults.js';
import type { GameConfig } from './schema.js';

// The remote-config abstraction (Commercial Prototype Phase 8). NOT a live service: this is the
// provider seam a real one (Vercel Global Config, LaunchDarkly, a bespoke endpoint - whatever gets
// chosen later) plugs into via setConfigProvider(), exactly like analytics/track.ts's
// setAnalyticsProvider(). Until then, getConfig() always resolves to DEFAULT_CONFIG (config/defaults.ts),
// optionally deep-merged with local overrides - see LocalConfigProvider below - so the game runs fully
// offline/local with zero provider configured, per the brief's explicit requirement.
//
// The rest of the game should read tunable numbers through getConfig() rather than importing a raw
// constant directly, WHERE PRACTICAL (see docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 8 for which call sites
// were actually migrated, and which values were deliberately left as plain code constants because they
// are game rules, not economy tuning - e.g. MAX_HERO_LEVEL's relationship to battlePowerBonusForLevel's
// breakpoints is a combat-balance invariant, not a live-ops lever).

export type ConfigProvider = () => GameConfig;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Recursively merges `overrides` onto `base`, keeping every field `base` has that `overrides` doesn't touch. */
function deepMerge<T>(base: T, overrides: DeepPartial<T> | undefined): T {
  if (!overrides) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    const baseValue = (base as Record<string, unknown>)[key];
    out[key] = isPlainObject(value) && isPlainObject(baseValue) ? deepMerge(baseValue, value as DeepPartial<typeof baseValue>) : value;
  }
  return out as T;
}

/** The local/default provider (sufficient for this phase, per the brief) - DEFAULT_CONFIG, optionally
 * deep-merged with a fixed overrides object. This is what the game uses until a real remote provider is
 * ever wired; nothing about that future wiring is assumed here beyond the ConfigProvider function shape. */
export function createLocalProvider(overrides?: DeepPartial<GameConfig>): ConfigProvider {
  return () => deepMerge(DEFAULT_CONFIG, overrides);
}

let provider: ConfigProvider = createLocalProvider();
let cached: GameConfig | null = null;

/** Swaps the active provider (a real remote one, later; a test/dev override now). Drops the cache so the
 * next getConfig() call re-resolves. Passing null resets to the plain local default. */
export function setConfigProvider(next: ConfigProvider | null): void {
  provider = next ?? createLocalProvider();
  cached = null;
}

/** The resolved config, cached for the process lifetime of the current provider (a static local provider
 * never changes mid-session; a future remote provider would call setConfigProvider again to push an
 * update, which is also how a dev tool applies a live override - see devTools.ts's configOverride()). */
export function getConfig(): GameConfig {
  if (!cached) cached = provider();
  return cached;
}

/** Drops the cache so the next getConfig() re-resolves from the current provider - tests only. */
export function reloadConfig(): void {
  cached = null;
}

// ---- Dev-only local override (persisted, so a QA tester can tune values without a rebuild) -----------
// This is the "smallest reasonable solution" the brief asks for - not a real remote provider, a
// localStorage-backed override object applied on top of DEFAULT_CONFIG. Exists only when
// import.meta.env.DEV, same convention as economy.ts's Unlimited Gems flag.

const DEV_OVERRIDE_KEY = 'skyloom:dev:configOverride';

function readDevOverride(): DeepPartial<GameConfig> | undefined {
  if (!import.meta.env.DEV) return undefined;
  try {
    const raw = localStorage.getItem(DEV_OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as DeepPartial<GameConfig>) : undefined;
  } catch {
    return undefined;
  }
}

/** Dev only: applies a partial config override, persisted across reloads, without needing a real provider. */
export function setDevConfigOverride(overrides: DeepPartial<GameConfig> | null): void {
  if (!import.meta.env.DEV) return;
  try {
    if (overrides) localStorage.setItem(DEV_OVERRIDE_KEY, JSON.stringify(overrides));
    else localStorage.removeItem(DEV_OVERRIDE_KEY);
  } catch {
    // ignore
  }
  setConfigProvider(createLocalProvider(overrides ?? undefined));
}

// Applies a persisted dev override (if any) at module load, before anything else reads getConfig().
if (import.meta.env.DEV) {
  const stored = readDevOverride();
  if (stored) provider = createLocalProvider(stored);
}
