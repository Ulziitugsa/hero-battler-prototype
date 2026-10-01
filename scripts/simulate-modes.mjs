import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// Campaign + Ranked re-simulation on the PRODUCTION card resolver and card AI (src/game/cardCombat), the numbers behind
// each Campaign encounter's Easy / Fair / Hard and objective thresholds and the Ranked tier decks
// (docs/CARD-COMBAT-DESIGN.md, "Card combat everywhere"). Design tool only: nothing in the game reads the output.
//
//   node scripts/simulate-modes.mjs                 full run, results in ./mode-sim-results
//   node scripts/simulate-modes.mjs --out DIR       choose the output folder
//   node scripts/simulate-modes.mjs --games 300     games per row (default 300 Campaign, 200 Ranked)
//   node scripts/simulate-modes.mjs --quick         small smoke run
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const quick = args.includes('--quick');
const outDir = resolve(option('--out', 'mode-sim-results'));
const campaignGames = Number(option('--games', quick ? 20 : 300));
const rankedGames = Number(option('--games', quick ? 20 : 200));
const SEED = 20261001;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const S = await server.ssrLoadModule('/src/game/cardCombat/simulate.ts');
  const ST = await server.ssrLoadModule('/src/game/cardCombat/stats.ts');
  const C = await server.ssrLoadModule('/src/game/campaign/chapter1.ts');
  const B = await server.ssrLoadModule('/src/game/campaign/battleSetup.ts');
  const P = await server.ssrLoadModule('/src/game/campaign/progress.ts');
  const AS = await server.ssrLoadModule('/src/game/ascension/store.ts');
  const MS = await server.ssrLoadModule('/src/game/engine/stats.ts');
  const SD = await server.ssrLoadModule('/src/game/cards/starterDecks.ts');
  const T = await server.ssrLoadModule('/src/game/ranked/tiers.ts');
  mkdirSync(outDir, { recursive: true });

  const pct = (x) => `${(100 * x).toFixed(0)}%`;
  const noAscension = AS.sanitizeAscension(null);
  const STARTERS = ['kingdom', 'undead', 'infernal'];

  // ---- Campaign ---------------------------------------------------------------------------------------------------
  const campaignRows = [];
  for (const node of C.CHAPTER_1.nodes.filter((n) => n.encounter)) {
    for (const faction of STARTERS) {
      const playerDeck = SD.STARTER_DECKS[faction];
      const plan = B.campaignBattlePlan(node, playerDeck, noAscension);
      const series = S.runCardSeries({ playerDeck, enemyDeck: plan.enemyDeck, startingHpOverride: plan.startingHpOverride }, campaignGames, SEED);
      // Objective hit rates over the games won, read by the game's own objective checks from the real event log.
      const objectiveHits = Object.fromEntries(node.encounter.objectives.map((o) => [o.id, 0]));
      let wins = 0;
      for (let i = 0; i < campaignGames; i++) {
        const r = S.playCardAiMatch({ playerDeck, enemyDeck: plan.enemyDeck, startingHpOverride: plan.startingHpOverride, seed: (SEED + i * 7919) >>> 0 }, { keepEvents: true });
        if (r.status !== 'PLAYER_WIN') continue;
        wins += 1;
        const stats = MS.computeMatchStats(r.events, r.state.player.hp, r.state.enemy.hp, { player: r.state.player.graveyard.length, enemy: r.state.enemy.graveyard.length }, { player: faction, enemy: 'foe' });
        for (const o of node.encounter.objectives) if (P.evaluateObjective(o, { stats, events: r.events, playerDeckFaction: faction })) objectiveHits[o.id] += 1;
      }
      campaignRows.push({
        node: node.id,
        name: node.name,
        difficulty: node.encounter.difficulty,
        player: faction,
        playerHp: series.startingHp.player,
        enemyHp: series.startingHp.enemy,
        winShare: series.winShare,
        medianRounds: series.medianRounds,
        p90Rounds: series.p90Rounds,
        stalls: series.stalls,
        meanWinHpShare: series.meanWinHpShare,
        objectives: node.encounter.objectives.map((o) => `${o.text}: ${wins ? pct(objectiveHits[o.id] / wins) : '-'}`).join(' / '),
      });
    }
  }

  // ---- Ranked -----------------------------------------------------------------------------------------------------
  const rankedRows = [];
  for (const tier of T.RANKED_TIERS) {
    for (const deck of tier.decks) {
      for (const faction of STARTERS) {
        const playerDeck = SD.STARTER_DECKS[faction];
        const series = S.runCardSeries({ playerDeck, enemyDeck: deck.cardIds, enemyMastery: T.rivalMasteryStages(tier, deck.cardIds) }, rankedGames, SEED);
        rankedRows.push({ division: tier.division, mastery: tier.masteryStage, rival: deck.name, player: faction, playerHp: series.startingHp.player, rivalHp: series.startingHp.enemy, winShare: series.winShare, medianRounds: series.medianRounds, p90Rounds: series.p90Rounds, stalls: series.stalls });
      }
    }
  }

  // ---- Output -----------------------------------------------------------------------------------------------------
  const csv = (rows) => {
    const cols = Object.keys(rows[0]);
    const cell = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : `${v}`.includes(',') || `${v}`.includes('"') ? `"${`${v}`.replaceAll('"', '""')}"` : `${v}`);
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
  };
  writeFileSync(resolve(outDir, 'campaign.csv'), csv(campaignRows));
  writeFileSync(resolve(outDir, 'ranked.csv'), csv(rankedRows));

  const md = [];
  md.push('# Campaign and Ranked on the card resolver', '');
  md.push(`Production card resolver and card AI piloting both sides; seed ${SEED}; ${campaignGames} games per Campaign row, ${rankedGames} per Ranked row. Draws count half. The player plays a starter deck at Mastery I. "Stalls" counts games settled by the exhausted-board or round-cap fallback instead of a Player reaching 0 HP (the fallback still names a winner); a Ranked row sums its three starters. Generated by scripts/simulate-modes.mjs.`, '');
  md.push('## Campaign, Chapter 1 (Kingdom starter, the difficulty reference)', '');
  md.push('| Node | Difficulty | Starting HP you / foe | Win | Rounds median / p90 | Stalls | HP kept in wins | Objective hit rate (in wins) |', '|---|---|---|---|---|---|---|---|');
  for (const r of campaignRows.filter((x) => x.player === 'kingdom')) md.push(`| ${r.name} | ${r.difficulty} | ${r.playerHp} / ${r.enemyHp} | ${pct(r.winShare)} | ${r.medianRounds} / ${r.p90Rounds} | ${r.stalls} | ${pct(r.meanWinHpShare)} | ${r.objectives || 'none'} |`);
  md.push('', '### Every starter', '', '| Node | Kingdom | Undead | Infernal |', '|---|---|---|---|');
  for (const node of [...new Set(campaignRows.map((r) => r.name))]) {
    const by = (f) => campaignRows.find((r) => r.name === node && r.player === f);
    md.push(`| ${node} | ${STARTERS.map((f) => pct(by(f).winShare)).join(' | ')} |`);
  }
  md.push('', '## Ranked tiers', '', '| Division | Rival Mastery | Rival deck | Rival HP | Kingdom | Undead | Infernal | Stalls |', '|---|---|---|---|---|---|---|---|');
  for (const tier of T.RANKED_TIERS) {
    for (const deck of tier.decks) {
      const rows = rankedRows.filter((r) => r.division === tier.division && r.rival === deck.name);
      md.push(`| ${tier.division} | ${['', 'I', 'II', 'III', 'IV', 'V'][tier.masteryStage]} | ${deck.name} | ${rows[0].rivalHp} | ${STARTERS.map((f) => pct(rows.find((r) => r.player === f).winShare)).join(' | ')} | ${rows.reduce((s, r) => s + r.stalls, 0)} |`);
    }
    const all = rankedRows.filter((r) => r.division === tier.division);
    md.push(`| **${tier.division} average** | | | | ${STARTERS.map((f) => { const rs = all.filter((r) => r.player === f); return pct(rs.reduce((s, r) => s + r.winShare, 0) / rs.length); }).join(' | ')} | |`);
  }
  writeFileSync(resolve(outDir, 'SIMULATION.md'), md.join('\n') + '\n');
  console.error(`wrote ${outDir}/campaign.csv, ranked.csv, SIMULATION.md`);
  void ST;
} finally {
  await server.close();
}
