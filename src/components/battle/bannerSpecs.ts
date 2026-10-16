// The two phase moments a battle announces (RoundBanner.tsx draws them; GamePage decides when).

export interface RoundBannerSpec {
  /** Changes for every appearance, so the banner replays its entrance. */
  key: string;
  tone: 'round' | 'fight';
  title: string;
  subtitle?: string;
  /** How long it stays on screen; the owner removes it after this. */
  ms: number;
}

export const ROUND_BANNER_MS = 1150;
export const FIGHT_BANNER_MS = 720;

/** "Round 3 · Deploy" as a round opens for deployment ("Deploy your cards" on the first). */
export function roundBanner(round: number, matchKey: string | number): RoundBannerSpec {
  return { key: `round-${matchKey}-${round}`, tone: 'round', title: `Round ${round}`, subtitle: round === 1 ? 'Deploy your cards' : 'Deploy', ms: ROUND_BANNER_MS };
}

/** "Fight!" as the round's cards are revealed. */
export function fightBanner(round: number, matchKey: string | number): RoundBannerSpec {
  return { key: `fight-${matchKey}-${round}`, tone: 'fight', title: 'Fight!', ms: FIGHT_BANNER_MS };
}
