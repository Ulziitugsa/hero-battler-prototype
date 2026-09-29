import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// Balance pass, Thread A (defensive decks). Runs the seeded card-combat simulator on the approved rules
// (no overflow, one Graveyard return per card, 45 HP per legacy point, Power 7 Legendaries at Power 6)
// before and after the proposed defensive effect changes in src/game/cardSim/balance/defensive.ts.
//
//   node scripts/simulate-balance-defensive.mjs                 full run (~3 min), results in ./balance-defensive-results
//   node scripts/simulate-balance-defensive.mjs --out DIR       choose the output folder
//   node scripts/simulate-balance-defensive.mjs --quick         small smoke run
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const quick = args.includes('--quick');
const outDir = resolve(option('--out', 'balance-defensive-results'));
const pairGames = quick ? 12 : 200;
const sweepGames = quick ? 8 : 100;
const controlGames = quick ? 60 : 1000;
const SEED = 20260929;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const X = await server.ssrLoadModule('/src/game/cardSim/experiments.ts');
  const E = await server.ssrLoadModule('/src/game/cardSim/engine.ts');
  const M = await server.ssrLoadModule('/src/game/cardSim/statModels.ts');
  const D = await server.ssrLoadModule('/src/game/cardSim/decks.ts');
  const C = await server.ssrLoadModule('/src/game/cardSim/cardSource.ts');
  const B = await server.ssrLoadModule('/src/game/cardSim/balance/defensive.ts');
  const L = await server.ssrLoadModule('/src/game/cards/index.ts');
  mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const log = (msg) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const csv = (name, rows) => {
    if (rows.length === 0) return;
    const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(join(outDir, name), [cols.join(','), ...rows.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n') + '\n');
  };

  const model = M.getStatModel('baseline');
  const rules = { ...E.BASE_RULES, recursionCap: 1 };
  const decks = [...D.SIM_DECKS, B.BULWARK_SIM_DECK];
  const approved = B.overrideMap(B.APPROVED_BASELINE_OVERRIDES);
  const proposed = B.overrideMap(B.APPROVED_BASELINE_OVERRIDES, B.DEFENSIVE_OVERRIDES);
  const configs = [['baseline', approved], ['proposed', proposed]];
  const summary = { meta: { seed: SEED, pairGames, sweepGames, controlGames, quick, rules, decks: decks.map((d) => ({ id: d.id, pilot: d.pilot, cards: d.cards })) } };

  // 1. Full field round-robin, before and after
  const standingRows = [];
  const matchupRows = [];
  const pooledRows = [];
  const cardRows = [];
  const standingsBy = {};
  for (const [config, map] of configs) {
    log(`field ${config}`);
    const cardStats = new Map();
    const { rows, pooled } = C.withCardOverrides(map, () => X.runMatrix(model, decks, pairGames, SEED, { rules, cardStats }));
    const standings = X.deckStandings(rows);
    standingsBy[config] = standings;
    for (const s of standings) standingRows.push({ config, ...s });
    for (const r of rows) matchupRows.push({ config, deckA: r.deckA, deckB: r.deckB, startHpA: r.startHpA, startHpB: r.startHpB, ...r.summary });
    const s = X.summarize(pooled);
    pooledRows.push({ config, games: s.games, roundsMean: s.roundsMean, roundsMedian: s.roundsMedian, roundsP90: s.roundsP90, drawRate: s.drawRate, stallRate: s.stallRate, directHitsMean: s.directHitsMean, winnerDirectHitsMean: s.winnerDirectHitsMean, killShotDirectPct: s.killShotDirectPct, tieRate: s.tieRate });
    for (const id of ['und-dark-priest', 'und-grave-knight', 'und-crypt-warden', 'kng-light-priest', 'kng-paladin', 'kng-royal-guard']) {
      const c = cardStats.get(id);
      if (!c) continue;
      const clashes = c.clashWins + c.clashLosses + c.clashTies;
      cardRows.push({ config, cardId: id, played: c.played, clashWinRate: r3(c.clashWins / Math.max(1, clashes)), clashTieRate: r3(c.clashTies / Math.max(1, clashes)), directDamagePerPlay: Math.round(c.directDamage / Math.max(1, c.played)), healPerPlay: Math.round(c.heal / Math.max(1, c.played)) });
    }
  }
  csv('standings.csv', standingRows);
  csv('matchups.csv', matchupRows);
  csv('pooled.csv', pooledRows);
  csv('card-stats.csv', cardRows);
  summary.standings = standingRows;
  summary.pooled = pooledRows;
  summary.cards = cardRows;

  // 2. Balanced-meta proxy: each deck's win share against the decks that sat inside 0.35-0.65 at baseline
  //    (the extremes are Thread B's and Thread C's to move).
  const midField = standingsBy.baseline.filter((s) => s.winShare >= 0.35 && s.winShare <= 0.65).map((s) => s.deck);
  const midRows = [];
  for (const [config] of configs) {
    const rows = matchupRows.filter((r) => r.config === config && r.deckA !== r.deckB);
    for (const deck of decks) {
      let w = 0;
      let n = 0;
      for (const r of rows) {
        if (r.deckA === deck.id && midField.includes(r.deckB)) {
          w += r.winShareA * r.games;
          n += r.games;
        }
        if (r.deckB === deck.id && midField.includes(r.deckA)) {
          w += (1 - r.winShareA) * r.games;
          n += r.games;
        }
      }
      midRows.push({ config, deck: deck.id, vsMidField: r3(w / Math.max(1, n)), games: n });
    }
  }
  csv('mid-field.csv', midRows);
  summary.midField = { decks: midField, rows: midRows };

  // 3. Archetype matrix (proposed): row deck's win share against column deck
  const archetypes = ['aggressive', 'balanced', 'defensive', 'defensive-bulwark', 'spell-heavy', 'starter-kingdom', 'starter-undead', 'starter-infernal', 'high-rarity', 'low-rarity'];
  const matrixRows = [];
  for (const [config] of configs) {
    for (const a of archetypes) {
      const row = { config, deck: a };
      for (const b of archetypes) {
        const hit = matchupRows.find((r) => r.config === config && ((r.deckA === a && r.deckB === b) || (r.deckA === b && r.deckB === a)));
        row[b] = hit ? (hit.deckA === a ? hit.winShareA : r3(1 - hit.winShareA)) : '';
      }
      row.field = standingsBy[config].find((s) => s.deck === a)?.winShare;
      matrixRows.push(row);
    }
  }
  csv('archetype-matrix.csv', matrixRows);
  summary.matrix = matrixRows;

  // 4. Guard sensitivity: Dark Priest / Grave Knight Guard amounts
  const guardRows = [];
  for (const [dp, gk] of [[0, 0], [2, 0], [0, 2], [2, 2], [3, 2], [2, 3], [3, 3]]) {
    log(`guard sweep DP ${dp} / GK ${gk}`);
    const variant = [];
    if (dp) variant.push({ ...L.getCard('und-dark-priest'), abilities: [B.guard(dp), L.getCard('und-dark-priest').abilities[1]] });
    if (gk) variant.push({ ...L.getCard('und-grave-knight'), abilities: [B.guard(gk), L.getCard('und-grave-knight').abilities[1]] });
    const { rows } = C.withCardOverrides(B.overrideMap(B.APPROVED_BASELINE_OVERRIDES, variant), () => X.runMatrix(model, decks, sweepGames, SEED, { rules }));
    const st = Object.fromEntries(X.deckStandings(rows).map((s) => [s.deck, s.winShare]));
    guardRows.push({ darkPriestGuard: dp, graveKnightGuard: gk, defensive: st.defensive, bulwark: st['defensive-bulwark'], undead: st['starter-undead'], lowRarity: st['low-rarity'], aggressive: st.aggressive, highRarity: st['high-rarity'], kingdom: st['starter-kingdom'], infernal: st['starter-infernal'], max: Math.max(...Object.values(st)), min: Math.min(...Object.values(st)) });
  }
  csv('guard-sweep.csv', guardRows);
  summary.guardSweep = guardRows;

  // 5. Decision importance around the defensive deck (1,000 games per cell)
  log('decision importance');
  const skillRows = [];
  const bulwark = B.BULWARK_SIM_DECK;
  for (const [config, map] of configs) {
    C.withCardOverrides(map, () => {
      const cases = [
        ['bulwark mirror: good vs random', { deck: bulwark.cards, policy: 'defensive' }, { deck: bulwark.cards, policy: 'random' }],
        ['bulwark (good) vs aggressive (good)', { deck: bulwark.cards, policy: 'defensive' }, { deck: D.AGGRESSIVE_DECK, policy: 'aggressive' }],
        ['bulwark (good) vs aggressive (random)', { deck: bulwark.cards, policy: 'defensive' }, { deck: D.AGGRESSIVE_DECK, policy: 'random' }],
        ['bulwark (random) vs aggressive (good)', { deck: bulwark.cards, policy: 'random' }, { deck: D.AGGRESSIVE_DECK, policy: 'aggressive' }],
        ['bulwark (good) vs high rarity (random)', { deck: bulwark.cards, policy: 'defensive' }, { deck: D.HIGH_RARITY_DECK, policy: 'random' }],
        ['bulwark (good) vs high rarity (good)', { deck: bulwark.cards, policy: 'defensive' }, { deck: D.HIGH_RARITY_DECK, policy: 'balanced' }],
      ];
      for (const [label, a, b] of cases) {
        const s = X.summarize(X.runSeries({ model, rules, a, b, games: controlGames, seed: SEED }));
        skillRows.push({ config, case: label, winShareA: s.winShareA, ci95: s.ci95, roundsMedian: s.roundsMedian, drawRate: s.drawRate });
      }
    });
  }
  csv('decision-importance.csv', skillRows);
  summary.skill = skillRows;

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  log(`done -> ${outDir}`);
} finally {
  await server.close();
}
