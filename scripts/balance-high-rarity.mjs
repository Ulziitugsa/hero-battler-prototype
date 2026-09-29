import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// Aggressive / high-rarity power audit (Thread C of the effect and archetype balance pass). Design tool
// only, like scripts/simulate-card-combat.mjs: it runs src/game/cardSim with the approved baseline
// (balance/approved.ts) and writes raw tables. Nothing in the game reads them.
//
//   node scripts/balance-high-rarity.mjs            everything below (about 10 minutes)
//   node scripts/balance-high-rarity.mjs audit      per-card effect and Power-band value in the top decks
//   node scripts/balance-high-rarity.mjs candidates field standings for each single-card candidate
//   node scripts/balance-high-rarity.mjs candidates --context d-off   the same on the Thread D growth-off stand-in
//   node scripts/balance-high-rarity.mjs package    matrix, match stats and controlled pilot tests per package
//   node scripts/balance-high-rarity.mjs --out DIR  choose the output folder (default card-sim-balance-c)
//   --games N                                       games per opponent (default 200)
// Same arguments -> byte-identical output.

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const mode = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a) && a !== option('--out', '')) ?? 'all';
const outDir = resolve(option('--out', 'card-sim-balance-c'));
const games = Number(option('--games', 200));
const SEED = 20260929;

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const X = await server.ssrLoadModule('/src/game/cardSim/experiments.ts');
  const D = await server.ssrLoadModule('/src/game/cardSim/decks.ts');
  const CS = await server.ssrLoadModule('/src/game/cardSim/cardSource.ts');
  const A = await server.ssrLoadModule('/src/game/cardSim/balance/approved.ts');
  const P = await server.ssrLoadModule('/src/game/cardSim/balance/powerAudit.ts');
  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const log = (msg) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);
  const csv = (name, rows) => {
    if (rows.length === 0) return;
    const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(join(outDir, name), [cols.join(','), ...rows.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n') + '\n');
  };

  CS.registerSimCards(A.approvedReband());
  const model = P.aliasModel(X.getStatModel('baseline'));
  const rules = A.APPROVED_RULES;
  const field = D.SIM_DECKS;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  if (mode === 'audit' || mode === 'all') {
    const targets = ['high-rarity', 'aggressive', 'starter-infernal', 'starter-kingdom', 'low-rarity', 'arch-beast'];
    const rows = [];
    for (const deckId of targets) {
      const deck = D.getSimDeck(deckId);
      const base = P.fieldShare(model, rules, deck, field, games, SEED).share;
      log(`audit ${deckId} base ${base}`);
      for (const cardId of [...new Set(deck.cards)]) {
        const card = CS.getCard(cardId);
                const vanilla = P.vanillaVariant(cardId);
        const minus = P.powerVariant(cardId, -1);
        CS.registerSimCards([vanilla, minus]);
        const vShare = card.abilities.length ? P.fieldShare(model, rules, P.swapInDeck(deck, cardId, vanilla.id, deck.id), field, games, SEED).share : base;
        const mShare = card.type !== 'hero' ? null : P.fieldShare(model, rules, P.swapInDeck(deck, cardId, minus.id, deck.id), field, games, SEED).share;
        rows.push({ deck: deckId, cardId, rarity: card.rarity, type: card.type, power: card.power ?? '', copies: deck.cards.filter((c) => c === cardId).length, deckShare: base, vanillaShare: vShare, minusOneShare: mShare, effectValue: r3(base - vShare), powerStepValue: mShare === null ? '' : r3(base - mShare) });
      }
    }
    csv('card-audit.csv', rows);
  }

  const T = await server.ssrLoadModule('/src/game/cardSim/balance/threadC.ts');
  // --context d-off: run candidates on top of the Thread D growth-off stand-in (sensitivity).
  const context = option('--context', 'none') === 'd-off' ? T.D_GROWTH_OFF.cards() : [];
  const standingsWith = (cards, label) => {
    const restore = CS.registerSimCards([...context, ...cards]);
    try {
      const { rows, pooled } = X.runMatrix(model, field, games, SEED, { rules, variant: label });
      return { rows, pooled, standings: X.deckStandings(rows) };
    } finally {
      restore();
    }
  };

  if (mode === 'candidates' || mode === 'all') {
    const rows = [];
    for (const c of [{ id: 'approved-baseline', cards: () => [] }, ...T.SINGLE_CANDIDATES, T.D_GROWTH_OFF, T.B_SWING_SPELLS]) {
      const { standings } = standingsWith(c.cards(), c.id);
      log(`candidate ${c.id}`);
      for (const s of standings) rows.push({ candidate: c.id, deck: s.deck, winShare: s.winShare, games: s.games });
    }
    csv(context.length ? 'candidate-standings-d-off.csv' : 'candidate-standings.csv', rows);
  }

  if (mode === 'package' || mode === 'all') {
    const summaryRows = [];
    const matrixRows = [];
    const standingRows = [];
    const skillRows = [];
    for (const c of [{ id: 'approved-baseline', cards: () => [] }, ...T.PACKAGES]) {
      const { rows, pooled, standings } = standingsWith(c.cards(), c.id);
      log(`package matrix ${c.id}`);
      const s = X.summarize(pooled);
      const hiLo = rows.find((r) => r.deckA === 'high-rarity' && r.deckB === 'low-rarity');
      const shares = standings.map((x) => x.winShare);
      summaryRows.push({ candidate: c.id, games: s.games, roundsMean: s.roundsMean, roundsMedian: s.roundsMedian, roundsP90: s.roundsP90, drawRate: s.drawRate, stallRate: s.stallRate, directHitsPerMatch: s.directHitsMean, directDamagePerMatch: s.directDamageMean, effectDamagePerMatch: s.effectDamageMean, deckShareMin: Math.min(...shares), deckShareMax: Math.max(...shares), highVsLowRarity: hiLo ? hiLo.summary.winShareA : null });
      for (const r of rows) matrixRows.push({ candidate: c.id, deckA: r.deckA, deckB: r.deckB, winShareA: r.summary.winShareA, drawRate: r.summary.drawRate, stallRate: r.summary.stallRate, roundsMedian: r.summary.roundsMedian });
      for (const x of standings) standingRows.push({ candidate: c.id, ...x });
      const restore = CS.registerSimCards(c.cards());
      try {
        const controlled = [
          ...X.skillProxy(model, 'aggressive', 'balanced', 1000, SEED, rules),
          ...X.skillProxy(model, 'high-rarity', 'low-rarity', 1000, SEED, rules),
          ...X.skillProxy(model, 'starter-infernal', 'starter-kingdom', 1000, SEED, rules),
          ...X.skillProxy(model, 'high-rarity', 'starter-kingdom', 1000, SEED, rules),
        ];
        for (const r of controlled) skillRows.push({ candidate: c.id, pair: r.deck, case: r.label, winShareA: r.summary.winShareA, drawRate: r.summary.drawRate, roundsMedian: r.summary.roundsMedian });
      } finally {
        restore();
      }
      log(`package controlled ${c.id}`);
    }
    csv('package-summary.csv', summaryRows);
    csv('package-matrix.csv', matrixRows);
    csv('package-standings.csv', standingRows);
    csv('package-skill.csv', skillRows);
  }
} finally {
  await server.close();
}
