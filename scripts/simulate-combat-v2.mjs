import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PLAYTEST_ROSTER } = await server.ssrLoadModule('/src/game/cards/roster.ts');
  const { getCard } = await server.ssrLoadModule('/src/game/cards/index.ts');
  const { STARTER_DECKS } = await server.ssrLoadModule('/src/game/cards/starterDecks.ts');
  const { combatStats, commanderHp, createV2State, resolveV2Round } = await server.ssrLoadModule('/src/game/combatV2/model.ts');
  const heroes = [...new Set(PLAYTEST_ROSTER)].map(getCard).filter(c => c.type === 'hero');
  const vals = heroes.map(c => c.power).sort((a,b)=>a-b);
  const sum = xs => xs.reduce((a,b)=>a+b,0);
  const median = xs => xs[Math.floor(xs.length/2)];
  const byPower = [...new Set(vals)].map(power => {const c=heroes.find(h=>h.power===power);return {power,id:c.id,atk:combatStats(c.id).attack,hp:combatStats(c.id).maxHp};});
  const medCard = heroes.find(c=>c.power===median(vals));
  const examples = [1,20,40,60].map(level=>({level,...combatStats(medCard.id,level,0)}));
  const ascension = [0,1,2].map(rank=>({rank,...combatStats(medCard.id,40,rank)}));
  const matchup = byPower.map(a=>byPower.map(d=>Math.ceil(d.hp/a.atk)));
  const growthChecks = [[1,1],[20,1],[1,20],[40,20],[20,40],[60,1]].map(([aLevel,dLevel])=>({attackLevel:aLevel,targetLevel:dLevel,attacker:combatStats(medCard.id,aLevel).attack,targetHp:combatStats(medCard.id,dLevel).maxHp,hits:Math.ceil(combatStats(medCard.id,dLevel).maxHp/combatStats(medCard.id,aLevel).attack)}));
  const decks = Object.entries(STARTER_DECKS).map(([faction,ids])=>({faction,ids:ids.filter(id=>getCard(id).type==='hero')}));
  const vitality = decks.map(d=>({faction:d.faction,heroes:d.ids.length,A:commanderHp(d.ids,1,0,'A'),B:commanderHp(d.ids,1,0,'B'),C:commanderHp(d.ids,1,0,'C')}));
  const simulate = (p,e,level=20) => {
    let s=createV2State(101,p,e,{playerLevel:level,enemyLevel:level}); let pi=0,ei=0;
    for(let i=0;i<100&&s.status==='IN_PROGRESS';i++){
      const pp=[],ep=[];for(const lane of ['left','center','right']){
        if(!s.player.heroes[lane]&&pi<p.length)pp.push({cardId:p[pi++],lane,level});
        if(!s.enemy.heroes[lane]&&ei<e.length)ep.push({cardId:e[ei++],lane,level});
      }
      s=resolveV2Round(s,pp,ep);
      if(pi>=p.length&&ei>=e.length&&Object.keys(s.player.heroes).length===0&&Object.keys(s.enemy.heroes).length===0)break;
    }
    const events=s.events;return {rounds:s.round-1,status:s.status,playerHp:s.player.commanderHp,enemyHp:s.enemy.commanderHp,heroesDestroyed:s.player.defeated.length+s.enemy.defeated.length,directDamage:sum(events.filter(e=>e.type==='COMMANDER_DAMAGE').map(e=>e.amount??0)),winner:s.status==='PLAYER_WIN'?'player':s.status==='ENEMY_WIN'?'enemy':'unfinished'};
  };
  const matches=[];for(const p of decks)for(const e of decks)if(p!==e)matches.push({match:`${p.faction} vs ${e.faction}`,...simulate(p.ids,e.ids)});
  const directDamage = [0.5,0.75,1].map(multiplier=>({multiplier,lv20MedianHero:Math.ceil(combatStats(medCard.id,20).attack*multiplier)}));
  console.log(JSON.stringify({heroCount:heroes.length,power:{min:vals[0],median:median(vals),max:vals.at(-1),mean:+(sum(vals)/vals.length).toFixed(2),histogram:Object.fromEntries([...new Set(vals)].map(v=>[v,vals.filter(x=>x===v).length]))},medianExample:{id:medCard.id,power:medCard.power,levels:examples,ascension},byPower,matchup,powerRows:byPower.map(x=>x.power),growthChecks,commanderAlternatives:vitality,directDamage,prototypeMatches:matches},null,2));
} finally { await server.close(); }
