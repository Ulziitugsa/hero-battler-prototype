import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// Balance pass, Thread D: recursion, growth and token outliers (src/game/cardSim/outliers.ts). Design tool
// only; same seed strategy as scripts/simulate-card-combat.mjs, and nothing in the game reads the output.
//
//   node scripts/simulate-outliers.mjs                 full run, results in ./outlier-results
//   node scripts/simulate-outliers.mjs --out DIR       choose the output folder
//   node scripts/simulate-outliers.mjs --quick         small smoke run
//   node scripts/simulate-outliers.mjs --only a,b      run only these variant ids
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const quick = flag('--quick');
const outDir = resolve(option('--out', 'outlier-results'));
const pairGames = Number(option('--games', quick ? 10 : 200));
const controlGames = quick ? 60 : 1000;
const only = option('--only', '').split(',').filter(Boolean);
const SEED = 20260929;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const X = await server.ssrLoadModule('/src/game/cardSim/experiments.ts');
  const O = await server.ssrLoadModule('/src/game/cardSim/outliers.ts');
  const S = await server.ssrLoadModule('/src/game/cardSim/outlierStudy.ts');
  const P = await server.ssrLoadModule('/src/game/cardSim/cardSource.ts');
  const M = await server.ssrLoadModule('/src/game/cardSim/statModels.ts');
  const D = await server.ssrLoadModule('/src/game/cardSim/decks.ts');
  mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const log = (msg) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);
  const csv = (name, rows) => {
    if (rows.length === 0) return;
    const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(join(outDir, name), [cols.join(','), ...rows.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n') + '\n');
  };

  const model = M.getStatModel('baseline');
  const field = [
    ...D.SIM_DECKS.map((d) => ({ id: d.id, pilot: d.pilot, cards: d.cards })),
    ...O.STRESS_DECKS.map((d) => ({ id: d.id, pilot: 'balanced', cards: d.cards })),
  ];
  const variants = O.OUTLIER_VARIANTS.filter((v) => only.length === 0 || only.includes(v.id));

  const deckRows = [];
  const pairRows = [];
  const summaryRows = [];
  for (const v of variants) {
    log(`field ${v.id}`);
    const r = S.fieldStudy(model, v, field, pairGames, SEED);
    deckRows.push(...r.decks);
    pairRows.push(...r.pairs);
    summaryRows.push({ ...r.summary, label: v.label });
  }
  csv('variant-summary.csv', summaryRows);
  csv('deck-outliers.csv', deckRows);
  csv('pair-shares.csv', pairRows);

  // Card outliers (random legal decks) and the deck-quality vs decision-quality proxy, before and after.
  const outlierRows = [];
  const skillRows = [];
  for (const v of variants) {
    log(`skill proxy ${v.id}`);
    P.withCardOverrides(v.cards, () => {
      if (['approved', 'proposed'].includes(v.id)) for (const row of X.randomDeckOutliers(model, quick ? 12 : 120, quick ? 2 : 4, SEED, v.rules)) outlierRows.push({ variant: v.id, ...row });
      for (const row of X.skillProxy(model, 'high-rarity', 'low-rarity', controlGames, SEED, v.rules)) skillRows.push({ variant: v.id, deck: row.deck, label: row.label, winShareA: row.summary.winShareA, ci95: row.summary.ci95 });
    });
  }
  csv('card-outliers.csv', outlierRows);
  csv('skill-proxy.csv', skillRows);
  log('done');
} finally {
  await server.close();
}
