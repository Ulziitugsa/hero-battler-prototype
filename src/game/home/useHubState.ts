import { useMemo } from 'react';
import { loadProgress } from '../campaign/progress';
import { loadEnergy, type EnergyState } from '../campaign/energy';
import { useCollection } from '../collection/useCollection';
import { useEconomy, useUnlimitedGems } from '../economy/useEconomy';
import { masteryPointsAvailable } from '../progression/account';
import { useAccount } from '../progression/useAccount';
import { attentionState, campaignHub, pickHubNote, type AttentionState, type CampaignHub, type HubNote } from './hubState';

export interface HubState {
  campaign: CampaignHub;
  energy: EnergyState;
  masteryPoints: number;
  note: HubNote | null;
  attention: AttentionState;
}

/**
 * Live Home state. Collection / account / economy are subscribed stores, so Gems, Level, Mastery and ownership
 * update the moment they change; Campaign progress and Energy are plain localStorage reads, refreshed whenever Home
 * mounts (Home is re-mounted every time the player returns from Campaign or a battle).
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
  const masteryPoints = masteryPointsAvailable(account);
  const now = useMemo(() => Date.now(), []);
  return {
    campaign,
    energy,
    masteryPoints,
    note: pickHubNote({ masteryPoints, owned, history: summon.history, now }),
    attention: attentionState({ gems, unlimitedGems: unlimited, masteryPoints, owned }),
  };
}
