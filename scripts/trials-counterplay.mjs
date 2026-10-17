import { createServer } from 'vite';

// Power Fantasy Phase 1, Part F: each prototype combination as a deck, against no specific answer, its intended counter
// and two unrelated strategies, in AI-vs-AI battles on the production resolver (src/trials/counterplay.ts). Design tool
// only: nothing in the game reads the output; docs/design/POWER-FANTASY-P1.md quotes it.
//
//   node scripts/trials-counterplay.mjs              200 battles per pairing
//   node scripts/trials-counterplay.mjs --games 50   a quicker run
// Same arguments -> the same tables.

const args = process.argv.slice(2);
const i = args.indexOf('--games');
const games = i >= 0 ? Number(args[i + 1]) : 200;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { registerTrialCards } = await server.ssrLoadModule('/src/trials/cards.ts');
  const { COUNTERPLAY_CASES, signatureStats } = await server.ssrLoadModule('/src/trials/counterplay.ts');
  registerTrialCards();
  const pct = (n) => `${Math.round(n * 100)}%`;
  for (const c of COUNTERPLAY_CASES) {
    console.log(`\n### ${c.name}\n`);
    console.log('| Opponent | Combination wins | Control deck wins | Undying rises | Multi-kill Spells | Cataclysm kills | Peak ATK | Battles at 1,000+ | Exiled | Spells broken |');
    console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const o of [{ name: 'Vanguard (no specific answer)', deck: c.noAnswer }, { name: c.counterName, deck: c.counter }, ...c.unrelated]) {
      const s = signatureStats(c.combo, o.deck, games);
      const control = signatureStats(c.control, o.deck, games);
      console.log(`| ${o.name} | ${pct(s.winShare)} | ${pct(control.winShare)} | ${s.rises} | ${s.multiKills} | ${s.cataclysmKills} | ${s.peakAtk} | ${s.thousandGames} | ${s.exiled} | ${s.spellsBroken} |`);
    }
  }
  console.log(`\n${games} battles per pairing (per-battle averages), seed 20261017. Both sides are the production AI.`);
} finally {
  await server.close();
}
