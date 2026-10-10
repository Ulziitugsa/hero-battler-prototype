import { fork } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Legendary soup / transplant measurement on the PRODUCTION card resolver and card AI (src/game/cardCombat), the
// "before" half of docs/design/BAM-INSPIRED-CARD-REVISION-PLAN.md section H. It reads the live roster and deck lists and
// changes nothing: no card, stat or rule. Design tool only: nothing in the game reads the output.
//
//   node scripts/measure-legendary-soup.mjs --out DIR [--only field,legendary,soup,rarity,transplant] [--quick]
// Same arguments -> identical output (seeded; the search uses its own seeded RNG).

const SEED = 20261009;
const self = fileURLToPath(import.meta.url);

async function loadGame() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const S = await server.ssrLoadModule('/src/game/cardCombat/simulate.ts');
  return { server, S };
}

// ---------------------------------------------------------------------------------------------------------------------
// Worker: plays one deck against a list of opponents, both seats, with fixed seeds (common random numbers).
// ---------------------------------------------------------------------------------------------------------------------
if (process.argv.includes('--worker')) {
  const { S } = await loadGame();
  process.on('message', (job) => {
    const out = [];
    const tracked = {};
    for (let j = 0; j < job.opponents.length; j++) {
      const opp = job.opponents[j];
      let share = 0;
      const rounds = [];
      let stalls = 0;
      for (let i = 0; i < job.games; i++) {
        for (const seat of ['player', 'enemy']) {
          const seed = (SEED + opp.seedKey * 1000003 + i * 7919 + (seat === 'enemy' ? 500009 : 0)) >>> 0;
          const keepEvents = !!job.track;
          const r = seat === 'player'
            ? S.playCardAiMatch({ playerDeck: job.deck, enemyDeck: opp.cards, seed }, { keepEvents })
            : S.playCardAiMatch({ playerDeck: opp.cards, enemyDeck: job.deck, seed }, { keepEvents });
          if (job.track) countActivation(job.track, r.events, seat, tracked);
          const won = r.status === 'DRAW' ? 0.5 : (r.status === 'PLAYER_WIN') === (seat === 'player') ? 1 : 0;
          share += won;
          rounds.push(r.rounds);
          if (r.endReason && r.endReason !== 'hp') stalls += 1;
        }
      }
      out.push({ opp: opp.id, share: share / (2 * job.games), rounds, stalls, ...(job.track ? { tracked } : {}) });
    }
    process.send({ id: job.id, out });
  });
  process.send({ ready: true });
}

/**
 * Home activation of the gated Legendaries, read from one match's event log (our side = `seat`). `names` maps a card name
 * to its card id:
 *  - played: the Legendary was placed;
 *  - gated: its gated line fired at least once (Infernal Lord: Round End damage; Kathra: ally-death damage; The Plague
 *    Mother: a Round End that hit a second enemy, i.e. the lasting-loss spread);
 *  - burns / extraHits: how many times.
 */
function countActivation(names, events, seat, tracked) {
  const foe = seat === 'player' ? 'enemy' : 'player';
  for (const [name, cardId] of Object.entries(names)) {
    const t = (tracked[name] ??= { games: 0, played: 0, gated: 0, burns: 0, burnDamage: 0, roundEnds: 0, extraHits: 0 });
    t.games += 1;
    let played = false;
    let gated = false;
    let current = null; // the trigger of ours by this Legendary that the next events belong to
    let hits = 0;
    const closeRoundEnd = () => {
      if (current === 'ROUND_END' && name === 'The Plague Mother' && hits > 1) { t.extraHits += hits - 1; gated = true; }
      hits = 0;
    };
    for (const e of events) {
      if (e.type === 'REVEAL' && e.placements.some((p) => p.side === seat && p.cardId === cardId)) played = true;
      if (e.type === 'TRIGGER') {
        closeRoundEnd();
        current = e.side === seat && e.sourceName === name ? e.trigger : null;
        if (current === 'ROUND_END' && name === 'The Plague Mother') t.roundEnds += 1;
      }
      if (current === 'ROUND_END' && e.type === 'POWER_CHANGED' && e.side === foe && e.reason === name) hits += 1;
      const gatedTrigger = name === 'Infernal Lord' ? 'ROUND_END' : name === 'Kathra, Blood Queen' ? 'ON_ALLY_DEATH' : null;
      if (e.type === 'DIRECT_DAMAGE' && e.side === foe && e.sourceName === name && gatedTrigger && current === gatedTrigger && e.amount > 0) {
        t.burns += 1;
        t.burnDamage += e.amount;
        gated = true;
      }
    }
    closeRoundEnd();
    if (played) t.played += 1;
    if (gated) t.gated += 1;
  }
}

