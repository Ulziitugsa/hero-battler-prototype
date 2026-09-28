import { createServer } from 'vite';

// Design-only model for comparing deck shapes under the proposed ATK/LP card frame.
// No production resolver or saved player data is modified by this script.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PLAYTEST_ROSTER } = await server.ssrLoadModule('/src/game/cards/roster.ts');
  const { STARTER_DECKS } = await server.ssrLoadModule('/src/game/cards/starterDecks.ts');
  const { ARCHETYPE_DECKS } = await server.ssrLoadModule('/src/game/cards/archetypeDecks.ts');
  const { getCard } = await server.ssrLoadModule('/src/game/cards/index.ts');
  const { cardStatsPreview } = await server.ssrLoadModule('/src/game/cards/cardStatsPreview.ts');

  const unique = [...new Set(PLAYTEST_ROSTER)].map(getCard);
  const units = unique.filter(card => card.type === 'hero');
  const spells = unique.filter(card => card.type === 'spell');
  const stats = card => cardStatsPreview(card);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const shuffle = (items, random) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const select = (cards, count, score) => [...cards].sort((a, b) => score(b) - score(a)).slice(0, count);
  const repeatTo = (cards, size) => Array.from({ length: size }, (_, i) => cards[i % cards.length]);
  const spread = (label, unitCount, unitScore, spellScore) => {
    const chosenUnits = select(units, unitCount, unitScore);
    const chosenSpells = select(spells, 15 - unitCount, spellScore);
    return { label, ids: [...repeatTo(chosenUnits, unitCount), ...repeatTo(chosenSpells, 15 - unitCount)].map(card => card.id) };
  };
  const atkMean = mean(units.map(card => stats(card).atk));
  const lpMean = mean(units.map(card => stats(card).lp));
  const scenarios = [
    ...Object.entries(STARTER_DECKS).map(([label, ids]) => ({ label: `Starter: ${label}`, ids })),
    ...Object.entries(ARCHETYPE_DECKS).map(([label, ids]) => ({ label: `Archetype: ${label}`, ids })),
    spread('Aggressive (12 Units)', 12, card => stats(card).atk, _card => 0),
    spread('Balanced (12 Units)', 12, card => -Math.abs(stats(card).atk - atkMean) - Math.abs(stats(card).lp - lpMean), _card => 0),
    spread('Defensive (12 Units)', 12, card => stats(card).lp, _card => 0),
    spread('Spell-heavy (8 Units)', 8, card => -Math.abs(stats(card).atk - atkMean) - Math.abs(stats(card).lp - lpMean), _card => 1),
  ];

  function deckInfo(ids) {
    const cards = ids.map(getCard);
    const playerUnits = cards.filter(card => card.type === 'hero');
    const unitStats = playerUnits.map(stats);
    return {
      units: playerUnits.length,
      spells: cards.length - playerUnits.length,
      deckLife: unitStats.reduce((sum, item) => sum + item.lp, 0),
      avgAtk: mean(unitStats.map(item => item.atk)),
      avgLp: mean(unitStats.map(item => item.lp)),
    };
  }

  // Simplified three-lane attrition: both players deploy the next unit to each open lane, clashes
  // resolve simultaneously, surviving units deal their ATK directly each subsequent round. Spells
  // contribute neither body nor effects in this baseline; their counts are reported separately.
  function battle(deckA, deckB, seed) {
    const random = seeded(seed);
    const a = shuffle(deckA.ids.filter(id => getCard(id).type === 'hero'), random).map(id => ({ ...stats(getCard(id)), id }));
    const b = shuffle(deckB.ids.filter(id => getCard(id).type === 'hero'), random).map(id => ({ ...stats(getCard(id)), id }));
    let lifeA = a.reduce((sum, unit) => sum + unit.lp, 0);
    let lifeB = b.reduce((sum, unit) => sum + unit.lp, 0);
    const lanes = Array.from({ length: 3 }, () => ({ a: null, b: null }));
    let nextA = 0;
    let nextB = 0;
    for (let round = 1; round <= 120; round += 1) {
      for (const lane of lanes) {
        if (!lane.a && nextA < a.length) lane.a = a[nextA++];
        if (!lane.b && nextB < b.length) lane.b = b[nextB++];
      }
      let hitA = 0;
      let hitB = 0;
      for (const lane of lanes) {
        if (lane.a && lane.b) {
          if (lane.a.atk > lane.b.atk) lane.b = null;
          else if (lane.b.atk > lane.a.atk) lane.a = null;
          else { lane.a = null; lane.b = null; }
        } else if (lane.a) hitB += lane.a.atk;
        else if (lane.b) hitA += lane.b.atk;
      }
      lifeA -= hitA;
      lifeB -= hitB;
      if (lifeA <= 0 || lifeB <= 0 || (nextA >= a.length && nextB >= b.length && lanes.every(lane => !lane.a && !lane.b))) {
        return { rounds: round, winner: lifeA <= 0 && lifeB <= 0 ? 'draw' : lifeA <= 0 ? 'b' : lifeB <= 0 ? 'a' : 'draw' };
      }
    }
    return { rounds: 120, winner: 'draw' };
  }

  const results = [];
  for (let i = 0; i < scenarios.length; i += 1) {
    for (let j = i + 1; j < scenarios.length; j += 1) {
      const left = scenarios[i];
      const right = scenarios[j];
      const games = Array.from({ length: 100 }, (_, run) => battle(left, right, 1000 + i * 10000 + j * 100 + run));
      const winsA = games.filter(game => game.winner === 'a').length;
      const winsB = games.filter(game => game.winner === 'b').length;
      results.push({ matchup: `${left.label} vs ${right.label}`, aWin: winsA, bWin: winsB, draws: games.length - winsA - winsB, avgRounds: +mean(games.map(game => game.rounds)).toFixed(1) });
    }
  }
  console.log(JSON.stringify({
    model: 'design-only ATK/LP attrition baseline; spell effects omitted',
    roster: { cards: unique.length, units: units.length, spells: spells.length, atks: [...new Set(units.map(card => stats(card).atk))].sort((a, b) => a - b), lps: [...new Set(units.map(card => stats(card).lp))].sort((a, b) => a - b) },
    deckProfiles: scenarios.map(deck => ({ label: deck.label, ...deckInfo(deck.ids) })),
    matchups: results,
    spellEffectLimit: 'Spell cards currently have heterogeneous triggers/actions. This baseline counts spell slots but applies no spell effects; do not use its win rates to tune live balance.',
  }, null, 2));
} finally {
  await server.close();
}
