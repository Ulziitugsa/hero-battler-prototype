import { useEffect, useRef, useState } from 'react';
import { CardArtwork } from '../components/CardArtwork';
import { GameCard } from '../components/card/GameCard';
import { cardCopyView } from '../game/cards/cardCopy';
import { CardViewer } from '../components/card/CardViewer';
import { GemIcon } from '../components/GemIcon';
import { GoldIcon } from '../components/GoldIcon';
import { Icon } from '../components/Icon';
import { RewardFeedback } from '../components/RewardFeedback';
import { TicketIcon } from '../components/TicketIcon';
import { track } from '../analytics/track';
import { getBackground } from '../game/backgrounds/definitions';
import { getCard } from '../game/cards';
import { useCollection } from '../game/collection/useCollection';
import { daysRemaining } from '../game/events/definitions';
import { claimEventMilestone, claimEventMission, claimLoginReward, completionRatio, isMilestoneDone, isMissionComplete, isMissionDone, loginRewardClaimable, requirementProgress, type EventClaimResult } from '../game/events/store';
import { hasDirectReward, type EventFeaturedProduct, type EventMilestoneDef, type EventReward } from '../game/events/types';
import { useLiveEvent } from '../game/events/useLiveEvent';
import '../styles/event.css';

function RewardChips({ reward }: { reward: EventReward }) {
  return <span className="event-reward-chips">
    {reward.gold ? <span><GoldIcon size={13} />{reward.gold}</span> : null}
    {reward.gems ? <span><GemIcon size={13} />{reward.gems}</span> : null}
    {reward.tickets ? <span className="event-reward-ticket" aria-label={`${reward.tickets} Pull ${reward.tickets === 1 ? 'Ticket' : 'Tickets'}`}><TicketIcon size={13} />{reward.tickets}</span> : null}
    {reward.cardIds?.map((id, index) => <span key={`${id}-${index}`} className="event-reward-card">{getCard(id).shortName}</span>)}
    {reward.backgroundId ? <span className="event-reward-cosmetic">{getBackground(reward.backgroundId).name} background</span> : null}
  </span>;
}

function describeGrant(reward: EventReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`${reward.gold} Gold`);
  if (reward.gems) parts.push(`${reward.gems} Gems`);
  if (reward.tickets) parts.push(`${reward.tickets} Pull Ticket${reward.tickets === 1 ? '' : 's'}`);
  for (const id of reward.cardIds ?? []) parts.push(getCard(id).name);
  if (reward.backgroundId) parts.push(`${getBackground(reward.backgroundId).name} background`);
  return parts.length ? `+ ${parts.join(' · ')}` : 'Reward claimed';
}

/** A progress-only objective: no reward to show or claim. It completes on its own and counts toward event progress. */
function ObjectiveRow({ title, current, needed, done }: { title: string; current: number; needed: number; done: boolean }) {
  return <li className={`event-row objective ${done ? 'done' : ''}`}>
    <span className="event-row-copy"><strong>{title}</strong><span className="event-objective-tag">Objective</span><ProgressBar current={Math.min(current, needed)} needed={needed} label={`${title} progress`} /></span>
    <span className="event-row-state">{done ? <span className="event-objective-done"><Icon name="check" size={13} />Complete</span> : `${Math.min(current, needed)}/${needed}`}</span>
  </li>;
}

function ProgressBar({ current, needed, label }: { current: number; needed: number; label: string }) {
  return <span className="event-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={needed} aria-valuenow={current}><i style={{ width: `${needed ? Math.min(100, current / needed * 100) : 0}%` }} /></span>;
}

