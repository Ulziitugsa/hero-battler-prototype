import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// Blocking quality under ATK difference damage (docs/CARD-COMBAT-DESIGN.md section 15). Controlled one-round
// tests on the production card resolver: the attacker's three Units are already on the board, the defender
// places three Units from hand, and we measure the Player damage each placement lets through.
//
//   node scripts/blocking-quality.mjs --out DIR [--trials 2000]
//
// Writes named-scenario.csv (145/110/85 vs 130/95/70, every placement) and battery.csv (random boards drawn
// from the real roster's ATK values: best, random, worst and card-AI placement). Seed 20260929, deterministic.

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = resolve(option('--out', 'blocking-results'));
const trials = Number(option('--trials', 2000));
mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const E = await server.ssrLoadModule('/src/game/cardCombat/engine.ts');
  const AI = await server.ssrLoadModule('/src/game/cardCombat/ai.ts');
  const C = await server.ssrLoadModule('/src/game/cards/index.ts');
  const S = await server.ssrLoadModule('/src/game/cardCombat/stats.ts');
  const D = await server.ssrLoadModule('/src/game/cards/starterDecks.ts');
  const LANES = ['left', 'center', 'right'];
  const KNIGHT = 'kng-common-knight'; // vanilla, so only ATK matters
  const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  const blank = () => {
    const s = E.createCardMatch({ seed: 1, playerDeck: D.STARTER_DECKS.kingdom, enemyDeck: D.STARTER_DECKS.kingdom }).nextState;
    for (const side of ['player', 'enemy']) {
      s[side].hand = [];
      s[side].deck = [];
      s.cardCombat.deckMarks[side] = [];
    }
    return s;
  };
  const unit = (atk, id) => {
    const card = C.getCard(KNIGHT);
    return { instanceId: id, cardId: KNIGHT, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
  };
  /** One round: the enemy's `attackers` are on the board, the player's `blockers` go into lanes in `order`. */
  const round = (attackers, blockers, order) => {
    const s = blank();
    attackers.forEach((atk, i) => (s.enemy.heroZones[LANES[i]] = unit(atk, `a${i}`)));
    order.forEach((b, i) => (s.player.heroZones[LANES[i]] = unit(blockers[b], `b${i}`)));
    const hp = { player: s.player.hp, enemy: s.enemy.hp };
    const r = E.resolveCardRound(s, { plays: [] }, { plays: [] });
    const lost = LANES.filter((l) => s.player.heroZones[l] && !r.nextState.player.heroZones[l]).length;
    const killed = LANES.filter((l) => s.enemy.heroZones[l] && !r.nextState.enemy.heroZones[l]).length;
    return { taken: hp.player - r.nextState.player.hp, dealt: hp.enemy - r.nextState.enemy.hp, lost, killed };
  };
  const csv = (name, rows) => {
    const cols = Object.keys(rows[0]);
    writeFileSync(join(outDir, name), [cols.join(','), ...rows.map((r) => cols.map((c) => r[c]).join(','))].join('\n') + '\n');
  };

  // 1. The named scenario.
  const attackers = [145, 110, 85];
  const blockers = [130, 95, 70];
  const named = PERMS.map((order) => ({ placement: order.map((b) => blockers[b]).join(' / '), ...round(attackers, blockers, order), oldRuleTaken: 0 }));
  named.push({ placement: 'no blockers', ...round(attackers, [], []), oldRuleTaken: 340 });
  csv('named-scenario.csv', named);

  // 2. Random battery. Attackers: stand-ins at ATKs drawn from the roster's printed values. Defender: three real
  // Units from hand whose effects don't touch a clash (so only ATK decides), placed by every permutation and by
  // the card AI (the Quick Battle opponent), each resolved as a real round from hand.
  const atks = [...new Set(C.ALL_CARDS.filter((c) => c.type === 'hero' && !(c.tags ?? []).includes('Token')).map((c) => S.printedStats(c.id).atk))];
  const HAND = ['kng-common-knight', 'und-cursed-warrior', 'und-shade-thief', 'inf-mirage-imp', 'inf-flame-imp', 'kng-spellbreaker', 'kng-null-templar', 'inf-pit-fiend', 'inf-runebreaker'];
  let rng = 20260929;
  const next = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pickOf = (list) => list[Math.floor(next() * list.length)];
  const fromHand = (a, cards, plan) => {
    const s = blank();
    a.forEach((atk, i) => (s.enemy.heroZones[LANES[i]] = unit(atk, `a${i}`)));
    s.player.hand = cards.map((cardId, i) => ({ handId: `h${i}`, cardId }));
    const plays = plan ? plan(s) : [];
    const hp = { player: s.player.hp, enemy: s.enemy.hp };
    const r = E.resolveCardRound(s, { plays }, { plays: [] });
    const taken = hp.player - r.nextState.player.hp;
    const dealt = hp.enemy - r.nextState.enemy.hp;
    return { taken, net: dealt - taken, plays };
  };
  const battery = [];
  for (let t = 0; t < trials; t++) {
    const a = [pickOf(atks), pickOf(atks), pickOf(atks)];
    const cards = [pickOf(HAND), pickOf(HAND), pickOf(HAND)];
    const outs = PERMS.map((order) => fromHand(a, cards, () => order.map((c, i) => ({ handId: `h${c}`, cardId: cards[c], lane: LANES[i] }))));
    const taken = outs.map((o) => o.taken);
    const net = outs.map((o) => o.net);
    const ai = fromHand(a, cards, (s) => AI.chooseCardAiAction(s, 'player', 7 + t).action.plays);
    battery.push({
      attackers: a.join('/'),
      blockers: cards.map((id) => S.printedStats(id).atk).join('/'),
      best: Math.min(...taken),
      randomMean: Math.round(taken.reduce((x, y) => x + y, 0) / taken.length),
      worst: Math.max(...taken),
      cardAi: ai.taken,
      bestNet: Math.max(...net),
      randomMeanNet: Math.round(net.reduce((x, y) => x + y, 0) / net.length),
      worstNet: Math.min(...net),
      cardAiNet: ai.net,
      cardAiUnitsPlaced: ai.plays.length,
      noBlock: a.reduce((x, y) => x + y, 0),
    });
  }
  csv('battery.csv', battery);
  const mean = (k) => Math.round(battery.reduce((x, r) => x + r[k], 0) / battery.length);
  const share = battery.filter((r) => r.worst - r.best >= 30).length / battery.length;
  const shareNet = battery.filter((r) => r.bestNet - r.worstNet >= 60).length / battery.length;
  const summary = { trials, best: mean('best'), randomMean: mean('randomMean'), worst: mean('worst'), cardAi: mean('cardAi'), noBlock: mean('noBlock'), bestNet: mean('bestNet'), randomMeanNet: mean('randomMeanNet'), worstNet: mean('worstNet'), cardAiNet: mean('cardAiNet'), shareWithGapAtLeast30: Math.round(share * 1000) / 1000, shareWithNetGapAtLeast60: Math.round(shareNet * 1000) / 1000, named };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
