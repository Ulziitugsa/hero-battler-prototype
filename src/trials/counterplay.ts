import { getLaunchDeck, launchDeckList } from '../game/cards/launchDecks';
import { playCardAiMatch, runCardSeries, type SeriesResult } from '../game/cardCombat/simulate';

// Part F: each combination, as a 15-card deck, against three kinds of opponent, in AI-vs-AI battles on the production
// resolver (cardCombat/simulate.ts, the battle screen's own loop):
//   1. no specific answer: Vanguard, the plain Knight beatdown list;
//   2. the intended counter: the same Vanguard list with four cards swapped for that combination's answers, so the
//      difference is the counter and nothing else;
//   3. an unrelated strategy: Phantoms (Bypass) and Hellfire (burn).
// Each combination also has a control deck: the same list with its experimental cards swapped for the closest existing
// cards, to show what the combination itself adds.
//
// Both sides are the production AI, which never plans a combination (docs/design/CARD-DISCOVERY-LAB.md, "The AI,
// measured"): it sacrifices only when a one-round look-ahead says so and never holds a card back. These numbers say what
// the cards do in a plain AI's hands; the Arcane Trials show what they do in a player's.

const deck = (cards: [string, number][]): string[] => cards.flatMap(([id, n]) => Array.from({ length: n }, () => id));
const swap = (base: string[], out: [string, number][], into: [string, number][]): string[] => {
  const list = [...base];
  for (const [id, n] of out)
    for (let i = 0; i < n; i++) {
      const at = list.indexOf(id);
      if (at < 0) throw new Error(`${id} is not in the deck`);
      list.splice(at, 1);
    }
  return [...list, ...deck(into)];
};

export interface CounterplayCase {
  id: string;
  name: string;
  combo: string[];
  control: string[];
  noAnswer: string[];
  counter: string[];
  counterName: string;
  unrelated: { name: string; deck: string[] }[];
}

const VANGUARD = launchDeckList(getLaunchDeck('vanguard'));
const UNRELATED = [
  { name: 'Phantoms (Bypass)', deck: launchDeckList(getLaunchDeck('phantoms')) },
  { name: 'Hellfire (burn)', deck: launchDeckList(getLaunchDeck('hellfire')) },
];

export const COUNTERPLAY_CASES: readonly CounterplayCase[] = [
  {
    id: 'immortal-army',
    name: 'The Immortal Army',
    combo: deck([['xp-deathless-legionary', 2], ['xp-mordrath', 1], ['und-bonecaller', 1], ['und-morwen', 1], ['und-bone-soldier', 2], ['und-crypt-warden', 1], ['und-dark-priest', 1], ['spl-dark-ritual', 2], ['spl-raise-fallen', 2], ['spl-power-surge', 2]]),
    control: deck([['und-cursed-warrior', 2], ['und-vharos', 1], ['und-bonecaller', 1], ['und-morwen', 1], ['und-bone-soldier', 2], ['und-crypt-warden', 1], ['und-dark-priest', 1], ['spl-dark-ritual', 2], ['spl-raise-fallen', 2], ['spl-power-surge', 2]]),
    noAnswer: VANGUARD,
    counter: swap(VANGUARD, [['spl-consecrate', 2], ['spl-war-cry', 2]], [['spl-hush', 2], ['xp-unmaking', 2]]),
    counterName: 'Vanguard with Hush ×2 and Unmaking ×2',
    unrelated: UNRELATED,
  },
  {
    id: 'apocalypse',
    name: 'The Apocalypse',
    combo: deck([['xp-ashen-hierophant', 1], ['inf-ember-witch', 1], ['inf-hellfire-warlock', 1], ['inf-pit-fiend', 2], ['inf-flame-herald', 2], ['inf-brimstone-ogre', 1], ['xp-cataclysm', 2], ['spl-weakness', 2], ['spl-spark', 2], ['spl-death-wave', 1]]),
    control: deck([['inf-infernal-lord', 1], ['inf-ember-witch', 1], ['inf-hellfire-warlock', 1], ['inf-pit-fiend', 2], ['inf-flame-herald', 2], ['inf-brimstone-ogre', 1], ['spl-meteor', 2], ['spl-weakness', 2], ['spl-spark', 2], ['spl-death-wave', 1]]),
    noAnswer: VANGUARD,
    counter: swap(VANGUARD, [['spl-consecrate', 2], ['kng-knight-errant', 2]], [['spl-hush', 2], ['kng-null-templar', 2]]),
    counterName: 'Vanguard with Hush ×2 and Null Templar ×2',
    unrelated: UNRELATED,
  },
  {
    id: 'champion',
    name: 'The Unstoppable Champion',
    combo: deck([['xp-aurelian', 1], ['xp-vow-unbroken', 2], ['kng-paladin', 1], ['kng-royal-guard', 2], ['kng-shieldbearer', 2], ['kng-common-knight', 2], ['kng-knight-errant', 1], ['spl-aegis-ward', 1], ['spl-stasis-field', 1], ['spl-power-surge', 1], ['spl-arcane-barrier', 1]]),
    control: deck([['kng-marshal-aldric', 1], ['spl-battle-banner', 2], ['kng-paladin', 1], ['kng-royal-guard', 2], ['kng-shieldbearer', 2], ['kng-common-knight', 2], ['kng-knight-errant', 1], ['spl-aegis-ward', 1], ['spl-stasis-field', 1], ['spl-power-surge', 1], ['spl-arcane-barrier', 1]]),
    noAnswer: VANGUARD,
    counter: swap(VANGUARD, [['spl-consecrate', 2], ['spl-war-cry', 2]], [['spl-dispel', 2], ['xp-unmaking', 2]]),
    counterName: 'Vanguard with Dispel ×2 and Unmaking ×2',
    unrelated: UNRELATED,
  },
];

