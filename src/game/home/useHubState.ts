import { useMemo, useState } from 'react';
import { loadProgress } from '../campaign/progress';
import { loadEnergy, type EnergyState } from '../campaign/energy';
import { loadIdleReward, type IdleRewardState } from '../campaign/idleRewards';
import { useCollection } from '../collection/useCollection';
import { useEconomy, useUnlimitedGems } from '../economy/useEconomy';
import { masteryPointsAvailable } from '../progression/account';
import { useAccount } from '../progression/useAccount';
import { attentionState, campaignHub, pickHubNote, type AttentionState, type CampaignHub, type HubNote } from './hubState';

export interface HubState {
  campaign: CampaignHub;
  energy: EnergyState;
  idle: IdleRewardState;
  masteryPoints: number;
  note: HubNote | null;
  attention: AttentionState;
  /** Call after claiming the idle reward so the note/available amount recompute without a full remount. */
  refreshIdle: () => void;
}

/**
 * Live Home state. Collection / account / economy are subscribed stores, so Gems, Level, Mastery and ownership
 * update the moment they change; Campaign progress and Energy are plain localStorage reads, refreshed whenever Home
 * mounts (Home is re-mounted every time the player returns from Campaign or a battle). Idle reward is deliberately
 * NOT memoized to a single mount-time read (unlike campaign/energy above) - it's cheap to recompute, and claiming
 * it can happen without leaving Home at all, so refreshIdle() plus an unmemoized read is what makes the note
 * disappear immediately rather than waiting for the next remount.
 */
export function useHubState(): HubState {
  const owned = useCollection();
  const account = useAccount();
  const { gems, summon } = useEconomy();
  const unlimited = useUnlimitedGems();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately read once per mount
  const campaign = useMemo(() => campaignHub(loadProgress()), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const energy = useMemo(() => loadEnergy(), []);
  const [idleTick, setIdleTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idleTick is the deliberate re-trigger; loadIdleReward reads its own fresh Campaign-progress default
  const idle = useMemo(() => loadIdleReward(), [idleTick]);
  const masteryPoints = masteryPointsAvailable(account);
  const now = useMemo(() => Date.now(), []);
  return {
    campaign,
    energy,
    idle,
    masteryPoints,
    note: pickHubNote({ idle, masteryPoints, owned, history: summon.history, now }),
    attention: attentionState({ gems, unlimitedGems: unlimited, masteryPoints, owned }),
    refreshIdle: () => setIdleTick((t) => t + 1),
  };
}
