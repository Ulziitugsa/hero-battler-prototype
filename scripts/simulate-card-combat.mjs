import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// Card-combat simulation runner (docs/CARD-COMBAT-SIMULATION.md). Design tool only: it loads the live card
// data and the simulator in src/game/cardSim through Vite, runs every experiment with fixed seeds, and writes
// raw tables. Nothing in the game reads these files and no saved player data is touched.
//
//   node scripts/simulate-card-combat.mjs                    full run (~10 min), results in ./card-sim-results
//   node scripts/simulate-card-combat.mjs --out DIR          choose the output folder
//   node scripts/simulate-card-combat.mjs --games 200        games per deck pair in each matrix (default 200)
//   node scripts/simulate-card-combat.mjs --quick            small smoke run (~20 s)
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const quick = flag('--quick');
const outDir = resolve(option('--out', 'card-sim-results'));
const pairGames = Number(option('--games', quick ? 12 : 200));
const controlGames = quick ? 60 : 1000;
const SEED = 20260929;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const X = await server.ssrLoadModule('/src/game/cardSim/experiments.ts');
  const E = await server.ssrLoadModule('/src/game/cardSim/engine.ts');
  const M = await server.ssrLoadModule('/src/game/cardSim/statModels.ts');
  const D = await server.ssrLoadModule('/src/game/cardSim/decks.ts');
  mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const log = (msg) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);
  const csv = (name, rows) => {
    if (rows.length === 0) return;
    const flat = rows.map((row) => flatten(row));
    const cols = [...new Set(flat.flatMap((row) => Object.keys(row)))];
    const cell = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(join(outDir, name), [cols.join(','), ...flat.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n') + '\n');
  };
  const flatten = (obj, prefix = '') => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, `${prefix}${k}.`));
      else out[`${prefix}${k}`] = Array.isArray(v) ? v.join('|') : v;
    }
    return out;
  };

  const decks = D.SIM_DECKS;
  const baseline = M.getStatModel('baseline');
  // The recommended baseline: stat model H with the spec's clash rules plus one Graveyard return per card.
  const recommendedModel = baseline;
  const RECOMMENDED_RULES = { ...E.BASE_RULES, recursionCap: 1 };
  const summary = { meta: { seed: SEED, pairGames, controlGames, quick, decks: decks.map((d) => ({ id: d.id, label: d.label, pilot: d.pilot, cards: d.cards })) } };

  // 1. Roster stats and deck profiles per model
  const rosterRows = [];
  const profileRows = [];
  const tieChance = [];
  for (const model of M.STAT_MODELS) {
    for (const row of X.rosterStats(model)) rosterRows.push({ model: model.id, ...row });
    profileRows.push(...X.deckProfiles(model));
    tieChance.push({ model: model.id, printedAtkTieChance: X.rosterTieChance(model) });
  }
  csv('roster-stats.csv', rosterRows);
  csv('deck-profiles.csv', profileRows);

  // 2. Archetype matrix per candidate model (natural pilots)
  const modelRows = [];
  const matchupRows = [];
  const standingRows = [];
  for (const model of M.STAT_MODELS) {
    log(`matrix ${model.id}`);
    const { rows, pooled } = X.runMatrix(model, decks, pairGames, SEED, { includeMirrors: true });
    matchupRows.push(...rows);
    const standings = X.deckStandings(rows);
    for (const s of standings) standingRows.push({ model: model.id, variant: 'base', ...s });
    const hp = X.deckProfiles(model).map((p) => p.startingHp);
    const mirrors = rows.filter((r) => r.deckA === r.deckB);
    const mirrorSeat0 = mirrors.reduce((a, r) => a + r.summary.seat0WinRate * r.summary.games, 0) / Math.max(1, mirrors.reduce((a, r) => a + r.summary.games, 0));
    const spread = standings.map((s) => s.winShare);
    const hiLo = rows.find((r) => r.deckA === 'high-rarity' && r.deckB === 'low-rarity');
    modelRows.push({
      model: model.id,
      label: model.label,
      variant: 'base',
      startingHpMin: Math.min(...hp),
      startingHpMax: Math.max(...hp),
      printedAtkTieChance: X.rosterTieChance(model),
      mirrorSeat0WinRate: Math.round(mirrorSeat0 * 1000) / 1000,
      deckWinShareMin: Math.min(...spread),
      deckWinShareMax: Math.max(...spread),
      highVsLowRarity: hiLo ? hiLo.summary.winShareA : null,
      ...X.summarize(pooled),
    });
  }

  // 3. Rule and scale variants on stat model H (baseline)
  const variants = [
    ['tie-none', { rules: { ...E.BASE_RULES, tie: 'none' } }],
    ['overflow-on', { rules: { ...E.BASE_RULES, overflow: true } }],
    ['death-at-0-atk', { rules: { ...E.BASE_RULES, deathAtk: 0 } }],
    ['direct-75pct', { rules: { ...E.BASE_RULES, directScale: 0.75 } }],
    ['overflow+recursion-once', { rules: { ...E.BASE_RULES, overflow: true, recursionCap: 1 } }],
    ['recommended', { rules: RECOMMENDED_RULES, model: recommendedModel }],
    ['recommended+hp-unit-25', { rules: RECOMMENDED_RULES, model: M.scaledModel(baseline, { hpUnit: 25, suffix: '+hpUnit25' }) }],
    ['recommended+hp-unit-55', { rules: RECOMMENDED_RULES, model: M.scaledModel(baseline, { hpUnit: 55, suffix: '+hpUnit55' }) }],
    // Starting HP scale sweep, on the recommended rules
    ...[0.8, 1.2, 1.33, 1.6].map((k) => [`recommended+hpc-x${k}`, { rules: RECOMMENDED_RULES, model: M.scaledModel(recommendedModel, { hpcScale: k, suffix: `+hpc x${k}` }) }]),
  ];
  for (const [variant, v] of variants) {
    log(`variant ${variant}`);
    const model = v.model ?? baseline;
    const { rows, pooled } = X.runMatrix(model, decks, pairGames, SEED, { rules: v.rules, variant, includeMirrors: true });
    matchupRows.push(...rows);
    const standings = X.deckStandings(rows);
    for (const s of standings) standingRows.push({ model: model.id, variant, ...s });
    const hp = X.deckProfiles(model).map((p) => p.startingHp);
    const spread = standings.map((s) => s.winShare);
    const hiLo = rows.find((r) => r.deckA === 'high-rarity' && r.deckB === 'low-rarity');
    modelRows.push({ model: model.id, label: model.label, variant, startingHpMin: Math.min(...hp), startingHpMax: Math.max(...hp), printedAtkTieChance: X.rosterTieChance(model), deckWinShareMin: Math.min(...spread), deckWinShareMax: Math.max(...spread), highVsLowRarity: hiLo ? hiLo.summary.winShareA : null, ...X.summarize(pooled) });
  }
  csv('model-summary.csv', modelRows);
  csv('matchups.csv', matchupRows.map((r) => ({ model: r.model, variant: r.variant, deckA: r.deckA, deckB: r.deckB, pilotA: r.pilotA, pilotB: r.pilotB, startHpA: r.startHpA, startHpB: r.startHpB, ...r.summary })));
  csv('deck-standings.csv', standingRows);
  summary.models = modelRows;
  summary.tieChance = tieChance;

  // 4. Controlled experiments on model H under three rule sets: the spec's rules, the live overflow rule, and the recommended baseline
  const RULESETS = [['no-overflow', E.BASE_RULES, baseline], ['overflow', { ...E.BASE_RULES, overflow: true }, baseline], ['recommended', RECOMMENDED_RULES, recommendedModel]];
  const tag = (ruleset, rows) => rows.map((row) => ({ rules: ruleset, ...row }));
  const premiumRows = [];
  const masteryRows = [];
  const masteryCrossRows = [];
  const skillRows = [];
  const styleRows = [];
  const unitRows = [];
  const premiums = [{ atk: 0, hpc: 0 }, { atk: 1, hpc: 0 }, { atk: 3, hpc: 0 }, { atk: 5, hpc: 0 }, { atk: 8, hpc: 0 }, { atk: 15, hpc: 0 }, { atk: 0, hpc: 5 }, { atk: 0, hpc: 10 }, { atk: 0, hpc: 20 }, { atk: 0, hpc: 40 }, { atk: 0, hpc: 80 }];
  const crossDecks = ['starter-kingdom', 'starter-undead', 'starter-infernal', 'balanced', 'aggressive', 'arch-general'];
  for (const [ruleset, rules, model] of RULESETS) {
    log(`stat premium sweep (${ruleset})`);
    premiumRows.push(...tag(ruleset, X.statPremiumSweep(model, ['balanced', 'starter-kingdom', 'aggressive'], premiums, controlGames, SEED, rules)));
    log(`mastery mirrors (${ruleset})`);
    masteryRows.push(...tag(ruleset, X.masteryMirrors(model, ['balanced', 'starter-kingdom', 'aggressive'], controlGames, SEED, M.MASTERY_OPTIONS, rules)));
    log(`mastery cross-deck (${ruleset})`);
    masteryCrossRows.push(...tag(ruleset, X.masteryCross(model, crossDecks, quick ? 20 : 200, SEED, M.MASTERY_OPTIONS, rules)));
    log(`skill proxy (${ruleset})`);
    skillRows.push(...tag(ruleset, [...X.skillProxy(model, 'high-rarity', 'low-rarity', controlGames, SEED, rules), ...X.skillProxy(model, 'aggressive', 'balanced', controlGames, SEED, rules), ...X.skillProxy(model, 'starter-infernal', 'starter-undead', controlGames, SEED, rules)]));
    log(`style matrix (${ruleset})`);
    styleRows.push(...tag(ruleset, [...X.styleMatrix(model, 'balanced', controlGames, SEED, rules), ...X.styleMatrix(model, 'starter-kingdom', controlGames, SEED, rules)]));
    log(`unit count sweep (${ruleset})`);
    unitRows.push(...tag(ruleset, X.unitCountSweep(model, controlGames, SEED, rules)));
  }
  csv('stat-premium.csv', premiumRows);
  csv('mastery.csv', masteryRows);
  csv('mastery-cross.csv', masteryCrossRows);
  csv('skill-proxy.csv', skillRows);
  csv('style-matrix.csv', styleRows);
  csv('unit-count.csv', unitRows);

  // Clash-level band crossing: does M5 of a Power-N card reach an M1 Power-(N+1) card?
  const bandRows = [];
  for (const model of [M.getStatModel('preview'), baseline]) {
    const units = X.rosterStats(model);
    for (const option of M.MASTERY_OPTIONS) {
      let crossings = 0;
      let pairs = 0;
      for (const lo of units) for (const hi of units) {
        if (hi.power !== lo.power + 1) continue;
        pairs++;
        const m5 = M.masteredStats({ atk: lo.atk, hpc: lo.hpc }, { option, stage: 5 });
        if (m5.atk >= hi.atk) crossings++;
      }
      bandRows.push({ model: model.id, option: option.id, pairsPowerNvsNplus1: pairs, m5ReachesNextBand: crossings, share: Math.round((crossings / Math.max(1, pairs)) * 1000) / 1000 });
    }
  }
  csv('mastery-band-crossing.csv', bandRows);

  const outlierRows = [];
  for (const [ruleset, rules, model] of RULESETS) {
    log(`random-deck outliers (${ruleset})`);
    outlierRows.push(...tag(ruleset, X.randomDeckOutliers(model, quick ? 12 : 120, quick ? 2 : 6, SEED, rules)));
  }
  csv('card-outliers.csv', outlierRows);

  summary.premium = premiumRows;
  summary.mastery = masteryRows;
  summary.masteryCross = masteryCrossRows;
  summary.bandCrossing = bandRows;
  summary.skill = skillRows;
  summary.style = styleRows;
  summary.unitCount = unitRows;
  summary.outliers = outlierRows;
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  log(`done -> ${outDir}`);
} finally {
  await server.close();
}
