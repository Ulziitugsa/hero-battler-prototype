import { getCard } from '../cards/index.js';
import { LANES, type LaneId } from '../types/index.js';

export type V2Hero = {
  id: string;
  cardId: string;
  attack: number;
  attackMod: number;
  maxHp: number;
  hp: number;
  shield: number;
  level: number;
  ascension: number;
};

export type V2Side = {
  commanderHp: number;
  commanderShield: number;
  heroes: Partial<Record<LaneId, V2Hero>>;
  defeated: string[];
  cardsLeft: string[];
  deployed: string[];
  skippedLanes: LaneId[];
};

export type V2Event = {
  type: 'HERO_DAMAGE' | 'HERO_HEAL' | 'SHIELD_APPLIED' | 'HERO_BUFF' | 'HERO_DEBUFF' | 'HERO_DESTROYED' | 'COMMANDER_DAMAGE' | 'HERO_DEPLOYED' | 'LANE_STALLED';
  side: 'player' | 'enemy';
  lane: LaneId;
  amount?: number;
  heroId?: string;
  hp?: number;
};

export type V2State = {
  seed: number;
  round: number;
  player: V2Side;
  enemy: V2Side;
  events: V2Event[];
  status: 'IN_PROGRESS' | 'PLAYER_WIN' | 'ENEMY_WIN' | 'DRAW';
};

export const DIRECT_COMMANDER_MULTIPLIER = 0.75;
export const DIRECT_COMMANDER_DAMAGE_CAP = 15;
export const BOSS_COMMANDER_HP = 240;

export function combatStats(cardId: string, level = 1, ascension = 0) {
  const card = getCard(cardId);
  const power = Math.max(1, card.power ?? 1);
  const lv = Math.max(1, Math.min(60, Math.floor(level)));
  const rank = Math.max(0, Math.min(3, Math.floor(ascension)));
  const levelSteps = Math.floor((lv - 1) / 10);
  // Keep roster Power as the card's role/tier baseline. Level adds one Attack per ten levels;
  // Ascension adds a smaller stat step so its card-specific ability remains the main reward.
  const attack = Math.round(power * 2.4 + 2) + levelSteps + rank;
  const maxHp = Math.round(attack * 2.5) + levelSteps * 2 + rank * 3;
  return { attack, maxHp };
}

export function makeV2Hero(cardId: string, level = 1, ascension = 0): V2Hero {
  const stats = combatStats(cardId, level, ascension);
  return { id: `${cardId}:${level}:${ascension}`, cardId, ...stats, attackMod: 0, hp: stats.maxHp, shield: 0, level, ascension };
}

type CommanderFormula = 'A' | 'B' | 'C' | 'D';

/** A–C are comparison rules used by the balance simulator. D is the proposed bounded deck-vitality rule. */
export function commanderHp(heroIds: string[], level = 1, ascension = 0, formula: CommanderFormula = 'D') {
  const vitality = heroIds.reduce((sum, id) => sum + combatStats(id, level, ascension).maxHp, 0);
  return commanderHpFromVitality(vitality, formula);
}

export function commanderHpFromVitality(vitality: number, formula: CommanderFormula = 'D') {
  if (formula === 'A') return Math.max(60, Math.round(vitality * 0.25));
  if (formula === 'B') return Math.round(80 + vitality * 0.25);
  if (formula === 'C') return Math.max(80, vitality);
  return Math.max(80, Math.min(120, Math.round(60 + vitality * 0.08)));
}

export function commanderHpForRoster(heroIds: string[], levels: Record<string, number> = {}, ascensions: Record<string, number> = {}) {
  const vitality = heroIds.reduce((sum, id) => sum + combatStats(id, levels[id] ?? 1, ascensions[id] ?? 0).maxHp, 0);
  return commanderHpFromVitality(vitality);
}

export function createV2State(
  seed: number,
  playerIds: string[],
  enemyIds: string[],
  opts: {
    playerLevel?: number;
    enemyLevel?: number;
    playerAscension?: number;
    enemyAscension?: number;
    playerLevels?: Record<string, number>;
    enemyLevels?: Record<string, number>;
    playerAscensions?: Record<string, number>;
    enemyAscensions?: Record<string, number>;
    boss?: boolean;
  } = {},
): V2State {
  const playerVitality = playerIds.reduce((sum, id) => sum + combatStats(id, opts.playerLevels?.[id] ?? opts.playerLevel ?? 1, opts.playerAscensions?.[id] ?? opts.playerAscension ?? 0).maxHp, 0);
  const enemyVitality = enemyIds.reduce((sum, id) => sum + combatStats(id, opts.enemyLevels?.[id] ?? opts.enemyLevel ?? 1, opts.enemyAscensions?.[id] ?? opts.enemyAscension ?? 0).maxHp, 0);
  const side = (commander: number, cards: string[]): V2Side => ({
    commanderHp: commander,
    commanderShield: 0,
    heroes: {},
    defeated: [],
    cardsLeft: [...cards],
    deployed: [],
    skippedLanes: [],
  });

  return {
    seed: seed >>> 0,
    round: 1,
    player: side(commanderHpFromVitality(playerVitality), playerIds),
    enemy: side(opts.boss ? BOSS_COMMANDER_HP : commanderHpFromVitality(enemyVitality), enemyIds),
    events: [],
    status: 'IN_PROGRESS',
  };
}

