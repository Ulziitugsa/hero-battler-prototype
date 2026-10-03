import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { chooseRankedOpponent, claimRankReward, getRanked, rankAt, readyRankRewards, RANK_REWARDS, subscribeRanked, type RankedState } from '../game/ranked/store';
import { track } from '../analytics/track';
import '../styles/ranked.css';

export function RankedPage({ onBattle }: { onBattle: () => void }) {
  const state = useSyncExternalStore(subscribeRanked, getRanked, getRanked) as RankedState;
  const rank = rankAt(state.rating); const ready = readyRankRewards(state);
  // The rival the next Ranked battle will actually face: this division's tier deck pool (game/ranked/tiers.ts).
  const rival = chooseRankedOpponent(state);
  const openedAtRating=useRef(state.rating);
  useEffect(() => { track('ranked_opened', { rating: openedAtRating.current }); }, []);
  const nextReward = RANK_REWARDS.find(r => state.peakRating < r.rating);
  return <main className="ranked-screen">
    <header className="ranked-header"><span className="moon-eyebrow">RANKED TRIALS · SEASON 1</span><h1>Prove your deck</h1><p>Climb against rival decks guided by Moonwater’s battle AI.</p></header>
    <section className="ranked-crest-card" aria-label={`${rank.division} ${rank.tier}`}>
      <div className="ranked-emblem" aria-hidden="true"><span>✦</span></div>
      <div><span className="moon-eyebrow">CURRENT DIVISION</span><h2>{rank.division} <small>{rank.tier}</small></h2><strong>{state.rating} <small>RATING</small></strong></div>
      <div className="ranked-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rank.progress}><span style={{ width: `${rank.progress}%` }} /></div>
      <div className="ranked-next">{rank.next ? `${rank.next - state.rating} points to ${rankAt(rank.next).division}` : 'Top division reached'}</div>
    </section>
    <section className="ranked-rival"><div className="ranked-rival-mark"><Icon name="battle" size={24} /></div><div><span className="moon-eyebrow">NEXT RIVAL</span><strong>{rival.deck.name}</strong><small>{rival.tier.blurb}</small></div><span className="ranked-record">{state.wins}W · {state.losses}L</span></section>
    <button type="button" className="ranked-battle moon-primary" onClick={onBattle}><Icon name="battle" size={18} /> Battle for rating <span>WIN +24 · LOSS −12</span></button>
    <section className="ranked-rewards"><div className="ranked-section-head"><h2>Division rewards</h2>{ready.length > 0 && <span className="ranked-ready-tag">{ready.length} READY</span>}</div>
      {RANK_REWARDS.map(reward => { const claimed=state.claimed.includes(reward.id); const isReady=ready.some(r=>r.id===reward.id); return <div className={`ranked-reward ${isReady?'ready':''}`} key={reward.id}><span className="ranked-reward-crest">✦</span><span><strong>{reward.rank}</strong><small>{reward.gems} Gems · {reward.gold} Gold{reward.tickets ? ` · ${reward.tickets} Ticket` : ''}</small></span><span className="ranked-reward-state">{claimed?'Claimed':isReady?<button type="button" onClick={()=>{if(claimRankReward(reward.id))track('ranked_reward_claimed',{rewardId:reward.id});}}>Claim</button>:`${reward.rating} rating`}</span></div>; })}
      {nextReward && <p className="ranked-next-reward">Next: {nextReward.rank} reward at {nextReward.rating} rating</p>}
    </section>
    {state.matches.length > 0 && <section className="ranked-history"><h2>Recent trials</h2>{state.matches.slice(0,4).map(m=><div key={m.id}><span>{m.result==='win'?'Victory':m.result==='loss'?'Defeat':'Draw'} · AI rival</span><strong>{m.delta>0?'+':''}{m.delta}</strong></div>)}</section>}
  </main>;
}
