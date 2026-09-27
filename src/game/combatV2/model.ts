import { getCard } from '../cards';
import { LANES, type LaneId } from '../types';

export type V2Hero = { id: string; cardId: string; attack: number; attackMod:number; maxHp: number; hp: number; shield: number; level: number; ascension: number };
export type V2Side = { commanderHp: number; heroes: Partial<Record<LaneId,V2Hero>>; defeated: string[]; cardsLeft:string[]; deployed:string[] };
export type V2Event = { type: 'HERO_DAMAGE'|'HERO_HEAL'|'SHIELD_APPLIED'|'HERO_BUFF'|'HERO_DEBUFF'|'HERO_DESTROYED'|'COMMANDER_DAMAGE'|'HERO_DEPLOYED'; side: 'player'|'enemy'; lane: LaneId; amount?: number; heroId?: string; hp?: number };
export type V2State = { seed: number; round: number; player: V2Side; enemy: V2Side; events: V2Event[]; status: 'IN_PROGRESS'|'PLAYER_WIN'|'ENEMY_WIN'|'DRAW' };
export const DIRECT_COMMANDER_MULTIPLIER = 0.75;

export function combatStats(cardId: string, level = 1, ascension = 0) {
  const card=getCard(cardId); const power=Math.max(1,card.power ?? 1); const lv=Math.max(1,Math.min(60,Math.floor(level))); const rank=Math.max(0,Math.min(3,Math.floor(ascension)));
  const attack=Math.round(power*2.4+2)+Math.floor((lv-1)/10)+rank*2;
  const maxHp=Math.round(attack*2.5)+Math.floor((lv-1)/10)*2+rank*7;
  return { attack, maxHp };
}
export function makeV2Hero(cardId: string, level=1, ascension=0): V2Hero { const stats=combatStats(cardId,level,ascension); return { id:`${cardId}:${level}:${ascension}`,cardId,...stats,attackMod:0,hp:stats.maxHp,shield:0,level,ascension }; }
export function commanderHp(heroIds: string[], level=1, ascension=0, mode:'A'|'B'|'C'='B') {
  const vitality=heroIds.reduce((sum,id)=>sum+combatStats(id,level,ascension).maxHp,0);
  if(mode==='A')return Math.max(60,Math.round(vitality*.25));
  if(mode==='C')return Math.max(80,vitality);
  return Math.round(80+vitality*.25);
}
export function createV2State(seed:number, playerIds:string[], enemyIds:string[], opts:{playerLevel?:number;enemyLevel?:number;playerAscension?:number;enemyAscension?:number;playerLevels?:Record<string,number>;enemyLevels?:Record<string,number>;playerAscensions?:Record<string,number>;enemyAscensions?:Record<string,number>;boss?:boolean}={}):V2State {
  const pLevel=opts.playerLevel??1,eLevel=opts.enemyLevel??1; const eList=opts.boss?['und-vharos']:enemyIds;
  const vitality=(ids:string[],levels?:Record<string,number>,ascensions?:Record<string,number>,level=pLevel,rank=opts.playerAscension??0)=>ids.reduce((sum,id)=>sum+combatStats(id,levels?.[id]??level,ascensions?.[id]??rank).maxHp,0);
  const hpP=Math.max(60,Math.round(vitality(playerIds,opts.playerLevels,opts.playerAscensions)*.25)); const hpE=opts.boss?600:Math.max(60,Math.round(vitality(eList,opts.enemyLevels,opts.enemyAscensions,eLevel,opts.enemyAscension??0)*.25));
  return {seed:seed>>>0,round:1,player:{commanderHp:hpP,heroes:{},defeated:[],cardsLeft:[...playerIds],deployed:[]},enemy:{commanderHp:hpE,heroes:{},defeated:[],cardsLeft:[...enemyIds],deployed:[]},events:[],status:'IN_PROGRESS'};
}
export type V2Play = { cardId:string; lane:LaneId; level?:number; ascension?:number; spell?:'fireball'|'heal'|'shield'|'attackUp'|'attackDown' };
const roundDamage=(target:V2Hero,amount:number) => {const absorbed=Math.min(target.shield,amount);target.shield-=absorbed;const damage=amount-absorbed;const applied=Math.min(target.hp,damage);target.hp=Math.max(0,target.hp-applied);return applied;};
export function resolveV2Round(state:V2State, playerPlays:V2Play[], enemyPlays:V2Play[]):V2State {
  const next:V2State=structuredClone(state);const startEvents:V2Event[]=[];
  for(const side of [next.player,next.enemy])for(const hero of Object.values(side.heroes))if(hero)hero.attackMod=0;
  for(const [side,plays] of [['player',playerPlays],['enemy',enemyPlays]] as const){const own=next[side],foe=next[side==='player'?'enemy':'player'];
    for(const play of plays){
      if(play.spell==='fireball'){const target=foe.heroes[play.lane];if(target){const damage=roundDamage(target,10);startEvents.push({type:'HERO_DAMAGE',side,lane:play.lane,amount:damage,heroId:target.id,hp:target.hp});if(target.hp<=0){delete foe.heroes[play.lane];foe.defeated.push(target.cardId);startEvents.push({type:'HERO_DESTROYED',side,lane:play.lane,heroId:target.id});}}else{foe.commanderHp=Math.max(0,foe.commanderHp-10);startEvents.push({type:'COMMANDER_DAMAGE',side,lane:play.lane,amount:10,hp:foe.commanderHp});}continue;}
      if(play.spell==='heal'){const ally=own.heroes[play.lane];if(ally){const old=ally.hp;ally.hp=Math.min(ally.maxHp,ally.hp+12);startEvents.push({type:'HERO_HEAL',side,lane:play.lane,amount:ally.hp-old,heroId:ally.id,hp:ally.hp});}continue;}
      if(play.spell==='shield'){const ally=own.heroes[play.lane];if(ally){ally.shield+=10;startEvents.push({type:'SHIELD_APPLIED',side,lane:play.lane,amount:10,heroId:ally.id});}continue;}
      if(play.spell==='attackUp'){const ally=own.heroes[play.lane];if(ally){ally.attackMod+=3;startEvents.push({type:'HERO_BUFF',side,lane:play.lane,amount:3,heroId:ally.id});}continue;}
      if(play.spell==='attackDown'){const target=foe.heroes[play.lane];if(target){target.attackMod-=3;startEvents.push({type:'HERO_DEBUFF',side,lane:play.lane,amount:3,heroId:target.id});}continue;}
      if(own.heroes[play.lane])continue;const cardIndex=own.cardsLeft.indexOf(play.cardId);if(cardIndex<0)continue;own.cardsLeft.splice(cardIndex,1);own.deployed.push(play.cardId);const hero=makeV2Hero(play.cardId,play.level,play.ascension);own.heroes[play.lane]=hero;startEvents.push({type:'HERO_DEPLOYED',side,lane:play.lane,heroId:hero.id,hp:hero.hp});
    }
  }
  const combatEvents:V2Event[]=[];
  for(const lane of LANES){const p=next.player.heroes[lane],e=next.enemy.heroes[lane];if(p&&e){const pDamage=roundDamage(e,Math.max(1,p.attack+p.attackMod)),eDamage=roundDamage(p,Math.max(1,e.attack+e.attackMod));combatEvents.push({type:'HERO_DAMAGE',side:'player',lane,amount:pDamage,heroId:e.id,hp:e.hp},{type:'HERO_DAMAGE',side:'enemy',lane,amount:eDamage,heroId:p.id,hp:p.hp});if(e.hp<=0){delete next.enemy.heroes[lane];next.enemy.defeated.push(e.cardId);combatEvents.push({type:'HERO_DESTROYED',side:'player',lane,heroId:e.id});}if(p.hp<=0){delete next.player.heroes[lane];next.player.defeated.push(p.cardId);combatEvents.push({type:'HERO_DESTROYED',side:'enemy',lane,heroId:p.id});}}
    else if(p){const damage=Math.ceil(Math.max(1,p.attack+p.attackMod)*DIRECT_COMMANDER_MULTIPLIER);next.enemy.commanderHp=Math.max(0,next.enemy.commanderHp-damage);combatEvents.push({type:'COMMANDER_DAMAGE',side:'player',lane,amount:damage,hp:next.enemy.commanderHp});}
    else if(e){const damage=Math.ceil(Math.max(1,e.attack+e.attackMod)*DIRECT_COMMANDER_MULTIPLIER);next.player.commanderHp=Math.max(0,next.player.commanderHp-damage);combatEvents.push({type:'COMMANDER_DAMAGE',side:'enemy',lane,amount:damage,hp:next.player.commanderHp});}}
  next.events=[...next.events,...startEvents,...combatEvents];next.round+=1;
  if(next.player.commanderHp<=0&&next.enemy.commanderHp<=0)next.status='DRAW';else if(next.enemy.commanderHp<=0)next.status='PLAYER_WIN';else if(next.player.commanderHp<=0)next.status='ENEMY_WIN';
  if(next.status==='IN_PROGRESS'&&next.player.cardsLeft.length===0&&next.enemy.cardsLeft.length===0&&LANES.every(l=>!next.player.heroes[l]&&!next.enemy.heroes[l]))next.status=next.player.commanderHp===next.enemy.commanderHp?'DRAW':next.player.commanderHp>next.enemy.commanderHp?'PLAYER_WIN':'ENEMY_WIN';
  return next;
}
export function translatePrototypeSpell(cardId:string):V2Play['spell']|undefined { return ({'spl-fireball':'fireball','spl-power-surge':'attackUp','spl-weakness':'attackDown','spl-aegis-ward':'shield'} as Record<string,V2Play['spell']>)[cardId]; }