export type V2Spell = 'fireball' | 'arcaneBolt' | 'heal' | 'shield' | 'commanderShield' | 'attackUp' | 'attackDown' | 'warCry' | 'deathWave' | 'laneStall';
export type V2Play = { cardId: string; lane: LaneId; level?: number; ascension?: number; spell?: V2Spell };
export type V2CombatRules = { directCommanderMultiplier?: number; directCommanderDamageCap?: number };

function applyHeroDamage(target: V2Hero, amount: number) {
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const applied = Math.min(target.hp, amount - absorbed);
  target.hp = Math.max(0, target.hp - applied);
  return applied;
}

function applyCommanderDamage(target: V2Side, amount: number) {
  const absorbed = Math.min(target.commanderShield, amount);
  target.commanderShield -= absorbed;
  const applied = Math.min(target.commanderHp, amount - absorbed);
  target.commanderHp = Math.max(0, target.commanderHp - applied);
  return applied;
}

function destroyHero(side: V2Side, lane: LaneId, by: 'player' | 'enemy', events: V2Event[]) {
  const hero = side.heroes[lane];
  if (!hero || hero.hp > 0) return;
  delete side.heroes[lane];
  side.defeated.push(hero.cardId);
  events.push({ type: 'HERO_DESTROYED', side: by, lane, heroId: hero.id });
}

function dealHeroDamage(target: V2Hero, amount: number, side: 'player' | 'enemy', lane: LaneId, events: V2Event[]) {
  const applied = applyHeroDamage(target, amount);
  events.push({ type: 'HERO_DAMAGE', side, lane, amount: applied, heroId: target.id, hp: target.hp });
  return applied;
}

function resolveSpell(state: V2State, side: 'player' | 'enemy', play: V2Play, events: V2Event[]) {
  if (!play.spell) return;
  const own = state[side];
  const foe = state[side === 'player' ? 'enemy' : 'player'];
  const ally = own.heroes[play.lane];
  const target = foe.heroes[play.lane];

  switch (play.spell) {
    case 'fireball':
      if (target) {
        dealHeroDamage(target, 10, side, play.lane, events);
        destroyHero(foe, play.lane, side, events);
      } else {
        const amount = applyCommanderDamage(foe, 10);
        events.push({ type: 'COMMANDER_DAMAGE', side, lane: play.lane, amount, hp: foe.commanderHp });
      }
      break;
    case 'arcaneBolt': {
      const amount = applyCommanderDamage(foe, 5);
      events.push({ type: 'COMMANDER_DAMAGE', side, lane: play.lane, amount, hp: foe.commanderHp });
      break;
    }
    case 'heal':
      if (ally) {
        const old = ally.hp;
        ally.hp = Math.min(ally.maxHp, ally.hp + 12);
        events.push({ type: 'HERO_HEAL', side, lane: play.lane, amount: ally.hp - old, heroId: ally.id, hp: ally.hp });
      }
      break;
    case 'shield':
      if (ally) {
        ally.shield += 10;
        events.push({ type: 'SHIELD_APPLIED', side, lane: play.lane, amount: 10, heroId: ally.id });
      }
      break;
    case 'commanderShield':
      own.commanderShield += 10;
      events.push({ type: 'SHIELD_APPLIED', side, lane: play.lane, amount: 10 });
      break;
    case 'attackUp':
      if (ally) {
        ally.attackMod += 3;
        events.push({ type: 'HERO_BUFF', side, lane: play.lane, amount: 3, heroId: ally.id });
      }
      break;
    case 'attackDown':
      if (target) {
        target.attackMod -= 3;
        events.push({ type: 'HERO_DEBUFF', side, lane: play.lane, amount: 3, heroId: target.id });
      }
      break;
    case 'warCry':
      for (const lane of LANES) {
        const hero = own.heroes[lane];
        if (hero) {
          hero.attackMod += 2;
          events.push({ type: 'HERO_BUFF', side, lane, amount: 2, heroId: hero.id });
        }
      }
      break;
    case 'deathWave':
      for (const lane of LANES) {
        const hero = foe.heroes[lane];
        if (hero) {
          hero.attackMod -= 2;
          events.push({ type: 'HERO_DEBUFF', side, lane, amount: 2, heroId: hero.id });
        }
      }
      break;
    case 'laneStall':
      own.skippedLanes.push(play.lane);
      foe.skippedLanes.push(play.lane);
      events.push({ type: 'LANE_STALLED', side, lane: play.lane });
      break;
  }
}

