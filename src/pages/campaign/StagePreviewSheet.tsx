import type { CampaignNodeDef } from '../../game/campaign/types';
import { canAffordEnergy, formatCountdown, loadEnergy } from '../../game/campaign/energy';
import { getActiveDeck } from '../../game/engine/activeDeck';
import { getOwnedCount } from '../../game/collection/collection';
import { Icon, type IconName } from '../../components/Icon';
import { useAscension } from '../../game/ascension/useAscension';
import { DIFFICULTY_LABEL } from '../../game/campaign/progress';
import { campaignBattleHp } from '../../game/campaign/battleSetup';

const TYPE_LABEL: Record<string, string> = { battle: 'Battle', elite: 'Elite', boss: 'Boss', challenge: 'Challenge' };
const TYPE_ICON: Record<string, IconName> = { battle: 'battle', elite: 'power', boss: 'graveyard', challenge: 'warning' };
const REWARD_ICON: Record<string, IconName> = { card: 'cards', ember: 'ember', emblem: 'hero', star: 'trophy' };

/** One carved sheet for standard/elite/boss/challenge nodes - type, name, opponent, threat, objective
 * seals, first-clear vs. repeat reward, the player's active deck, cost and Fight (Campaign Screen.dc.html). */
export function StagePreviewSheet({ node, cleared, onFight, onClose }: { node: CampaignNodeDef; cleared: boolean; onFight: () => void; onClose: () => void }) {
  const ascensionState = useAscension();

  const encounter = node.encounter;
  if (!encounter) return null;

  const activeDeck = getActiveDeck();
  // Both Starting HPs exactly as the battle will start them (the same helper the battle calls): the player's deck at
  // their Card Mastery, the encounter's deck or boss pool, and any challenge rule.
  const hp = campaignBattleHp(node, activeDeck.cardIds, ascensionState);

  const energy = loadEnergy();
  const affordable = canAffordEnergy(encounter.energyCost);

  return (
    <div className="overlay-backdrop campaign-sheet-backdrop" onClick={onClose}>
      <div className="campaign-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="campaign-sheet-header">
          <div className="campaign-sheet-type">
            <span className={`campaign-sheet-type-chip ${node.type}`}>
              <Icon name={TYPE_ICON[node.type] ?? 'battle'} size={13} />
            </span>
            <span className="campaign-sheet-type-label">{TYPE_LABEL[node.type] ?? 'Battle'}</span>
            <span className="campaign-sheet-node-meta">{node.teach}</span>
          </div>
          {cleared && (
            <span className="campaign-sheet-cleared-stamp">
              <Icon name="check" size={18} />
              <span>Cleared</span>
            </span>
          )}
        </div>
        <span className="campaign-sheet-name">{node.name}</span>

        <div className="campaign-sheet-rule" />

        <div className="campaign-sheet-foe">
          <div className={`campaign-sheet-foe-portrait ${encounter.foeFaction}`} />
          <div className="campaign-sheet-foe-text">
            <span className="campaign-sheet-foe-name">{encounter.foeName}</span>
            <div className="campaign-sheet-foe-meta">
              <span className={`campaign-sigil xs ${encounter.foeFaction}`} />
              <span>{node.teach}</span>
            </div>
          </div>
          <div className="campaign-sheet-threat">
            <span>{DIFFICULTY_LABEL[encounter.difficulty]}</span>
            <div className="campaign-sheet-threat-pips">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`campaign-sheet-threat-pip ${i < encounter.threat ? 'lit' : ''}`} />
              ))}
            </div>
          </div>
        </div>

        {encounter.modifier && (
          <div className="campaign-sheet-modifier">
            <div className="campaign-sheet-modifier-title">
              <Icon name="spell" size={13} />
              <span>{encounter.modifier.title}</span>
            </div>
            <span>{encounter.modifier.text}</span>
          </div>
        )}

        <div className="campaign-sheet-objectives">
          <div className="campaign-sheet-req">
            <span className="campaign-sheet-req-badge">
              <Icon name="battle" size={11} />
            </span>
            <span>Win the battle</span>
          </div>
          {encounter.objectives.length > 0 && (
            <>
              <div className="campaign-sheet-mastery-label">
                <span>Bonus seals · optional</span>
                <span className="campaign-sheet-mastery-rule" />
              </div>
              {encounter.objectives.map((o) => (
                <div className="campaign-sheet-obj" key={o.id}>
                  <span className="campaign-sheet-obj-seal">
                    <Icon name="check" size={10} />
                  </span>
                  <span>{o.text}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="campaign-sheet-rewards">
          <div className="campaign-sheet-reward-card">
            <span className="campaign-sheet-reward-tag">First clear</span>
            <div className="campaign-sheet-reward-row">
              <span className="campaign-sheet-reward-icon primary">
                <Icon name={REWARD_ICON[encounter.firstClearReward.icon]} size={14} />
              </span>
              <span>{encounter.firstClearReward.label}</span>
              {encounter.firstClearReward.cardId && !cleared && <span className="campaign-sheet-reward-note">{getOwnedCount(encounter.firstClearReward.cardId) > 0 ? `Owned ×${getOwnedCount(encounter.firstClearReward.cardId)}` : 'New'}</span>}
            </div>
          </div>
          <div className="campaign-sheet-reward-card">
            <span className="campaign-sheet-reward-tag">Repeat</span>
            <div className="campaign-sheet-reward-row">
              <span className="campaign-sheet-reward-icon">
                <Icon name={REWARD_ICON[encounter.repeatReward.icon]} size={14} />
              </span>
              <span>{encounter.repeatReward.label}</span>
            </div>
          </div>
        </div>

        <div className="campaign-sheet-deck-rail">
          <div className="campaign-sheet-deck-fan" data-faction={activeDeck.faction} />
          <div className="campaign-sheet-deck-text">
            <span>{activeDeck.label}</span>
            <span>{activeDeck.cardIds.length} / 15 · your active deck</span>
          </div>
        </div>

        {hp && (
          <div className="campaign-sheet-power-row ready">
            <Icon name="hp" size={13} />
            <span className="campaign-sheet-power-label">Starting HP</span>
            <span className="campaign-sheet-power-value">
              You {hp.player.toLocaleString()} <em>· {encounter.foeName} {hp.enemy.toLocaleString()}</em>
            </span>
          </div>
        )}

        <div className="campaign-sheet-action-row">
          <div className="campaign-sheet-cost">
            <div className={`campaign-sheet-cost-plate ${affordable ? '' : 'blocked'}`}>
              <Icon name="ember" size={16} />
              <span>{encounter.energyCost}</span>
            </div>
            <span className="campaign-sheet-cost-sub">{affordable ? 'Energy' : `you have ${energy.current}`}</span>
          </div>
          {affordable ? (
            <button type="button" className="campaign-sheet-fight" onClick={onFight}>
              <Icon name={cleared ? 'continuousSpell' : 'battle'} size={18} />
              <span>{cleared ? 'Replay' : 'Fight'}</span>
            </button>
          ) : (
            <div className="campaign-sheet-blocked-text">
              <span>Needs {encounter.energyCost} Energy · you have {energy.current}</span>
              <span>{energy.msUntilNextTick > 0 ? `Enough in ${formatCountdown(energy.msUntilNextTick)}` : 'Regenerating...'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