/** What the combination's signature effects actually did, per battle on average (the combination's side only). */
export interface SignatureStats {
  games: number;
  winShare: number;
  /** Undying rises. */
  rises: number;
  /** One-time Spells that destroyed two or more enemy Units in one resolution. */
  multiKills: number;
  /** Enemy Units destroyed by Cataclysm. */
  cataclysmKills: number;
  /** Highest ATK any of the side's experimental Units reached (mean of each battle's peak). */
  peakAtk: number;
  /** Battles in which a Unit reached 1,000 ATK. */
  thousandGames: number;
  /** The side's Units exiled by Unmaking. */
  exiled: number;
  /** The side's Spells destroyed by an enemy effect (Dispel, Runebreaker). */
  spellsBroken: number;
  /** Enemy Spells the side's immunity blocked. */
  blocked: number;
}

export function signatureStats(playerDeck: string[], enemyDeck: string[], games: number, seed = 20261017): SignatureStats {
  const totals = { wins: 0, rises: 0, multiKills: 0, cataclysmKills: 0, peak: 0, thousand: 0, exiled: 0, broken: 0, blocked: 0 };
  for (let i = 0; i < games; i++) {
    const r = playCardAiMatch({ seed: (seed + i * 7919) >>> 0, playerDeck, enemyDeck }, { keepEvents: true });
    if (r.status === 'PLAYER_WIN') totals.wins += 1;
    else if (r.status === 'DRAW') totals.wins += 0.5;
    const ev = r.events!;
    let peak = 0;
    let spell: { name: string; kills: number } | null = null;
    for (const e of ev) {
      if (e.type === 'REVIVED' && e.side === 'player' && e.cardId === 'xp-deathless-legionary') totals.rises += 1;
      if (e.type === 'POWER_CHANGED' && e.side === 'player' && /Mordrath|Aurelian|Legionary|Hierophant/.test(e.name)) peak = Math.max(peak, e.to);
      if (e.type === 'TRIGGER' && e.side === 'player' && e.trigger === 'CAST') spell = { name: e.sourceName, kills: 0 };
      if (e.type === 'HERO_DESTROYED' && e.side === 'enemy' && spell) spell.kills += 1;
      if (e.type === 'SPELL_RESOLVED' && e.side === 'player' && spell) {
        if (spell.kills >= 2) totals.multiKills += 1;
        if (spell.name === 'Cataclysm') totals.cataclysmKills += spell.kills;
        spell = null;
      }
      if (e.type === 'HERO_DESTROYED' && e.side === 'player' && e.exiled) totals.exiled += 1;
      if (e.type === 'SPELL_ZONE_DESTROYED' && e.side === 'player') totals.broken += 1;
      if (e.type === 'IMMUNITY_BLOCKED' && e.side === 'player') totals.blocked += 1;
    }
    totals.peak += peak;
    if (peak >= 1000) totals.thousand += 1;
  }
  const per = (n: number) => Math.round((n / games) * 100) / 100;
  return { games, winShare: totals.wins / games, rises: per(totals.rises), multiKills: per(totals.multiKills), cataclysmKills: per(totals.cataclysmKills), peakAtk: Math.round(totals.peak / games), thousandGames: totals.thousand, exiled: per(totals.exiled), spellsBroken: per(totals.broken), blocked: per(totals.blocked) };
}

export interface CounterplayRow {
  opponent: string;
  combo: SeriesResult;
  control: SeriesResult;
}

/** The combination and its control against each opponent, `games` battles each (the combination's side is the player). */
export function counterplayReport(c: CounterplayCase, games: number, seed = 20261017): CounterplayRow[] {
  const opponents = [{ name: 'Vanguard (no specific answer)', deck: c.noAnswer }, { name: c.counterName, deck: c.counter }, ...c.unrelated];
  return opponents.map((o) => ({
    opponent: o.name,
    combo: runCardSeries({ playerDeck: c.combo, enemyDeck: o.deck }, games, seed),
    control: runCardSeries({ playerDeck: c.control, enemyDeck: o.deck }, games, seed),
  }));
}
