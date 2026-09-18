import { getCurrentNodeId, findNode, loadProgress, isChapterComplete } from '../game/campaign/progress';
import { Icon } from './Icon';

/** Home's Fight seal (Home Screen v3) now raises this instead of going straight to Battle Setup -
 * Campaign, carrying the next stage and its Energy cost, over Quick Battle at half the weight
 * (Campaign Screen.dc.html's "Home integration" screen). */
export function FightChoiceSheet({ onOpenCampaign, onOpenQuickBattle, onClose }: { onOpenCampaign: () => void; onOpenQuickBattle: () => void; onClose: () => void }) {
  const progress = loadProgress();
  const chapterDone = isChapterComplete(progress);
  const currentNodeId = getCurrentNodeId(progress);
  const currentNode = currentNodeId ? findNode(currentNodeId) : null;
  const cost = currentNode?.encounter?.energyCost;

  return (
    <div className="overlay-backdrop fight-choice-backdrop" onClick={onClose}>
      <div className="fight-choice-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="fight-choice-title">Where to?</span>

        <button type="button" className="fight-choice-plate campaign" onClick={onOpenCampaign}>
          <span className="fight-choice-icon">
            <Icon name="heroes" size={20} />
          </span>
          <span className="fight-choice-text">
            <span className="fight-choice-name">Campaign</span>
            <span className="fight-choice-meta">The Ashen Road · Chapter 1</span>
            <span className="fight-choice-sub">{chapterDone ? 'Chapter complete - replay any stage' : currentNode ? `Next: ${currentNode.name}` : 'Begin'}</span>
          </span>
          {cost !== undefined && (
            <span className="fight-choice-cost">
              <Icon name="power" size={13} />
              <span>{cost}</span>
            </span>
          )}
          <Icon name="back" size={13} className="fight-choice-chevron" />
        </button>

        <button type="button" className="fight-choice-plate quick" onClick={onOpenQuickBattle}>
          <span className="fight-choice-icon">
            <Icon name="battle" size={18} />
          </span>
          <span className="fight-choice-text">
            <span className="fight-choice-name">Quick battle</span>
            <span className="fight-choice-sub">Practice against the AI · costs no Energy</span>
          </span>
          <Icon name="back" size={13} className="fight-choice-chevron" />
        </button>

        <span className="fight-choice-hint">Tap anywhere to close</span>
      </div>
    </div>
  );
}
