import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// Effect/archetype balance pass, Thread B (Spell-heavy / control). Design tool only, same seeded simulator and
// seed as scripts/simulate-card-combat.mjs. Every run uses the approved baseline: stat model H, no overflow,
// ties destroy both, one Graveyard return per card, 45 HP per legacy point, Power 7 Legendaries at Power 6.
//
//   node scripts/simulate-control-pass.mjs                 full run, results in ./control-pass-results
//   node scripts/simulate-control-pass.mjs --out DIR       choose the output folder
//   node scripts/simulate-control-pass.mjs --games 200     games per deck pair in each matrix (default 200)
//   node scripts/simulate-control-pass.mjs --quick         smoke run
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const quick = flag('--quick');
const outDir = resolve(option('--out', 'control-pass-results'));
const pairGames = Number(option('--games', quick ? 12 : 200));
const controlGames = quick ? 60 : 1000;
const SEED = 20260929;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const X = await server.ssrLoadModule('/src/game/cardSim/experiments.ts');
  const E = await server.ssrLoadModule('/src/game/cardSim/engine.ts');
  const AI = await server.ssrLoadModule('/src/game/cardSim/ai.ts');
  const D = await server.ssrLoadModule('/src/game/cardSim/decks.ts');
  const O = await server.ssrLoadModule('/src/game/cardSim/overrides.ts');
  const C = await server.ssrLoadModule('/src/game/cardSim/controlPass.ts');
  mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const log = (msg) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);
  const cell = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = (name, rows) => {
    if (rows.length === 0) return;
    const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    writeFileSync(join(outDir, name), [cols.join(','), ...rows.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n') + '\n');
  };
  const r3 = (x) => Math.round(x * 1000) / 1000;

  const model = X.getStatModel('baseline');
  const rules = { ...E.BASE_RULES, recursionCap: 1 };
  const fieldV1 = D.SIM_DECKS;
  const fieldV2 = D.SIM_DECKS.map((d) => (d.id === 'arch-mage' ? C.ARCANE_CONTROL_V2_DECK : d));
  const REQUIRED = ['aggressive', 'balanced', 'defensive', 'spell-heavy', 'arch-mage', 'starter-kingdom', 'starter-undead', 'starter-infernal', 'high-rarity', 'low-rarity'];
  // Decks Threads A, C and D are changing: the "mid field" excludes the four decks C is nerfing, as a rough
  // stand-in for the balanced meta the pass is aiming at.
  const TOP = new Set(['high-rarity', 'aggressive', 'starter-infernal', 'starter-kingdom']);

  const withPatches = (sets, fn) => O.withCardPatches([O.APPROVED_REBAND, ...sets], fn);
  const set = (key) => C.CONTROL_PATCH_SETS[key];
  const proposalSets = C.CONTROL_PROPOSAL_KEYS.map(set);

  const scenarios = [
    ['printed (Arcane Control 7U)', fieldV1, []],
    ['printed (Arcane Control v2 8U)', fieldV2, []],
    ['proposal', fieldV2, proposalSets],
    ...C.CONTROL_PROPOSAL_KEYS.map((k) => [`only ${k}`, fieldV2, [set(k)]]),
    ...C.CONTROL_PROPOSAL_KEYS.map((k) => [`proposal minus ${k}`, fieldV2, C.CONTROL_PROPOSAL_KEYS.filter((x) => x !== k).map(set)]),
    ['proposal, Stasis = PACIFY only (no -15)', fieldV2, [set('stasisPacify'), ...C.CONTROL_PROPOSAL_KEYS.filter((x) => x !== 'stasisPacifyMark').map(set)]],
    ['proposal, Aegis = 135 HP shield', fieldV2, [set('aegisShield3'), ...C.CONTROL_PROPOSAL_KEYS.filter((x) => x !== 'aegisUnitShield').map(set)]],
    ['proposal, Arcane Bolt 90/+90', fieldV2, [...proposalSets, set('bolt2plus2')]],
  ];

  const standingRows = [];
  const summaryRows = [];
  const matchupRows = [];
  for (const [name, field, sets] of scenarios) {
    log(`matrix: ${name}`);
    const { rows, pooled } = withPatches(sets, () => X.runMatrix(model, field, pairGames, SEED, { rules, variant: name }));
    const standings = X.deckStandings(rows);
    const mid = new Map();
    for (const row of rows) {
      for (const [me, foe, share] of [[row.deckA, row.deckB, row.summary.winShareA], [row.deckB, row.deckA, 1 - row.summary.winShareA]]) {
        if (TOP.has(foe) || me === foe) continue;
        const e = mid.get(me) ?? { w: 0, n: 0 };
        e.w += share;
        e.n += 1;
        mid.set(me, e);
      }
    }
    for (const s of standings) standingRows.push({ scenario: name, deck: s.deck, fieldWinShare: s.winShare, midFieldWinShare: r3(mid.get(s.deck).w / mid.get(s.deck).n), games: s.games });
    const sum = X.summarize(pooled);
    summaryRows.push({ scenario: name, minDeck: Math.min(...standings.map((s) => s.winShare)), maxDeck: Math.max(...standings.map((s) => s.winShare)), roundsMean: sum.roundsMean, roundsMedian: sum.roundsMedian, roundsP90: sum.roundsP90, drawRate: sum.drawRate, stallRate: sum.stallRate, directHitsMean: sum.directHitsMean, effectDamageMean: sum.effectDamageMean, killShotEffectPct: sum.killShotEffectPct });
    if (name.startsWith('printed') || name === 'proposal') for (const r of rows) matchupRows.push({ scenario: name, deckA: r.deckA, deckB: r.deckB, winShareA: r.summary.winShareA, ci95: r.summary.ci95, drawRate: r.summary.drawRate, roundsMedian: r.summary.roundsMedian, roundsP90: r.summary.roundsP90 });
  }
  csv('standings.csv', standingRows);
  csv('scenario-summary.csv', summaryRows);
  csv('matchups.csv', matchupRows);

  // Matrix of the required archetypes (row deck's win share vs column deck), before and after.
  const matrixMd = [];
  for (const scenario of ['printed (Arcane Control v2 8U)', 'proposal']) {
    const share = (a, b) => {
      const r = matchupRows.find((m) => m.scenario === scenario && m.deckA === a && m.deckB === b);
      if (r) return r.winShareA;
      const q = matchupRows.find((m) => m.scenario === scenario && m.deckA === b && m.deckB === a);
      return q ? r3(1 - q.winShareA) : null;
    };
    matrixMd.push(`### ${scenario}`, '', `| row vs col | ${REQUIRED.join(' | ')} | field |`, `|${'---|'.repeat(REQUIRED.length + 2)}`);
    for (const a of REQUIRED) {
      const field = standingRows.find((s) => s.scenario === scenario && s.deck === a).fieldWinShare;
      matrixMd.push(`| ${a} | ${REQUIRED.map((b) => (a === b ? '-' : share(a, b).toFixed(2))).join(' | ')} | ${field.toFixed(3)} |`);
    }
    matrixMd.push('');
  }
  writeFileSync(join(outDir, 'matrix.md'), matrixMd.join('\n'));

  // Skill proxies: how much good play is worth, before and after.
  log('skill proxies');
  const skillRows = [];
  const pairs = [
    ['arch-mage', 'arch-mage', 'balanced', 'random', 'Arcane Control mirror: good vs random'],
    ['spell-heavy', 'spell-heavy', 'balanced', 'random', 'Spell-heavy mirror: good vs random'],
    ['balanced', 'balanced', 'balanced', 'random', 'Balanced mirror: good vs random'],
    ['high-rarity', 'arch-mage', 'random', 'balanced', 'High rarity random vs Arcane Control good'],
    ['high-rarity', 'arch-mage', 'balanced', 'balanced', 'High rarity good vs Arcane Control good'],
    ['aggressive', 'arch-mage', 'random', 'balanced', 'Aggressive random vs Arcane Control good'],
    ['balanced', 'arch-mage', 'random', 'balanced', 'Balanced random vs Arcane Control good'],
    ['arch-mage', 'balanced', 'random', 'balanced', 'Arcane Control random vs Balanced good'],
  ];
  const deckOf = (id) => fieldV2.find((d) => d.id === id);
  for (const [scenario, sets] of [['printed (Arcane Control v2 8U)', []], ['proposal', proposalSets]]) {
    for (const [a, b, pa, pb, label] of pairs) {
      const res = withPatches(sets, () => X.runSeries({ model, rules, a: { deck: deckOf(a).cards, policy: pa }, b: { deck: deckOf(b).cards, policy: pb }, games: controlGames, seed: SEED }));
      const s = X.summarize(res);
      skillRows.push({ scenario, label, deckA: a, pilotA: pa, deckB: b, pilotB: pb, winShareA: s.winShareA, ci95: s.ci95, roundsMedian: s.roundsMedian });
    }
  }
  csv('skill-proxy.csv', skillRows);

  // Traced matches: Arcane Control vs the field, per-round burst, recursion use, prevention, card stats.
  log('traces');
  const traceRows = [];
  const cardRows = [];
  for (const [scenario, sets] of [['printed (Arcane Control v2 8U)', []], ['proposal', proposalSets]]) {
    withPatches(sets, () => {
      for (const me of ['arch-mage', 'spell-heavy']) {
        const A = deckOf(me);
        const cardStats = new Map();
        const acc = { games: 0, wins: 0, maxRoundEffect: 0, p99RoundEffect: [], returns: 0, prevented: 0, healed: 0, effectDealt: 0, directTaken: 0, cardsLeftAtR7: 0, unitsAtR8: 0, oppUnitsAtR8: 0, r8: 0 };
        for (const B of fieldV2) {
          if (B.id === me) continue;
          for (let i = 0; i < (quick ? 6 : 60); i++) {
            const aFirst = i % 2 === 0;
            const sides = aFirst ? [{ deck: A.cards, policy: A.pilot }, { deck: B.cards, policy: B.pilot }] : [{ deck: B.cards, policy: B.pilot }, { deck: A.cards, policy: A.pilot }];
            const s = E.createSimState({ model, rules, sides, seed: SEED + i * 7919, cardStats });
            const a = aFirst ? 0 : 1;
            const b = 1 - a;
            let winner = null;
            while (s.round <= rules.maxRounds) {
              E.beginRound(s);
              const eff = s.totals[a].effectDamage;
              const plays = [AI.choosePlays(s, 0), AI.choosePlays(s, 1)];
              const round = s.round;
              E.resolveRound(s, plays);
              const burst = s.totals[a].effectDamage - eff;
              acc.maxRoundEffect = Math.max(acc.maxRoundEffect, burst);
              if (burst > 0) acc.p99RoundEffect.push(burst);
              if (round === 7) acc.cardsLeftAtR7 += s.players[a].deck.length + s.players[a].hand.length - (s.players[b].deck.length + s.players[b].hand.length);
              if (round === 8) {
                acc.r8++;
                acc.unitsAtR8 += s.players[a].units.filter(Boolean).length;
                acc.oppUnitsAtR8 += s.players[b].units.filter(Boolean).length;
              }
              const deadA = s.players[a].hp <= 0;
              const deadB = s.players[b].hp <= 0;
              if (deadA || deadB) {
                winner = deadA && deadB ? null : deadA ? b : a;
                break;
              }
              if (E.isExhausted(s)) break;
            }
            acc.games++;
            if (winner === a) acc.wins++;
            acc.returns += Object.values(s.players[a].returns).reduce((x, y) => x + y, 0);
            acc.prevented += s.totals[a].prevented;
            acc.healed += s.totals[a].healed;
            acc.effectDealt += s.totals[a].effectDamage;
            acc.directTaken += s.totals[b].directDamage;
          }
        }
        const burst = [...acc.p99RoundEffect].sort((x, y) => x - y);
        traceRows.push({
          scenario,
          deck: me,
          games: acc.games,
          winRate: r3(acc.wins / acc.games),
          graveyardReturnsPerMatch: r3(acc.returns / acc.games),
          preventedPerMatch: Math.round(acc.prevented / acc.games),
          healedPerMatch: Math.round(acc.healed / acc.games),
          effectDamagePerMatch: Math.round(acc.effectDealt / acc.games),
          directDamageTakenPerMatch: Math.round(acc.directTaken / acc.games),
          cardAdvantageAtRound7: r3(acc.cardsLeftAtR7 / acc.games),
          unitsAtRound8: r3(acc.unitsAtR8 / Math.max(1, acc.r8)),
          oppUnitsAtRound8: r3(acc.oppUnitsAtR8 / Math.max(1, acc.r8)),
          effectBurstP99: burst.length ? burst[Math.floor(0.99 * (burst.length - 1))] : 0,
          effectBurstMax: acc.maxRoundEffect,
        });
        for (const [cardId, c] of cardStats) {
          if (!A.cards.includes(cardId)) continue;
          cardRows.push({ scenario, deck: me, cardId, played: c.played, effectDamagePerPlay: r3(c.effectDamage / Math.max(1, c.played)), healPerPlay: r3(c.heal / Math.max(1, c.played)), clashWinRate: r3(c.clashWins / Math.max(1, c.clashWins + c.clashLosses + c.clashTies)) });
        }
      }
    });
  }
  csv('control-traces.csv', traceRows);
  csv('control-card-stats.csv', cardRows.sort((x, y) => (x.deck + x.cardId + x.scenario).localeCompare(y.deck + y.cardId + y.scenario)));
  log(`done -> ${outDir}`);
} finally {
  await server.close();
}
