import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// Deck matrix on the PRODUCTION card resolver and card AI (src/game/cardCombat): the three starters and the five
// archetype decks, every ordered pair, both seats. Besides win shares it reads each match's event log for the things a
// timing change can break: match length, stalls, runaway ATK, Graveyard recursion, death chains, Round Start / Round End
// trigger counts and Attached Spells expiring with their Unit. Design tool only: nothing in the game reads the output.
//
//   node scripts/simulate-deck-matrix.mjs                 full run (100 games per ordered pair), results in ./deck-matrix-results
//   node scripts/simulate-deck-matrix.mjs --out DIR       choose the output folder
//   node scripts/simulate-deck-matrix.mjs --games 40      games per ordered pair
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = resolve(option('--out', 'deck-matrix-results'));
const games = Number(option('--games', 100));
const SEED = 20261003;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const S = await server.ssrLoadModule('/src/game/cardCombat/simulate.ts');
  const SD = await server.ssrLoadModule('/src/game/cards/starterDecks.ts');
  const AD = await server.ssrLoadModule('/src/game/cards/archetypeDecks.ts');
  mkdirSync(outDir, { recursive: true });

  const DECKS = [
    ...Object.entries(SD.STARTER_DECKS).map(([id, cards]) => ({ id: `${id}-starter`, name: SD.STARTER_DECK_NAMES[id], cards })),
    ...Object.entries(AD.ARCHETYPE_DECKS).map(([id, cards]) => ({ id, name: AD.ARCHETYPE_DECK_NAMES[id], cards })),
  ];
  const pct = (x) => `${(100 * x).toFixed(0)}%`;
  const percentile = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);

  const cells = [];
  const perDeck = new Map(DECKS.map((d) => [d.id, { share: 0, n: 0 }]));
  const totals = { games: 0, rounds: [], stalls: 0, maxAtk: 0, returns: 0, revives: 0, deckReturns: 0, chains: 0, safeguards: 0, expired: 0, roundStart: 0, roundEnd: 0, shieldsUsed: 0, heals: 0 };
  const cardPlays = new Map();
  for (const a of DECKS) {
    for (const b of DECKS) {
      let share = 0;
      const rounds = [];
      let stalls = 0;
      for (let i = 0; i < games; i++) {
        const r = S.playCardAiMatch({ playerDeck: a.cards, enemyDeck: b.cards, seed: (SEED + i * 7919) >>> 0 }, { keepEvents: true });
        const s = r.status === 'PLAYER_WIN' ? 1 : r.status === 'DRAW' ? 0.5 : 0;
        share += s;
        rounds.push(r.rounds);
        if (r.endReason && r.endReason !== 'hp') stalls += 1;
        totals.games += 1;
        totals.rounds.push(r.rounds);
        if (r.endReason && r.endReason !== 'hp') totals.stalls += 1;
        const played = { player: new Set(), enemy: new Set() };
        let chain = 0;
        for (const ev of r.events) {
          if (ev.type === 'POWER_CHANGED' && ev.to > totals.maxAtk) totals.maxAtk = ev.to;
          if (ev.type === 'RETURNED_TO_HAND') totals.returns += 1;
          if (ev.type === 'REVIVED') totals.revives += 1;
          if (ev.type === 'RETURNED_TO_DECK') totals.deckReturns += 1;
          if (ev.type === 'SAFEGUARD_TRIPPED') totals.safeguards += 1;
          if (ev.type === 'SPELL_EXPIRED') totals.expired += 1;
          if (ev.type === 'SHIELD_CONSUMED') totals.shieldsUsed += 1;
          if (ev.type === 'HEAL') totals.heals += ev.amount;
          if (ev.type === 'TRIGGER' && ev.trigger === 'ROUND_START') totals.roundStart += 1;
          if (ev.type === 'TRIGGER' && ev.trigger === 'ROUND_END') totals.roundEnd += 1;
          if (ev.type === 'HERO_DESTROYED') chain += 1;
          if (ev.type === 'REVEAL') {
            for (const p of ev.placements) played[p.side].add(p.cardId);
            if (chain > totals.chains) totals.chains = chain;
            chain = 0;
          }
          if (ev.type === 'SPELL_RESOLVED') played[ev.side].add(ev.cardId);
        }
        for (const side of ['player', 'enemy']) {
          const win = side === 'player' ? s : 1 - s;
          for (const id of played[side]) {
            const c = cardPlays.get(id) ?? { n: 0, share: 0 };
            c.n += 1;
            c.share += win;
            cardPlays.set(id, c);
          }
        }
      }
      rounds.sort((x, y) => x - y);
      cells.push({ player: a.id, enemy: b.id, winShare: share / games, medianRounds: percentile(rounds, 0.5), p90Rounds: percentile(rounds, 0.9), stalls });
      if (a.id !== b.id) {
        perDeck.get(a.id).share += share / games;
        perDeck.get(a.id).n += 1;
        perDeck.get(b.id).share += 1 - share / games;
        perDeck.get(b.id).n += 1;
      }
    }
  }

  const csv = (rows) => {
    const cols = Object.keys(rows[0]);
    const cell = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : `${v}`);
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
  };
  writeFileSync(resolve(outDir, 'matrix.csv'), csv(cells));
  const decksRows = DECKS.map((d) => ({ deck: d.id, meanWinShare: perDeck.get(d.id).share / perDeck.get(d.id).n }));
  writeFileSync(resolve(outDir, 'decks.csv'), csv(decksRows));
  const cardRows = [...cardPlays.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([cardId, c]) => ({ cardId, matchesPlayed: c.n, winShareWhenPlayed: c.share / c.n }));
  writeFileSync(resolve(outDir, 'cards.csv'), csv(cardRows));
  totals.rounds.sort((x, y) => x - y);
  const summary = {
    games: totals.games,
    medianRounds: percentile(totals.rounds, 0.5),
    p90Rounds: percentile(totals.rounds, 0.9),
    maxRounds: totals.rounds[totals.rounds.length - 1],
    stalls: totals.stalls,
    maxAtkSeen: totals.maxAtk,
    graveyardReturnsPerMatch: (totals.returns + totals.revives + totals.deckReturns) / totals.games,
    longestDestructionRun: totals.chains,
    deathChainSafeguards: totals.safeguards,
    spellsExpiredPerMatch: totals.expired / totals.games,
    roundStartTriggersPerMatch: totals.roundStart / totals.games,
    roundEndTriggersPerMatch: totals.roundEnd / totals.games,
    shieldsUsedPerMatch: totals.shieldsUsed / totals.games,
    healingPerMatch: totals.heals / totals.games,
  };
  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

  const md = ['# Deck matrix on the card resolver', '', `Production card resolver and card AI piloting both sides; seed ${SEED}; ${games} games per ordered pair (the row deck is the player seat). Draws count half. Generated by scripts/simulate-deck-matrix.mjs.`, ''];
  md.push(`| Deck vs | ${DECKS.map((d) => d.id).join(' | ')} | Mean |`, `|---|${DECKS.map(() => '---').join('|')}|---|`);
  for (const a of DECKS) md.push(`| ${a.id} | ${DECKS.map((b) => pct(cells.find((c) => c.player === a.id && c.enemy === b.id).winShare)).join(' | ')} | ${pct(perDeck.get(a.id).share / perDeck.get(a.id).n)} |`);
  md.push('', '## Match health', '', '```json', JSON.stringify(summary, null, 2), '```', '');
  writeFileSync(resolve(outDir, 'MATRIX.md'), md.join('\n') + '\n');
  console.error(`wrote ${outDir}/MATRIX.md`);
} finally {
  await server.close();
}
