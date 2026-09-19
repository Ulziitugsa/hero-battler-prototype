import type { CampaignNodeDef } from '../../game/campaign/types';
import { Icon, type IconName } from '../../components/Icon';
import { RewardCard } from './RewardCard';

const REWARD_ICON: Record<string, IconName> = { card: 'cards', ember: 'ember', emblem: 'hero', star: 'trophy' };

/** A reward node has no battle - a chest/cairn to claim. The chapter's final reward node doubles as
 * the Chapter Complete trigger (see CampaignPage, which checks node.completesChapter). */
export function RewardClaimSheet({ node, onClaim }: { node: CampaignNodeDef; onClaim: () => void }) {
  const reward = node.reward;
  if (!reward) return null;
  return (
    <div className="overlay-backdrop campaign-sheet-backdrop" onClick={onClaim}>
      <div className="campaign-reward-sheet" onClick={(e) => e.stopPropagation()}>
        {reward.cardId ? (
          <RewardCard cardId={reward.cardId} grant={null} copies={reward.count ?? 1} />
        ) : (
          <div className="campaign-reward-disc">
            <Icon name={REWARD_ICON[reward.icon]} size={30} />
          </div>
        )}
        <span className="campaign-reward-kicker">{node.name}</span>
        {!reward.cardId && <span className="campaign-reward-title">{reward.label}</span>}
        <span className="campaign-reward-sub">{reward.sub}</span>
        <button type="button" className="campaign-reward-claim" onClick={onClaim}>
          Claim
        </button>
      </div>
    </div>
  );
}
