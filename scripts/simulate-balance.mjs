import { fork } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Effect / archetype balance measurements (src/game/cardSim/balance.ts) on the approved card-combat baseline:
// the nine-archetype matchup matrix (heuristic pilots and the search pilot), the decision-importance scenarios
// and the Mastery check. Design tool only; nothing in the game reads these files.
//
//   node scripts/simulate-balance.mjs --variant before --out DIR     full run, spread over --jobs processes (default 4)
//   node scripts/simulate-balance.mjs --variant merged --out DIR --heuristic-only   matrix + pilots without the search pilot
//   node scripts/simulate-balance.mjs --out DIR --quick    smoke run
// Variants (rules + card overrides) are in src/game/cardSim/balance/proposal.ts.
// Same arguments -> byte-identical output (every series has a fixed seed; process count does not matter).

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SEED = 20260929;
const quick = flag('--quick');
const outDir = resolve(option('--out', 'balance-results'));
const workers = Number(option('--jobs', 4));
const variantId = option('--variant', 'before');
const heuristicOnly = flag('--heuristic-only');
// --tune: the search-pilot matrix on the nine core decks only (default 80 games per pair), for quick tuning rounds.
const tune = flag('--tune');
const G = {
  matrix: Number(option('--games', quick ? 20 : 400)),
  expertMatrix: quick ? 6 : 200,
  pilots: quick ? 20 : 1000,
  expertPilots: quick ? 6 : 400,
  mastery: quick ? 20 : 1000,
};

async function withSim(fn) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    return await fn({
      B: await server.ssrLoadModule('/src/game/cardSim/balance.ts'),
      P: await server.ssrLoadModule('/src/game/cardSim/balance/proposal.ts'),
      S: await server.ssrLoadModule('/src/game/cardSim/cardSource.ts'),
      X: await server.ssrLoadModule('/src/game/cardSim/experiments.ts'),
    });
  } finally {
    await server.close();
  }
}

const variantModel = (B, X, variant) => (variant.hpcScale ? X.scaledModel(B.approvedModel(), { hpcScale: variant.hpcScale, suffix: ` x${variant.hpcScale} HPC` }) : B.approvedModel());

const buildJobs = (B) => tune ? B.matrixJobs('matrix-expert', Number(option('--games', 80)), SEED, () => 'expert', B.CORE_IDS) : [
  ...B.matrixJobs('matrix-heuristic', G.matrix, SEED),
  ...(heuristicOnly ? [] : B.matrixJobs('matrix-expert', G.expertMatrix, SEED, () => 'expert')),
  ...B.pilotJobs('balanced', G.pilots, SEED),
  ...(heuristicOnly ? [] : B.pilotJobs('expert', G.expertPilots, SEED)),
  ...B.masteryJobs(G.mastery, SEED),
];

if (flag('--worker')) {
  // Child: run every job whose index % n === k, write raw results to a file.
  const [k, n] = option('--worker', '0/1').split('/').map(Number);
  await withSim(async ({ B, X, P }) => {
    const variant = P.getVariant(variantId);
    const model = variantModel(B, X, variant);
    const cards = variant.cards();
    B.setDeckOverrides(variant.decks ?? {});
    const out = {};
    buildJobs(B).forEach((job, i) => {
      if (i % n !== k) return;
      out[job.key] = B.runJob(model, variant.rules, job, cards);
    });
    writeFileSync(option('--file', ''), JSON.stringify(out));
  });
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const started = Date.now();
const log = (msg) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);
const self = fileURLToPath(import.meta.url);
const passArgs = [...(quick ? ['--quick'] : []), ...(heuristicOnly ? ['--heuristic-only'] : []), ...(tune ? ['--tune'] : []), '--variant', variantId];
if (option('--games', null)) passArgs.push('--games', option('--games', ''));
const files = Array.from({ length: workers }, (_, k) => join(outDir, `.worker-${k}.json`));
log(`running on ${workers} processes`);
await Promise.all(files.map((file, k) => new Promise((ok, fail) => {
  const child = fork(self, [...passArgs, '--worker', `${k}/${workers}`, '--file', file], { stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`worker ${k} exited ${code}`))));
})));
const raw = Object.assign({}, ...files.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
for (const f of files) rmSync(f);
log('aggregating');

await withSim(async ({ B, X, P, S }) => {
  const variant = P.getVariant(variantId);
  const model = variantModel(B, X, variant);
  B.setDeckOverrides(variant.decks ?? {});
  const jobs = buildJobs(B);
  const result = (job) => raw[job.key];
  const csv = (name, rows) => {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const cell = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(join(outDir, name), [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n');
  };
  const pick = (s) => ({ games: s.games, winShareA: s.winShareA, ci95: s.ci95, drawRate: s.drawRate, stallRate: s.stallRate, roundsMean: s.roundsMean, roundsMedian: s.roundsMedian, roundsP90: s.roundsP90, directHitsMean: s.directHitsMean, effectDamageMean: s.effectDamageMean, tieRate: s.tieRate });

  const summary = { meta: { seed: SEED, games: G, quick, variant: variant.id, variantLabel: variant.label, rules: variant.rules, overriddenCards: variant.cards().map((c) => c.id), model: model.label, mastery: B.APPROVED_MASTERY.id } };
  for (const group of tune ? ['matrix-expert'] : heuristicOnly ? ['matrix-heuristic'] : ['matrix-heuristic', 'matrix-expert']) {
    const gj = jobs.filter((j) => j.group === group);
    const rep = B.matrixReport(model, gj, gj.map(result));
    summary[group] = rep;
    const ids = B.ARCHETYPES.map((a) => a.id).filter((id) => rep.overall.some((o) => o.deck === id));
    csv(`${group}-grid.csv`, ids.map((a) => ({ deck: a, overall: rep.overall.find((o) => o.deck === a).winShare, ...Object.fromEntries(ids.map((b) => [b, rep.grid[a][b]])) })));
    csv(`${group}-cells.csv`, gj.map((j) => ({ deckA: j.deckA, deckB: j.deckB, pilotA: j.pilotA, pilotB: j.pilotB, ...pick(X.summarize(result(j))) })));
  }
  const pilotRows = jobs.filter((j) => j.group.startsWith('pilots-') || j.group.startsWith('mastery-')).map((j) => ({ group: j.group, label: j.label, deckA: j.deckA, deckB: j.deckB, pilotA: j.pilotA, pilotB: j.pilotB, ...pick(X.summarize(result(j))) }));
  csv('pilot-scenarios.csv', pilotRows);
  summary.pilots = pilotRows;
  if (!heuristicOnly && !tune) {
    log('card outliers (random legal decks)');
    const rows = S.withCardOverrides(variant.cards(), () => X.randomDeckOutliers(model, quick ? 12 : 120, quick ? 2 : 4, SEED, variant.rules));
    csv('card-outliers.csv', rows);
    summary.cardOutliers = rows.slice(0, 12);
  }
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  log(`done -> ${outDir}`);
});
