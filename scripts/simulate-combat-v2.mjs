import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PLAYTEST_ROSTER } = await server.ssrLoadModule('/src/game/cards/roster.ts');
  const { getCard } = await server.ssrLoadModule('/src/game/cards/index.ts');
  const { STARTER_DECKS } = await server.ssrLoadModule('/src/game/cards/starterDecks.ts');
  const { combatStats, commanderHp, createV2State, makeV2Hero, resolveV2Round, DIRECT_COMMANDER_MULTIPLIER, DIRECT_COMMANDER_DAMAGE_CAP } = await server.ssrLoadModule('/src/game/combatV2/model.ts');

  const heroes = [...new Set(PLAYTEST_ROSTER)].map(getCard).filter(card => card.type === 'hero');
  const powerValues = heroes.map(card => card.power ?? 1).sort((a, b) => a - b);
  const medianPower = powerValues[Math.floor(powerValues.length / 2)];
  const representative = ['kng-light-priest', 'kng-archer', 'und-vharos'].map(getCard);
  const sum = values => values.reduce((total, value) => total + value, 0);

  function duel(cardId, attackerLevel, defenderLevel, attackerAscension = 0, defenderAscension = 0) {
    let state = createV2State(17, [cardId], [cardId]);
    state.player.commanderHp = state.enemy.commanderHp = 999;
    state.player.cardsLeft = [];
    state.enemy.cardsLeft = [];
    state.player.heroes.center = makeV2Hero(cardId, attackerLevel, attackerAscension);
    state.enemy.heroes.center = makeV2Hero(cardId, defenderLevel, defenderAscension);
    let clashes = 0;
    while (clashes < 20 && state.player.heroes.center && state.enemy.heroes.center) {
      state = resolveV2Round(state, [], []);
      clashes += 1;
    }
    return {
      clashes,
      attackerRemainingHp: state.player.heroes.center?.hp ?? 0,
      defenderRemainingHp: state.enemy.heroes.center?.hp ?? 0,
      attackerMaxHp: combatStats(cardId, attackerLevel, attackerAscension).maxHp,
      defenderMaxHp: combatStats(cardId, defenderLevel, defenderAscension).maxHp,
    };
  }

  const levelPairs = [[1, 1], [20, 20], [40, 40], [60, 60], [20, 30], [20, 40], [40, 60]];
  const peerCombat = levelPairs.map(([attackerLevel, defenderLevel]) => ({
    attackerLevel,
    defenderLevel,
    examples: representative.map(card => ({
      id: card.id,
      power: card.power,
      attacker: combatStats(card.id, attackerLevel),
      defender: combatStats(card.id, defenderLevel),
      ...duel(card.id, attackerLevel, defenderLevel),
    })),
  }));

  const archer = getCard('kng-archer');
  const ascension = [0, 1, 2, 3].map(rank => ({
    rank,
    stats: combatStats(archer.id, 40, rank),
    vsRankZero: duel(archer.id, 40, 40, rank, 0),
    mirrored: duel(archer.id, 40, 40, rank, rank),
  }));

  const decks = Object.entries(STARTER_DECKS).map(([faction, ids]) => ({
    faction,
    ids: ids.filter(id => getCard(id).type === 'hero'),
  }));

  function simulate(playerIds, enemyIds, level, formula = 'D', rules = {}) {
    let state = createV2State(101, playerIds, enemyIds, { playerLevel: level, enemyLevel: level });
    state.player.commanderHp = commanderHp(playerIds, level, 0, formula);
    state.enemy.commanderHp = commanderHp(enemyIds, level, 0, formula);
    let playerIndex = 0;
    let enemyIndex = 0;
    for (let round = 0; round < 100 && state.status === 'IN_PROGRESS'; round += 1) {
      const playerPlays = [];
      const enemyPlays = [];
      for (const lane of ['left', 'center', 'right']) {
        if (!state.player.heroes[lane] && playerIndex < playerIds.length) playerPlays.push({ cardId: playerIds[playerIndex++], lane, level });
        if (!state.enemy.heroes[lane] && enemyIndex < enemyIds.length) enemyPlays.push({ cardId: enemyIds[enemyIndex++], lane, level });
      }
      state = resolveV2Round(state, playerPlays, enemyPlays, rules);
    }
    return {
      rounds: state.round - 1,
      result: state.status,
      playerCommanderHp: state.player.commanderHp,
      enemyCommanderHp: state.enemy.commanderHp,
      defeatedHeroes: state.player.defeated.length + state.enemy.defeated.length,
      directDamage: sum(state.events.filter(event => event.type === 'COMMANDER_DAMAGE').map(event => event.amount ?? 0)),
    };
  }

  const formulas = ['A', 'B', 'C', 'D'];
  const commanderComparisons = formulas.flatMap(formula => [1, 20, 40, 60].map(level => {
    const matches = [];
    for (let player = 0; player < decks.length; player += 1) {
      for (let enemy = 0; enemy < decks.length; enemy += 1) {
        if (player !== enemy) matches.push(simulate(decks[player].ids, decks[enemy].ids, level, formula));
      }
    }
    return {
      formula,
      level,
      commanderHpByStarter: decks.map(deck => ({ faction: deck.faction, hp: commanderHp(deck.ids, level, 0, formula) })),
      averageRounds: +(sum(matches.map(match => match.rounds)) / matches.length).toFixed(1),
      rangeRounds: [Math.min(...matches.map(match => match.rounds)), Math.max(...matches.map(match => match.rounds))],
    };
  }));

  const directDamageMatchups = [
    { label: '50% uncapped', multiplier: 0.5, cap: Number.POSITIVE_INFINITY },
    { label: '50% capped at 10', multiplier: 0.5, cap: 10 },
    { label: '75% capped at 15 (current)', multiplier: 0.75, cap: 15 },
    { label: '75% uncapped', multiplier: 0.75, cap: Number.POSITIVE_INFINITY },
    { label: '100% uncapped', multiplier: 1, cap: Number.POSITIVE_INFINITY },
  ].map(scenario => [1, 20, 40, 60].map(level => {
    const matches = [];
    for (let player = 0; player < decks.length; player += 1) {
      for (let enemy = 0; enemy < decks.length; enemy += 1) {
        if (player !== enemy) matches.push(simulate(decks[player].ids, decks[enemy].ids, level, 'D', {
          directCommanderMultiplier: scenario.multiplier,
          directCommanderDamageCap: scenario.cap,
        }));
      }
    }
    return {
      scenario: scenario.label,
      level,
      averageRounds: +(sum(matches.map(match => match.rounds)) / matches.length).toFixed(1),
      rangeRounds: [Math.min(...matches.map(match => match.rounds)), Math.max(...matches.map(match => match.rounds))],
    };
  })).flat();

  const damageSamples = [
    ...representative.map(card => ({ id: card.id, level: 20, attack: combatStats(card.id, 20).attack })),
    { id: 'und-vharos', level: 60, attack: combatStats('und-vharos', 60).attack },
  ].map(sample => ({ ...sample, directDamage: Math.min(DIRECT_COMMANDER_DAMAGE_CAP, Math.ceil(sample.attack * DIRECT_COMMANDER_MULTIPLIER)) }));

  console.log(JSON.stringify({
    roster: {
      heroCount: heroes.length,
      medianPower,
      powerDistribution: Object.fromEntries([...new Set(powerValues)].map(power => [power, powerValues.filter(value => value === power).length])),
      levelExamples: representative.map(card => ({ id: card.id, power: card.power, levels: [1, 20, 40, 60].map(level => ({ level, ...combatStats(card.id, level) })) })),
    },
    peerCombat,
    ascension,
    commanderComparisons,
    directDamageMatchups,
    directDamage: { formula: `${DIRECT_COMMANDER_MULTIPLIER} × ATK, capped at ${DIRECT_COMMANDER_DAMAGE_CAP}`, samples: damageSamples },
  }, null, 2));
} finally {
  await server.close();
}
