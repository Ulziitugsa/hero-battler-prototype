import { createServer } from 'vite';

// Card Discovery Lab: how the production card AI plays each optimised archetype, against a pilot that plays its cards
// into random legal lanes (src/lab/aiReport.ts). Both pilots play the same deck against the same AI-piloted field (the
// 21 reference decks), on the same seeds. Design tool only: nothing in the game reads the output; the lab's AI notes
// quote it (src/lab/archetypes.ts AI_MEASURED).
//
//   node scripts/lab-ai-report.mjs              10 games per opponent per pilot (4,200 games)
//   node scripts/lab-ai-report.mjs --games 4    a quicker run
// Same arguments -> the same table.

const args = process.argv.slice(2);
const i = args.indexOf('--games');
const games = i >= 0 ? Number(args[i + 1]) : 10;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { runLabAiReport } = await server.ssrLoadModule('/src/lab/aiReport.ts');
  const rows = runLabAiReport(games);
  const pct = (n) => `${Math.round(n * 100)}%`;
  console.log(`| Archetype | AI win share | Random-pilot win share | AI minus random | Lab moments / game (AI, random) | Signature moments / game (AI, random) | Spells cast / game (AI, random) |`);
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    console.log(`| ${r.deck} | ${pct(r.ai.winShare)} | ${pct(r.random.winShare)} | ${Math.round((r.ai.winShare - r.random.winShare) * 100)} pts | ${r.ai.momentsPerGame}, ${r.random.momentsPerGame} | ${r.ai.signaturePerGame}, ${r.random.signaturePerGame} | ${r.ai.spellsPerGame}, ${r.random.spellsPerGame} |`);
  }
  console.log(`\n${rows[0].ai.games} games per pilot per archetype, seed 20261017.`);
} finally {
  await server.close();
}