export function resolveV2Round(state: V2State, playerPlays: V2Play[], enemyPlays: V2Play[], rules: V2CombatRules = {}): V2State {
  const next: V2State = structuredClone(state);
  const events: V2Event[] = [];

  for (const side of [next.player, next.enemy]) {
    side.skippedLanes = [];
    side.commanderShield = 0;
    for (const hero of Object.values(side.heroes)) if (hero) hero.attackMod = 0;
  }

  // Reveal both sides' Heroes before resolving either side's Spells; lane targeting sees the same board.
  for (const [side, plays] of [['player', playerPlays], ['enemy', enemyPlays]] as const) {
    const own = next[side];
    for (const play of plays) {
      if (play.spell || own.heroes[play.lane]) continue;
      const index = own.cardsLeft.indexOf(play.cardId);
      if (index < 0 || getCard(play.cardId).type !== 'hero') continue;
      own.cardsLeft.splice(index, 1);
      own.deployed.push(play.cardId);
      const hero = makeV2Hero(play.cardId, play.level, play.ascension);
      own.heroes[play.lane] = hero;
      events.push({ type: 'HERO_DEPLOYED', side, lane: play.lane, heroId: hero.id, hp: hero.hp });
    }
  }

  for (const [side, plays] of [['player', playerPlays], ['enemy', enemyPlays]] as const) {
    for (const play of plays) resolveSpell(next, side, play, events);
  }

  for (const lane of LANES) {
    if (next.player.skippedLanes.includes(lane) || next.enemy.skippedLanes.includes(lane)) continue;
    const player = next.player.heroes[lane];
    const enemy = next.enemy.heroes[lane];
    if (player && enemy) {
      const playerAttack = Math.max(1, player.attack + player.attackMod);
      const enemyAttack = Math.max(1, enemy.attack + enemy.attackMod);
      // Snapshot both strikes before resolving defeat so every Hero alive at clash start retaliates.
      const playerDamage = Math.min(enemy.hp + enemy.shield, playerAttack);
      const enemyDamage = Math.min(player.hp + player.shield, enemyAttack);
      dealHeroDamage(enemy, playerDamage, 'player', lane, events);
      dealHeroDamage(player, enemyDamage, 'enemy', lane, events);
      destroyHero(next.enemy, lane, 'player', events);
      destroyHero(next.player, lane, 'enemy', events);
    } else if (player) {
      const multiplier = rules.directCommanderMultiplier ?? DIRECT_COMMANDER_MULTIPLIER;
      const cap = rules.directCommanderDamageCap ?? DIRECT_COMMANDER_DAMAGE_CAP;
      const amount = Math.min(cap, Math.ceil(Math.max(1, player.attack + player.attackMod) * multiplier));
      const applied = applyCommanderDamage(next.enemy, amount);
      events.push({ type: 'COMMANDER_DAMAGE', side: 'player', lane, amount: applied, hp: next.enemy.commanderHp });
    } else if (enemy) {
      const multiplier = rules.directCommanderMultiplier ?? DIRECT_COMMANDER_MULTIPLIER;
      const cap = rules.directCommanderDamageCap ?? DIRECT_COMMANDER_DAMAGE_CAP;
      const amount = Math.min(cap, Math.ceil(Math.max(1, enemy.attack + enemy.attackMod) * multiplier));
      const applied = applyCommanderDamage(next.player, amount);
      events.push({ type: 'COMMANDER_DAMAGE', side: 'enemy', lane, amount: applied, hp: next.player.commanderHp });
    }
  }

  next.events = [...next.events, ...events];
  next.round += 1;
  if (next.player.commanderHp <= 0 && next.enemy.commanderHp <= 0) next.status = 'DRAW';
  else if (next.enemy.commanderHp <= 0) next.status = 'PLAYER_WIN';
  else if (next.player.commanderHp <= 0) next.status = 'ENEMY_WIN';
  if (next.status === 'IN_PROGRESS' && next.player.cardsLeft.length === 0 && next.enemy.cardsLeft.length === 0 && LANES.every(lane => !next.player.heroes[lane] && !next.enemy.heroes[lane])) {
    next.status = next.player.commanderHp === next.enemy.commanderHp ? 'DRAW' : next.player.commanderHp > next.enemy.commanderHp ? 'PLAYER_WIN' : 'ENEMY_WIN';
  }
  return next;
}

export function translatePrototypeSpell(cardId: string): V2Spell | undefined {
  return ({
    'spl-fireball': 'fireball',
    'spl-arcane-bolt': 'arcaneBolt',
    'spl-power-surge': 'attackUp',
    'spl-weakness': 'attackDown',
    'spl-aegis-ward': 'commanderShield',
    'spl-war-cry': 'warCry',
    'spl-death-wave': 'deathWave',
    'spl-stasis-field': 'laneStall',
  } as Record<string, V2Spell>)[cardId];
}