if (!process.argv.includes('--worker')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const outDir = resolve(option('--out', 'legendary-soup-results'));
  const only = new Set(option('--only', 'field,legendary,soup,rarity,transplant').split(','));
  const quick = args.includes('--quick');
  mkdirSync(outDir, { recursive: true });

  const { server } = await loadGame();
  const tag = option('--tag', '');
  const L = await server.ssrLoadModule('/src/game/cards/launchDecks.ts');
  const AD = await server.ssrLoadModule('/src/game/cards/archetypeDecks.ts');
  const R = await server.ssrLoadModule('/src/game/cards/launchRoster.ts');
  const C = await server.ssrLoadModule('/src/game/cards/index.ts');
  const DR = await server.ssrLoadModule('/src/game/engine/deckRules.ts');

  const card = (id) => C.getCard(id);
  const name = (id) => card(id).name;
  const isUnit = (id) => card(id).type !== 'spell';
  const isLegend = (id) => card(id).rarity === 'legendary';
  const archetypeOf = new Map(R.LAUNCH_ROSTER.map((r) => [r.id, r.archetype]));
  const obtainable = R.LAUNCH_ROSTER.filter((r) => r.source !== 'event').map((r) => r.id);
  const expand = (list) => list.flatMap(([id, n]) => Array(n).fill(id));
  const legal = (deck) => DR.validateDeck([...deck]).valid;

  // The field: 9 optimized, 6 budget, 3 Structure Decks, 3 starters. Study decks are reported outside the field.
  const FIELD = L.LAUNCH_DECKS.map((d, i) => ({ id: d.id, kind: d.kind, cards: expand(d.cards), seedKey: i + 1 }));
  // --field-from FILE: replace field lists with tuned ones ({deckId: [[cardId, n], ...]}), e.g. a previous tune pass.
  const fieldFrom = option('--field-from', '');
  if (fieldFrom) {
    const over = JSON.parse(readFileSync(resolve(fieldFrom), 'utf8'));
    for (const d of FIELD) if (over[d.id]) d.cards = expand(over[d.id]);
  }
  for (const d of FIELD) if (!legal(d.cards)) throw new Error(`field deck ${d.id} is not legal`);
  const STUDY = Object.entries(AD.ARCHETYPE_DECKS).map(([id, cards], i) => ({ id: `study-${id}`, kind: 'study', cards: [...cards], seedKey: 100 + i }));
  const legendFilter = option('--legends', '');
  const LEGENDS = R.LAUNCH_ROSTER.filter((r) => isLegend(r.id)).map((r) => r.id)
    .filter((id) => !legendFilter || legendFilter.split(',').includes(id));

  // --- worker pool ---------------------------------------------------------------------------------------------------
  const nWorkers = Math.max(1, cpus().length);
  const workers = [];
  const waiting = new Map();
  let jobSeq = 0;
  await Promise.all(Array.from({ length: nWorkers }, () => new Promise((ok) => {
    const w = fork(self, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    w.on('message', (m) => {
      if (m.ready) { workers.push(w); ok(); return; }
      const cb = waiting.get(m.id); waiting.delete(m.id); idle.push(w); pump(); cb(m.out);
    });
  })));
  const idle = [...workers];
  const queue = [];
  function pump() {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const job = queue.shift();
      waiting.set(job.payload.id, job.cb);
      w.send(job.payload);
    }
  }
  const run = (deck, opponents, games, track = undefined) => new Promise((cb) => {
    queue.push({ payload: { id: ++jobSeq, deck, opponents: opponents.map(({ id, cards, seedKey }) => ({ id, cards, seedKey })), games, track }, cb });
    pump();
  });
  // Field score: one job per opponent so all cores stay busy. Mirror opponents (same id) are skipped.
  async function score(deck, games, selfId = null, opponents = FIELD) {
    const opps = opponents.filter((o) => o.id !== selfId);
    const parts = await Promise.all(opps.map((o) => run(deck, [o], games)));
    const rows = parts.flat();
    return { mean: rows.reduce((a, r) => a + r.share, 0) / rows.length, rows };
  }

  const csv = (rows) => {
    const cols = Object.keys(rows[0]);
    const cell = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : `${v ?? ''}`.replace(/,/g, ';'));
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
  };
  const write = (file, text) => writeFileSync(resolve(outDir, file), text);
  const pct = (x) => (100 * x).toFixed(1);
  const deckText = (deck) => {
    const m = new Map();
    for (const id of deck) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([id, n]) => `${name(id)}${n > 1 ? ` x${n}` : ''}`).join('; ');
  };
  const log = (...m) => console.error(new Date().toISOString().slice(11, 19), ...m);

  const G_FIELD = quick ? 10 : 100;
  const G_EVAL = quick ? 6 : 40;
  const G_SEARCH = quick ? 3 : 10;
  const G_FINAL = quick ? 10 : 100;
  const summary = { seed: SEED, games: { field: G_FIELD, transplant: G_EVAL, search: G_SEARCH, final: G_FINAL } };

  // --- 5. Field health --------------------------------------------------------------------------------------------
  const fieldMean = new Map();
  if (only.has('field')) {
    log('field round robin');
    const cells = [];
    const all = [];
    let stalls = 0;
    // Unordered pairs, each played G_FIELD games per seat.
    const pairs = [];
    for (let a = 0; a < FIELD.length; a++) for (let b = a + 1; b < FIELD.length; b++) pairs.push([FIELD[a], FIELD[b]]);
    const res = await Promise.all(pairs.map(([a, b]) => run(a.cards, [b], G_FIELD).then((o) => ({ a, b, r: o[0] }))));
    const per = new Map(FIELD.map((d) => [d.id, []]));
    for (const { a, b, r } of res) {
      cells.push({ deck: a.id, opponent: b.id, winShare: r.share, games: 2 * G_FIELD });
      cells.push({ deck: b.id, opponent: a.id, winShare: 1 - r.share, games: 2 * G_FIELD });
      per.get(a.id).push(r.share);
      per.get(b.id).push(1 - r.share);
      all.push(...r.rounds);
      stalls += r.stalls;
    }
    for (const d of FIELD) fieldMean.set(d.id, per.get(d.id).reduce((x, y) => x + y, 0) / per.get(d.id).length);
    all.sort((x, y) => x - y);
    const q = (p) => all[Math.min(all.length - 1, Math.floor(p * all.length))];
    const outliers = cells.filter((c) => c.winShare > 0.75).map((c) => ({ deck: c.deck, opponent: c.opponent, winShare: +c.winShare.toFixed(3) }));
    log('vanguard vs bone legion, 300 per seat');
    const van = FIELD.find((d) => d.id === 'vanguard');
    const bone = FIELD.find((d) => d.id === 'bone-legion');
    const vb = (await run(van.cards, [bone], quick ? 20 : 300))[0];
    const starters = ['kingdom-starter', 'undead-starter', 'infernal-starter'];
    const tri = [];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) tri.push({ deck: starters[i], opponent: starters[j], winShare: +cells.find((c) => c.deck === starters[i] && c.opponent === starters[j]).winShare.toFixed(3) });
    const band = (kind) => {
      const v = FIELD.filter((d) => d.kind === kind).map((d) => fieldMean.get(d.id));
      return { min: +Math.min(...v).toFixed(3), max: +Math.max(...v).toFixed(3) };
    };
    summary.health = {
      gamesPlayed: all.length,
      bands: { optimized: band('optimized'), budget: band('budget'), structureDeck: band('structure-deck'), starter: band('starter') },
      starterTriangle: tri,
      vanguardVsBoneLegion: { vanguardWinShare: +vb.share.toFixed(3), gamesPerSeat: quick ? 20 : 300 },
      outliersBeyond25_75: outliers,
      medianRounds: q(0.5),
      p90Rounds: q(0.9),
      maxRounds: all[all.length - 1],
      stalls,
    };
    write('field.csv', csv(FIELD.map((d) => ({ deck: d.id, kind: d.kind, fieldWinShare: fieldMean.get(d.id), legendaries: d.cards.filter(isLegend).map(name).join(' + ') }))));
    write('field-matrix.csv', csv(cells));
  }
  // The other sections need each field deck's mean at the transplant sample size (same seeds as the variants).
  const baseScore = new Map();
  async function base(d) {
    if (!baseScore.has(d.id)) baseScore.set(d.id, (await score(d.cards, G_EVAL, d.id)).mean);
    return baseScore.get(d.id);
  }

  // --- search helpers -------------------------------------------------------------------------------------------
  let rng = SEED >>> 0;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const legendCount = (deck) => deck.filter(isLegend).length;
  const legendArchetypes = (deck) => new Set(deck.filter(isLegend).map((id) => archetypeOf.get(id))).size;
  const isSoup = (deck) => legendCount(deck) >= 4 && legendArchetypes(deck) >= 3;
  async function hillClimb(label, start, pool, accept, { proposals, patience, selfId = null }) {
    let deck = [...start];
    let best = (await score(deck, G_SEARCH, selfId)).mean;
    const trace = [{ search: label, step: 0, move: 'start', score: best, deck: deckText(deck) }];
    let sinceGain = 0;
    for (let p = 1; p <= proposals && sinceGain < patience; p++) {
      const out = deck[Math.floor(rand() * deck.length)];
      const inn = pool[Math.floor(rand() * pool.length)];
      if (inn === out) continue;
      const next = [...deck];
      next.splice(next.indexOf(out), 1, inn);
      if (!legal(next) || !accept(next)) continue;
      const s = (await score(next, G_SEARCH, selfId)).mean;
      sinceGain += 1;
      if (s > best + 0.004) {
        deck = next;
        best = s;
        sinceGain = 0;
        trace.push({ search: label, step: p, move: `${name(out)} -> ${name(inn)}`, score: s, deck: deckText(deck) });
        log(`${label} step ${p}: ${pct(s)}% (${name(out)} -> ${name(inn)})`);
      }
    }
    const final = await score(deck, G_FINAL, selfId);
    trace.push({ search: label, step: 'final', move: `${G_FINAL} games per seat per field deck`, score: final.mean, deck: deckText(deck) });
    return { deck, final, trace };
  }
  const searchRows = [];
  const searchResults = {};
  const describe = (deck, final) => ({
    fieldWinShare: +final.mean.toFixed(3),
    legendaries: deck.filter(isLegend).map(name),
    legendaryArchetypes: legendArchetypes(deck),
    deck: deckText(deck),
    worstMatchups: [...final.rows].sort((a, b) => a.share - b.share).slice(0, 3).map((r) => `${r.opp} ${pct(r.share)}%`),
    bestMatchups: [...final.rows].sort((a, b) => b.share - a.share).slice(0, 3).map((r) => `${r.opp} ${pct(r.share)}%`),
  });

  // --- 1. All-Legendary deck --------------------------------------------------------------------------------------
  const obtainLegends = LEGENDS.filter((id) => obtainable.includes(id));
  const commons = obtainable.filter((id) => card(id).rarity === 'common');
  if (only.has('legendary')) {
    log(`all-Legendary deck (${obtainLegends.length} Legendaries + fillers)`);
    const start = [...obtainLegends];
    while (start.length < 15) start.push(['spl-power-surge', 'spl-power-surge', 'und-ghoul-brute'][start.length - obtainLegends.length]);
    const keepLegends = (d) => obtainLegends.every((id) => d.includes(id));
    const r = await hillClimb('all-legendary', start, commons, keepLegends, { proposals: quick ? 20 : 150, patience: quick ? 10 : 60 });
    searchRows.push(...r.trace);
    searchResults.allLegendary = describe(r.deck, r.final);
    // Variant with the event Legendary (The Grave Tyrant) in place of the weakest filler.
    const tyrant = LEGENDS.find((id) => !obtainable.includes(id));
    if (tyrant) {
      const withEvent = [...r.deck];
      const filler = withEvent.find((id) => !isLegend(id));
      withEvent.splice(withEvent.indexOf(filler), 1, tyrant);
      searchResults.allLegendaryWithEvent = describe(withEvent, await score(withEvent, G_FINAL));
    }
  }

  // --- 2. Best Legendary soup + unconstrained best deck ------------------------------------------------------------
  if (only.has('soup')) {
    const study = STUDY.find((d) => d.id === 'study-general').cards;
    const soupStart = [...study];
    // Seed the soup search with 4 Legendaries from 4 archetypes so the constraint holds from step 0.
    const seedLegends = ['inf-infernal-lord', 'kng-paladin', 'und-plague-mother', 'inf-kathra'];
    for (const id of seedLegends) {
      const out = soupStart.find((x) => !isLegend(x) && isUnit(x));
      soupStart.splice(soupStart.indexOf(out), 1, id);
    }
    log('soup search (4+ Legendaries from 3+ archetypes)');
    const soup = await hillClimb('soup', soupStart, obtainable, isSoup, { proposals: quick ? 30 : 500, patience: quick ? 15 : 150 });
    searchRows.push(...soup.trace);
    searchResults.soup = describe(soup.deck, soup.final);
    log('unconstrained search from General Goodstuff');
    const free = await hillClimb('unconstrained', study, obtainable, () => true, { proposals: quick ? 30 : 500, patience: quick ? 15 : 150 });
    searchRows.push(...free.trace);
    const freeDesc = describe(free.deck, free.final);
    const nonLegend = free.deck.filter((id) => !isLegend(id));
    const arch = new Map();
    for (const id of nonLegend) arch.set(archetypeOf.get(id), (arch.get(archetypeOf.get(id)) ?? 0) + 1);
    const top = [...arch].sort((a, b) => b[1] - a[1])[0];
    freeDesc.mainArchetype = `${top[0]} (${top[1]}/${nonLegend.length} non-Legendary cards)`;
    searchResults.unconstrained = freeDesc;
  }

  // --- 3. High-rarity goodstuff ------------------------------------------------------------------------------------
  if (only.has('rarity')) {
    const high = obtainable.filter((id) => ['epic', 'legendary'].includes(card(id).rarity));
    // Start: every obtainable Legendary Unit we can fit after 2 copies of the 4 highest-ATK Epic Units.
    const epicUnits = high.filter((id) => card(id).rarity === 'epic' && isUnit(id));
    const start = [];
    for (const id of epicUnits.slice(0, 4)) start.push(id, id);
    for (const id of obtainLegends) if (start.length < 15) start.push(id);
    log('high-rarity goodstuff search (Epic + Legendary only)');
    const r = await hillClimb('high-rarity', start, high, () => true, { proposals: quick ? 30 : 500, patience: quick ? 15 : 150 });
    searchRows.push(...r.trace);
    searchResults.highRarity = describe(r.deck, r.final);
  }
  // --- Control: the same search limited to Commons and Rares (is it the Legendaries, or any focused goodstuff?) ---------
  if (only.has('lowrarity')) {
    const low = obtainable.filter((id) => ['common', 'rare'].includes(card(id).rarity));
    const start = STUDY.find((d) => d.id === 'study-general').cards.map((id) => (low.includes(id) ? id : 'kng-common-knight'));
    while (!legal(start)) start.splice(start.lastIndexOf('kng-common-knight'), 1, 'und-ghoul-brute');
    log('Common + Rare goodstuff search (control)');
    const r = await hillClimb('common-rare', start, low, () => true, { proposals: quick ? 30 : 500, patience: quick ? 15 : 150 });
    searchRows.push(...r.trace);
    searchResults.commonRareControl = describe(r.deck, r.final);
  }
  // --- Deck-list tuning: archetype-restricted search for every optimized, budget and Structure Deck list -------------
  // Pools (no event cards anywhere):
  //   optimized:      the archetype's Box cards + Core cards of that archetype + Core Flex cards; Legendaries only its own.
  //   budget:         Commons and Rares of the archetype's Box + every Core card (Core is free) except other archetypes' Legendaries.
  //   structure-deck: Core + the archetype's Box cards (no Legendary unless the list already has one) + its debut cards;
  //                   the debut cards and every card the Shop page names (featured / example combo) stay at their counts.
  // Identity: at least 10 of 15 cards (9 for budget) are "own" cards (in the archetype's Box, or Core of that archetype,
  // or the deck's debut cards).
  if (only.has('tune')) {
    const SDM = await server.ssrLoadModule('/src/game/structureDecks/definitions.ts');
    const AB = await server.ssrLoadModule('/src/game/box/archetypeBoxes.ts');
    const info = new Map(R.LAUNCH_ROSTER.map((r) => [r.id, r]));
    const LABEL = { vanguard: 'Vanguard', arcane: 'Arcane', crusade: 'Crusade', 'bone-legion': 'Bone Legion', phantoms: 'Phantoms', wither: 'Wither', hellpack: 'Hellpack', hellfire: 'Hellfire', bloodbound: 'Bloodbound' };
    const LOCKED = {
      'sd-bone-legion': ['und-bone-dragon', 'und-barrow-knight', 'spl-grave-totem', 'und-bone-soldier', 'und-cursed-warrior', 'spl-raise-fallen'],
      'sd-hellfire': ['inf-flame-herald', 'spl-meteor', 'inf-ember-witch', 'inf-cinder-imp'],
      'sd-crusade': ['kng-banner-knight', 'spl-reliquary-blade', 'kng-standard-bearer', 'spl-battle-banner', 'kng-paladin'],
    };
    for (const sd of SDM.STRUCTURE_DECKS_ON_SALE) for (const id of [...sd.featuredCardIds, ...sd.debutCardIds]) if (!LOCKED[sd.id].includes(id)) throw new Error(`${sd.id}: ${id} not locked`);
    const IDENTITY = {
      'bone-legion': {
        package: ['und-barrow-knight', 'und-crypt-warden', 'und-bonecaller', 'und-cursed-warrior', 'spl-raise-fallen', 'spl-bone-wall', 'und-mira'],
        minDistinct: 5,
        borrowLabel: 'Wither',
        maxBorrow: 1,
      },
    };
    const tunedOut = {};
    const tuneRows = [];
    const targets = FIELD.filter((d) => d.kind !== 'starter' && (!option('--decks', '') || option('--decks', '').split(',').includes(d.id)));
    for (const d of targets) {
      const arch = L.LAUNCH_DECKS.find((x) => x.id === d.id).archetype;
      const label = LABEL[arch];
      const inBox = (id) => (info.get(id).boxes ?? []).includes(arch);
      const sdDebut = (id) => info.get(id).source === 'structure-deck' && info.get(id).structureDeck === `sd-${arch}`;
      const coreOwn = (id) => info.get(id).source === 'core' && info.get(id).archetype === label;
      // Archetype-restricted: the archetype's own cards (its Box, its Structure Deck debuts, its Core cards) count toward
      // the identity rule; the only other cards allowed are the same faction's Core cards and neutral Core Spells. Other
      // factions' Units come in only when the archetype's own Box lists them.
      const own = (id) => inBox(id) || sdDebut(id) || coreOwn(id);
      const unitFactions = new Map();
      for (const id of d.cards) if (isUnit(id)) unitFactions.set(card(id).faction, (unitFactions.get(card(id).faction) ?? 0) + 1);
      const faction = [...unitFactions].sort((a, b) => b[1] - a[1])[0][0];
      const sameFactionCore = (id) => info.get(id).source === 'core' && (isUnit(id) ? card(id).faction === faction : info.get(id).archetype === 'Flex');
      const ok = (id) => info.get(id).source !== 'event';
      // Optimized lists always keep their Box's headline Legendary (a launch-set test checks it).
      const locked = d.kind === 'optimized' ? [AB.getArchetypeBox(arch).flagshipId] : LOCKED[d.id] ?? [];
      const allowed = (id) => {
        if (!ok(id)) return false;
        if (locked.includes(id)) return true;
        if (!own(id) && !sameFactionCore(id)) return false;
        if (isLegend(id) && !own(id)) return false; // another archetype's Legendary is never part of this list
        if (d.kind === 'optimized') return true;
        if (d.kind === 'budget') return (info.get(id).source === 'core') || ['common', 'rare'].includes(card(id).rarity);
        return !isLegend(id); // Structure Decks: no Legendaries beyond the locked ones
      };
      const pool = obtainable.filter(allowed);
      const lockCount = new Map(locked.map((id) => [id, Math.max(d.kind === 'optimized' ? 1 : 0, d.cards.filter((x) => x === id).length)]));
      // Never fewer own cards than the shipped list already has (the Crusade Structure Deck is half Vanguard by design).
      let minOwn = d.kind === 'budget' ? 10 : 11;
      // Extra identity rules for one list (ozi 2026-10-09: Bone Legion is recursion, not Wither-lite).
      const extra = IDENTITY[d.id];
      const identityOk = (deck) => !extra || (
        new Set(deck.filter((id) => extra.package.includes(id))).size >= extra.minDistinct &&
        deck.filter((id) => info.get(id).archetype === extra.borrowLabel).length <= extra.maxBorrow);
      const accept = (deck) => deck.every((id) => ok(id) && pool.includes(id)) && deck.filter(own).length >= minOwn && identityOk(deck) && locked.every((id) => deck.filter((x) => x === id).length >= lockCount.get(id));
      // Start: the shipped list with any card outside the pool (event cards, other archetypes' Legendaries) swapped for
      // the first legal pool card.
      const start = [...d.cards];
      for (let i = 0; i < start.length; i++) {
        if (pool.includes(start[i])) continue;
        const fits = (id) => isUnit(id) === isUnit(start[i]) && !isLegend(id) && legal([...start.slice(0, i), id, ...start.slice(i + 1)]);
        const repl = pool.find((id) => own(id) && fits(id)) ?? pool.find(fits);
        tuneRows.push({ deck: d.id, step: 'pre', move: `${name(start[i])} -> ${name(repl)} (not allowed in this list)`, score: '', deck_list: '' });
        start[i] = repl;
      }
      // A locked card the start list lacks (an optimized list that lost its headline Legendary) replaces its last
      // non-locked, non-Legendary Unit.
      for (const id of locked) {
        if (start.includes(id)) continue;
        const i = start.findLastIndex((x) => isUnit(x) && !isLegend(x) && !locked.includes(x));
        tuneRows.push({ deck: d.id, step: 'pre', move: `${name(start[i])} -> ${name(id)} (locked)`, score: '', deck_list: '' });
        start[i] = id;
      }
      minOwn = Math.min(minOwn, start.filter(own).length);
      if (!accept(start)) throw new Error(`${d.id}: start list fails its identity rule`);
      log(`tune ${d.id} (${d.kind}, pool ${pool.length})`);
      const r = await hillClimb(`tune-${d.id}`, start, pool, accept, { proposals: quick ? 20 : 300, patience: quick ? 10 : 100, selfId: d.id });
      tuneRows.push(...r.trace.map((t) => ({ deck: d.id, step: t.step, move: t.move, score: typeof t.score === 'number' ? +t.score.toFixed(3) : t.score, deck_list: t.deck })));
      const counts = new Map();
      for (const id of r.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
      tunedOut[d.id] = [...counts].sort((x, y) => (isLegend(y[0]) - isLegend(x[0])) || (isUnit(y[0]) - isUnit(x[0])) || x[0].localeCompare(y[0]));
    }
    write(`tuned-decks${tag}.json`, JSON.stringify(tunedOut, null, 1) + '\n');
    write(`tune${tag}.csv`, csv(tuneRows));
  }

  // --- Control: single-faction searches (Units of one faction, any Spells: Spells are faction-neutral) (does mixing factions matter, or does any searched list beat the shipped ones?) -
  if (only.has('faction')) {
    for (const [faction, startId] of [['kingdom', 'vanguard'], ['undead', 'bone-legion'], ['infernal', 'hellpack']]) {
      const pool = obtainable.filter((id) => !isUnit(id) || card(id).faction === faction);
      const start = FIELD.find((d) => d.id === startId).cards;
      log(`${faction}-only search from ${startId}`);
      const r = await hillClimb(`${faction}-only`, start, pool, (d) => d.every((id) => !isUnit(id) || card(id).faction === faction), { proposals: quick ? 30 : 500, patience: quick ? 15 : 150 });
      searchRows.push(...r.trace);
      searchResults[`${faction}Only`] = describe(r.deck, r.final);
    }
  }
  if (searchRows.length) write(`soup-search${tag}.csv`, csv(searchRows.map((r) => ({ ...r, score: typeof r.score === 'number' ? +r.score.toFixed(3) : r.score }))));
  summary.searches = searchResults;

  // --- 4. Transplant matrix ----------------------------------------------------------------------------------------
  if (only.has('transplant')) {
    log('transplant: field deck baselines');
    for (const d of FIELD) await base(d);
    // Each deck's cut: the non-Legendary Unit whose one-copy loss (to the faction's vanilla Core Common) costs least.
    const VANILLA = { kingdom: 'kng-common-knight', undead: 'und-ghoul-brute', infernal: 'inf-brimstone-ogre' };
    const mainFaction = (deck) => {
      const m = new Map();
      for (const id of deck) if (isUnit(id)) m.set(card(id).faction, (m.get(card(id).faction) ?? 0) + 1);
      return [...m].sort((a, b) => b[1] - a[1])[0][0];
    };
    // The vanilla Core Common of the deck's main faction, or another faction's when that one is already at 2 copies.
    const fillerFor = (deck, exclude) => {
      const pref = [VANILLA[mainFaction(deck)], ...Object.values(VANILLA)];
      return pref.find((id) => id !== exclude && deck.filter((x) => x === id).length < 2);
    };
    const cut = new Map();
    const ablations = [];
    for (const d of FIELD) {
      const cands = [...new Set(d.cards.filter((id) => isUnit(id) && !isLegend(id)))];
      let bestCut = null;
      for (const id of cands) {
        const v = [...d.cards];
        v.splice(v.indexOf(id), 1);
        v.push(fillerFor(v, id));
        const s = (await score(v, G_EVAL, d.id)).mean;
        ablations.push({ deck: d.id, cardCut: name(id), deltaWhenCut: s - baseScore.get(d.id) });
        if (!bestCut || s > bestCut.s) bestCut = { id, s };
      }
      cut.set(d.id, bestCut.id);
      log(`cut for ${d.id}: ${name(bestCut.id)}`);
    }
    write('transplant-cuts.csv', csv(ablations));
    const grid = [];
    for (const L of LEGENDS) {
      for (const d of FIELD) {
        let v;
        let mode;
        let swapped;
        if (d.cards.includes(L)) {
          v = [...d.cards];
          swapped = fillerFor(d.cards.filter((x) => x !== L), L);
          v.splice(v.indexOf(L), 1, swapped);
          mode = 'home-removed';
        } else {
          v = [...d.cards];
          swapped = cut.get(d.id);
          v.splice(v.indexOf(swapped), 1, L);
          mode = 'inserted';
        }
        if (!legal(v)) throw new Error(`illegal variant ${L} ${d.id}`);
        const s = (await score(v, G_EVAL, d.id)).mean;
        const delta = mode === 'inserted' ? s - baseScore.get(d.id) : baseScore.get(d.id) - s;
        grid.push({ legendary: name(L), legendaryArchetype: archetypeOf.get(L), event: !obtainable.includes(L), deck: d.id, deckKind: d.kind, mode, swappedWith: name(swapped), baseWinShare: baseScore.get(d.id), variantWinShare: s, legendaryValue: delta });
      }
      log(`transplant ${name(L)} done`);
    }
    write('transplant-grid.csv', csv(grid));
    summary.transplant = LEGENDS.map((L) => {
      const rows = grid.filter((g) => g.legendary === name(L));
      const home = rows.filter((r) => r.mode === 'home-removed');
      const away = rows.filter((r) => r.mode === 'inserted').map((r) => r.legendaryValue).sort((a, b) => a - b);
      const bestAway = rows.filter((r) => r.mode === 'inserted').sort((a, b) => b.legendaryValue - a.legendaryValue).slice(0, 3);
      return {
        legendary: name(L),
        archetype: archetypeOf.get(L),
        homeDecks: home.map((r) => `${r.deck} ${(100 * r.legendaryValue).toFixed(1)}`),
        homeValueMax: home.length ? +Math.max(...home.map((r) => r.legendaryValue)).toFixed(3) : null,
        awayMedian: +away[Math.floor(away.length / 2)].toFixed(3),
        awayMax: +away[away.length - 1].toFixed(3),
        awayPositiveOver3: away.filter((x) => x > 0.03).length,
        bestAway: bestAway.map((r) => `${r.deck} +${(100 * r.legendaryValue).toFixed(1)}`),
      };
    });
  }

  // --- 6. Home activation of the gated Legendaries --------------------------------------------------------------
  if (only.has('activation')) {
    const GATED = { 'Infernal Lord': 'inf-infernal-lord', 'The Plague Mother': 'und-plague-mother', 'Kathra, Blood Queen': 'inf-kathra' };
    const rows = [];
    for (const d of FIELD) {
      const track = Object.fromEntries(Object.entries(GATED).filter(([, id]) => d.cards.includes(id)));
      if (!Object.keys(track).length) continue;
      log(`activation ${d.id}`);
      const opps = FIELD.filter((o) => o.id !== d.id);
      const parts = (await Promise.all(opps.map((o) => run(d.cards, [o], G_EVAL, track)))).flat();
      const winShare = parts.reduce((a, r) => a + r.share, 0) / parts.length;
      for (const n of Object.keys(track)) {
        const t = { games: 0, played: 0, gated: 0, burns: 0, burnDamage: 0, roundEnds: 0, extraHits: 0 };
        for (const r of parts) for (const k of Object.keys(t)) t[k] += r.tracked[n][k];
        rows.push({
          deck: d.id, legendary: n, games: t.games, deckWinShare: winShare,
          playedRate: t.played / t.games, gatedRateOfGames: t.gated / t.games, gatedRateWhenPlayed: t.played ? t.gated / t.played : 0,
          burnsPerGame: t.burns / t.games, burnDamagePerGame: t.burnDamage / t.games, extraHitsPerRoundEnd: t.roundEnds ? t.extraHits / t.roundEnds : 0,
        });
      }
    }
    if (rows.length) write(`activation${tag}.csv`, csv(rows));
    summary.activation = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(3) : v])));
  }

  write(`health${tag}.json`, JSON.stringify(summary, null, 2) + '\n');
  log('done');
  for (const w of workers) w.kill();
  await server.close();
}
