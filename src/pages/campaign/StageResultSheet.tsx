import type { BattleResultOutcome } from '../../game/campaign/progress';
import { Icon, type IconName } from '../../components/Icon';
import { RewardCard } from './RewardCard';
import { XpSummary } from '../../components/XpSummary';
import { getAscensionStatus } from '../../game/ascension/ascend';
import { track } from '../../analytics/track';
import { useEffect } from 'react';
import { haptics } from '../../platform/haptics';

const REWARD_ICON: Record<string, IconName> = { card: 'cards', ember: 'ember', emblem: 'hero', star: 'trophy' };

/** Victory - first clear (the reward presented as a card, seals earned, repeat reward named) and
 * Chapter Complete (the wax chapter seal + a next-region note) are the same carved sheet with rows
 * switched on, matching the design's "seal" screens. A loss gets its own much quieter variant - the
 * design has no defeat screen to port, so this is the minimal honest equivalent. */
export function StageResultSheet({ outcome, onContinue, recovery, onRetry }: { outcome: BattleResultOutcome; onContinue: () => void; recovery?: { label: string; kind: string; onSelect: () => void }; onRetry?: () => void }) {
  const { node, won, reward, objectivesMet, chapterComplete, cardGrant, starterProgress, xp, gems, gold } = outcome;
  const isCardReward = !!(reward?.firstClear && reward.def.cardId);

  useEffect(() => {
    if (won) void (chapterComplete ? haptics.chapterComplete() : haptics.campaignVictory());
  }, [won, chapterComplete]);

  if (!won) {
    return (
      <div className="overlay-backdrop campaign-sheet-backdrop">
        <div className="campaign-result-sheet defeat">
          <div className="campaign-result-disc defeat">
            <Icon name="warning" size={30} />
          </div>
          <span className="campaign-result-kicker">{node.name}</span>
          <span className="campaign-result-title">Not this time</span>
          <span className="campaign-result-blurb">The road is still there. A small change to your deck or your lane plan can help.</span>
          <XpSummary xp={xp} />
          {recovery && <button type="button" className="campaign-result-cta" onClick={() => { track('post_loss_action_selected', { stageId: node.id, action: recovery.kind }); recovery.onSelect(); }}>{recovery.label}</button>}
          <button type="button" className="campaign-result-secondary" onClick={() => { track('post_loss_action_selected', { stageId: node.id, action: 'retry' }); (onRetry ?? onContinue)(); }}>Try again</button>
        </div>
      </div>
    );
  }

  if (chapterComplete) {
    return (
      <div className="overlay-backdrop campaign-sheet-backdrop">
        <div className="campaign-result-sheet">
          <div className="campaign-result-disc chapter">
            <Icon name="hero" size={30} />
          </div>
          <span className="campaign-result-kicker">The Ashen Road · Chapter 1</span>
          <span className="campaign-result-title">Watch on the dust road</span>
          <span className="campaign-result-blurb">Thirteen nodes walked. The Grave Tyrant is put back in the ground.</span>
          <XpSummary xp={null} gems={gems} gold={gold} />
          <div className="campaign-result-rows">
            <div className="campaign-result-row">
              <span className="campaign-result-row-icon gold">
                <Icon name="trophy" size={16} />
              </span>
              <div className="campaign-result-row-text">
                <span>Chapter seal pressed</span>
                <span>{reward?.def.label}</span>
              </div>
            </div>
            <div className="campaign-result-row">
              <span className="campaign-result-row-icon">
                <Icon name="graveyard" size={16} />
              </span>
              <div className="campaign-result-row-text">
                <span>Grave Tyrant defeated</span>
                <span>The barrow gate stands open on your map</span>
              </div>
            </div>
            <div className="campaign-result-row">
              <span className="campaign-result-row-icon locked">
                <Icon name="lock" size={16} />
              </span>
              <div className="campaign-result-row-text">
                <span>Chapter 2</span>
                <span>Reserved - arrives with Region 1's next chapter</span>
              </div>
            </div>
          </div>
          <button type="button" className="campaign-result-cta" onClick={() => { track('post_win_action_selected', { stageId: node.id, action: 'continue_chapter', chapterComplete: true }); onContinue(); }}>
            Return to the road
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-backdrop campaign-sheet-backdrop">
      <div className="campaign-result-sheet">
        <div className="campaign-result-disc">
          <Icon name="trophy" size={30} />
        </div>
        <span className="campaign-result-kicker">{node.name}</span>
        <span className="campaign-result-title">{node.encounter ? 'Stage cleared' : 'Reward claimed'}</span>
        <span className="campaign-result-blurb">{node.encounter ? `${node.teach} - held.` : node.reward?.sub}</span>
        <XpSummary xp={xp} gems={gems} gold={gold} />

        {objectivesMet.length > 0 && (
          <div className="campaign-result-marks">
            {objectivesMet.map((o) => (
              <div key={o.id} className={`campaign-result-mark ${o.met ? 'on' : ''}`}>
                <span className="campaign-result-mark-seal">
                  <Icon name="check" size={14} />
                </span>
                <span>{o.text}</span>
              </div>
            ))}
          </div>
        )}

        {isCardReward && reward?.def.cardId && <RewardCard cardId={reward.def.cardId} grant={cardGrant} copies={reward.def.count ?? 1} />}

        {starterProgress && (
          <div className={`campaign-result-unlock ${starterProgress.unlockedNow ? 'done' : ''}`}>
            <Icon name={starterProgress.unlockedNow ? 'check' : 'lock'} size={15} />
            {starterProgress.unlockedNow ? (
              <span>
                <strong>{starterProgress.name} unlocked</strong> — ready in Decks
              </span>
            ) : (
              <span>
                {starterProgress.name} · {starterProgress.collected} / {starterProgress.total} cards collected
              </span>
            )}
          </div>
        )}

        {isCardReward && cardGrant && !cardGrant.isNew && getAscensionStatus(cardGrant.cardId).canAscend && (
          <div className="campaign-result-unlock">
            <Icon name="power" size={15} />
            <span>Card Mastery available — see Cards</span>
          </div>
        )}

        {reward && !isCardReward && (
          <div className="campaign-result-reward-card">
            <div className={`campaign-result-reward-portrait ${node.encounter?.foeFaction}`}>
              <Icon name={REWARD_ICON[reward.def.icon]} size={26} />
            </div>
            <span className="campaign-result-reward-name">{reward.def.label}</span>
          </div>
        )}

        <div className="campaign-result-rows">
          {!isCardReward && (
          <div className="campaign-result-row">
            <span className="campaign-result-row-icon gold">
              <Icon name={reward?.firstClear ? 'cards' : 'ember'} size={16} />
            </span>
            <div className="campaign-result-row-text">
              <span>{reward?.firstClear ? 'New reward unlocked' : 'First clear · already claimed'}</span>
              <span>{reward?.def.sub}</span>
            </div>
          </div>
          )}
          {node.encounter && (
          <div className="campaign-result-row">
            <span className="campaign-result-row-icon">
              <Icon name="ember" size={16} />
            </span>
            <div className="campaign-result-row-text">
              <span>Repeat reward</span>
              <span>{node.encounter.repeatReward.label} each time you clear it again</span>
            </div>
          </div>
          )}
        </div>

        <button type="button" className="campaign-result-cta" onClick={() => { track('post_win_action_selected', { stageId: node.id, action: 'continue_chapter', chapterComplete: false }); onContinue(); }}>
          Continue the chapter
        </button>
      </div>
    </div>
  );
}