export function EventPage({ onBack, onOpenShop }: { onBack: () => void; onOpenShop: (product: EventFeaturedProduct) => void }) {
  const live = useLiveEvent();
  const owned = useCollection();
  const [inspect, setInspect] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (!live || opened.current) return;
    opened.current = true;
    track('event_opened', { eventId: live.def.id, claimable: live.claimable });
  }, [live]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  if (!live) {
    return <main className="event-screen event-screen-empty">
      <button type="button" className="event-back" onClick={onBack} aria-label="Back to Home"><Icon name="back" size={18} /></button>
      <h1>No event is running</h1>
      <p>New events appear on Home when they begin.</p>
    </main>;
  }

  const { def, progress, now } = live;
  const days = daysRemaining(def, now);
  const loginReady = loginRewardClaimable(def, progress, now);
  const completion = Math.round(completionRatio(def, progress, owned) * 100);
  const handle = (result: EventClaimResult) => setFeedback(result.ok ? describeGrant(result.granted) : result.reason);
  const checkIn = (day: number) => { const result = claimLoginReward(def.id); setFeedback(result.ok ? (result.checkpoint ? `Day ${day} checkpoint reached` : describeGrant(result.granted)) : result.reason); };
  const final = def.finalReward;
  const finalProgress = requirementProgress(def, final.requirement, progress, owned);
  const finalClaimed = progress.claimed.includes(final.id);

  const milestoneRow = (milestone: EventMilestoneDef) => {
    const { current, needed } = requirementProgress(def, milestone.requirement, progress, owned);
    if (!hasDirectReward(milestone.reward)) return <ObjectiveRow key={milestone.id} title={milestone.title} current={current} needed={needed} done={isMilestoneDone(def, milestone, progress, owned)} />;
    const claimed = progress.claimed.includes(milestone.id);
    const ready = !claimed && current >= needed;
    return <li key={milestone.id} className={`event-row ${claimed ? 'claimed' : ready ? 'ready' : ''}`}>
      <span className="event-row-copy"><strong>{milestone.title}</strong><RewardChips reward={milestone.reward} /><ProgressBar current={current} needed={needed} label={`${milestone.title} progress`} /></span>
      <span className="event-row-state">{claimed ? 'Claimed' : ready ? <button type="button" onClick={() => handle(claimEventMilestone(def.id, milestone.id))}>Claim</button> : `${current}/${needed}`}</span>
    </li>;
  };

  return <main className="event-screen" style={{ ['--event-accent' as string]: def.theme.accent }}>
    <header className="event-hero">
      <div className="event-hero-art" aria-hidden="true"><CardArtwork cardId={def.theme.heroCardId} priority /></div>
      <button type="button" className="event-back" onClick={onBack} aria-label="Back to Home"><Icon name="back" size={18} /></button>
      <div className="event-hero-copy">
        <span className="moon-eyebrow">LIMITED EVENT · {days <= 1 ? 'ENDS TODAY' : `ENDS IN ${days} DAYS`}</span>
        <h1>{def.name}</h1>
        <p>{def.tagline}</p>
      </div>
      <div className="event-completion"><span>Event progress <strong>{completion}%</strong></span><ProgressBar current={completion} needed={100} label="Event progress" /></div>
    </header>
    <p className="event-lore">{def.lore}</p>
    {feedback && <RewardFeedback tone="small">{feedback}</RewardFeedback>}

    <section className="event-section" aria-labelledby="event-login-title">
      <div className="event-section-head"><h2 id="event-login-title">Daily login</h2><small>One per day · {progress.loginClaims}/{def.loginRewards.length}</small></div>
      <ol className="event-login-track">
        {def.loginRewards.map((day, index) => {
          const claimed = index < progress.loginClaims;
          const today = index === progress.loginClaims && loginReady;
          const checkpoint = !hasDirectReward(day.reward);
          return <li key={day.day} className={`${claimed ? 'claimed' : today ? 'ready' : ''} ${checkpoint ? 'checkpoint' : 'reward-day'}`.trim()}>
            <small>Day {day.day}</small>
            {hasDirectReward(day.reward) ? <RewardChips reward={day.reward} /> : <span className="event-checkpoint">Check&shy;point</span>}
            {claimed ? <Icon name="check" size={13} /> : today ? <button type="button" onClick={() => checkIn(day.day)}>{checkpoint ? 'Check in' : 'Claim'}</button> : null}
          </li>;
        })}
      </ol>
      {!loginReady && progress.loginClaims < def.loginRewards.length && <p className="event-note">{hasDirectReward(def.loginRewards[progress.loginClaims].reward) ? 'Next login reward tomorrow.' : 'Next check-in tomorrow.'}</p>}
    </section>

    <section className="event-section" aria-labelledby="event-missions-title">
      <div className="event-section-head"><h2 id="event-missions-title">Missions</h2><small>{def.missions.filter(m => isMissionComplete(m, progress)).length}/{def.missions.length} complete</small></div>
      <ul className="event-list">
        {def.missions.map(mission => {
          const entry = progress.missions[mission.id] ?? { count: 0, claimed: false };
          if (!hasDirectReward(mission.reward)) return <ObjectiveRow key={mission.id} title={mission.title} current={entry.count} needed={mission.target} done={isMissionDone(mission, progress)} />;
          const ready = !entry.claimed && entry.count >= mission.target;
          return <li key={mission.id} className={`event-row ${entry.claimed ? 'claimed' : ready ? 'ready' : ''}`}>
            <span className="event-row-copy"><strong>{mission.title}</strong><RewardChips reward={mission.reward} /><ProgressBar current={entry.count} needed={mission.target} label={`${mission.title} progress`} /></span>
            <span className="event-row-state">{entry.claimed ? 'Claimed' : ready ? <button type="button" onClick={() => handle(claimEventMission(def.id, mission.id))}>Claim</button> : `${entry.count}/${mission.target}`}</span>
          </li>;
        })}
      </ul>
    </section>

    <section className="event-section" aria-labelledby="event-milestones-title">
      <div className="event-section-head"><h2 id="event-milestones-title">Milestones</h2></div>
      <ul className="event-list">{def.milestones.map(milestoneRow)}</ul>
    </section>

    {def.featuredProduct && <section className="event-section event-product" aria-labelledby="event-product-title">
      <div className="event-section-head"><h2 id="event-product-title">Featured · {def.featuredProduct.name}</h2></div>
      <p>{def.featuredProduct.blurb}</p>
      <div className="event-product-cards">
        {def.featuredProduct.featuredCardIds.map(id => <button type="button" key={id} onClick={() => setInspect(id)} aria-label={`${getCard(id).name}: show details`}><GameCard cardId={id} density="tile" hpContribution={cardCopyView(id).hpContribution} /></button>)}
      </div>
      <button type="button" className="event-product-cta" onClick={() => onOpenShop(def.featuredProduct!)}>{def.featuredProduct.kind === 'box' ? 'View the Box' : 'View the Structure Deck'} <span aria-hidden="true">→</span></button>
    </section>}

    <section className={`event-section event-final ${finalClaimed ? 'claimed' : ''}`} aria-labelledby="event-final-title">
      <div className="event-section-head"><h2 id="event-final-title">Final reward</h2><small>{final.title}</small></div>
      <div className="event-final-body">
        {final.reward.cardIds?.[0] && <button type="button" className="event-final-card" onClick={() => setInspect(final.reward.cardIds![0])} aria-label={`${getCard(final.reward.cardIds[0]).name}: show details`}><GameCard cardId={final.reward.cardIds[0]} density="tile" treatment="event" hpContribution={cardCopyView(final.reward.cardIds[0]).hpContribution} /></button>}
        <div className="event-final-copy">
          <RewardChips reward={final.reward} />
          {final.reward.backgroundId && <span className="event-final-background" style={{ backgroundImage: `url(${getBackground(final.reward.backgroundId).asset})` }} role="img" aria-label={`${getBackground(final.reward.backgroundId).name} background preview`} />}
          <ProgressBar current={finalProgress.current} needed={finalProgress.needed} label="Final reward progress" />
          {finalClaimed ? <span className="event-final-state">Claimed</span> : finalProgress.current >= finalProgress.needed
            ? <button type="button" className="event-final-claim" onClick={() => handle(claimEventMilestone(def.id, final.id))}>Claim final reward</button>
            : <span className="event-final-state">{finalProgress.current}/{finalProgress.needed} missions</span>}
        </div>
      </div>
    </section>

    <p className="event-footnote">Event ends {new Date(def.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Unclaimed rewards cannot be claimed after it ends. Cards and cosmetics you earn are yours to keep.</p>
    {inspect && <CardViewer cardId={inspect} context="event" onClose={() => setInspect(null)} />}
  </main>;
}
