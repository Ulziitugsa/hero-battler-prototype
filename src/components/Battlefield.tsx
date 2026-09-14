import type { HeroInstance, LaneId, PlayerState, SpellZoneInstance } from '../game/types';
import { LANES } from '../game/types';
import { LaneSlot } from './LaneSlot';
import { SpellLaneSlot } from './SpellLaneSlot';
import { FightSeal } from './FightSeal';
import type { ChitFx } from './BoardChit';

const LANE_TICKS = ['18.98%', '44.55%', '56.20%', '81.58%'];

/**
 * The three-lane battlefield (Battle Screen v8): one continuous carved channel per lane, running
 * Enemy Spell -> Enemy Hero -> (clash) -> Player Hero -> Player Spell, with the Fight seal set into
 * the clash line at the centre lane. Lane order deliberately puts Hero zones adjacent to the clash -
 * the two front lines face each other - and Spell zones on the outer edge, in the backline.
 */
export function Battlefield({
  enemyState,
  playerState,
  targetableHeroLanes,
  targetableSpellLanes,
  hasSelection,
  fxByInstanceId,
  onHeroSlotClick,
  onHeroChitClick,
  onSpellSlotClick,
  onSpellChitClick,
  onEnemyHeroChitClick,
  onEnemySpellChitClick,
  canFight,
  fighting,
  onFight,
}: {
  enemyState: PlayerState;
  playerState: PlayerState;
  targetableHeroLanes: Set<LaneId>;
  targetableSpellLanes: Set<LaneId>;
  hasSelection: boolean;
  fxByInstanceId: Map<string, ChitFx>;
  onHeroSlotClick: (lane: LaneId) => void;
  onHeroChitClick: (hero: HeroInstance) => void;
  onSpellSlotClick: (lane: LaneId) => void;
  onSpellChitClick: (spell: SpellZoneInstance) => void;
  onEnemyHeroChitClick: (hero: HeroInstance) => void;
  onEnemySpellChitClick: (spell: SpellZoneInstance) => void;
  canFight: boolean;
  fighting: boolean;
  onFight: () => void;
}) {
  return (
    <div className="battlefield">
      {LANES.map((lane) => {
        const eHero = enemyState.heroZones[lane];
        const eSpell = enemyState.spellZones[lane];
        const pHero = playerState.heroZones[lane];
        const pSpell = playerState.spellZones[lane];
        const pHeroTargetable = targetableHeroLanes.has(lane);
        const pSpellTargetable = targetableSpellLanes.has(lane);
        return (
          <div className={`battle-lane lane-${lane}`} key={lane}>
            <div className="lane-rails">
              <span className="lane-rail-edge left" />
              <span className="lane-rail-edge right" />
              <span className={`lane-channel-fill ${pHeroTargetable || pSpellTargetable ? 'active' : ''}`} />
              <span className="lane-edge-glow top" />
              <span className="lane-edge-glow bottom" />
              <span className="lane-vignette top" />
              <span className="lane-vignette bottom" />
              <span className="lane-groove" />
              <span className={`lane-groove-hot ${pHeroTargetable || pSpellTargetable ? 'active' : ''}`} />
              {LANE_TICKS.map((top) => (
                <span key={top} className="lane-tick" style={{ top }} />
              ))}
              <span className={`lane-pool ${pHeroTargetable || pSpellTargetable ? 'active' : ''}`} />
            </div>

            {lane !== 'center' && <span className={`lane-pip ${pHeroTargetable || pSpellTargetable ? 'active' : ''}`} />}

            <div className="battle-zone-slot zone-eSpell">
              <SpellLaneSlot lane={lane} side="enemy" targetable={false} spell={eSpell} onChitClick={onEnemySpellChitClick} />
            </div>
            <div className="battle-zone-slot zone-eHero">
              <LaneSlot lane={lane} side="enemy" hero={eHero} targetable={false} fx={eHero ? fxByInstanceId.get(eHero.instanceId) : null} onChitClick={onEnemyHeroChitClick} />
            </div>
            <div className="battle-zone-slot zone-pHero">
              <LaneSlot
                lane={lane}
                side="player"
                hero={pHero}
                targetable={pHeroTargetable}
                hasSelection={hasSelection}
                fx={pHero ? fxByInstanceId.get(pHero.instanceId) : null}
                onSlotClick={() => onHeroSlotClick(lane)}
                onChitClick={onHeroChitClick}
              />
            </div>
            <div className="battle-zone-slot zone-pSpell">
              <SpellLaneSlot
                lane={lane}
                side="player"
                spell={pSpell}
                targetable={pSpellTargetable}
                hasSelection={hasSelection}
                onSlotClick={() => onSpellSlotClick(lane)}
                onChitClick={onSpellChitClick}
              />
            </div>
          </div>
        );
      })}

      <div className="clash-line">
        <span className="clash-line-bar" />
      </div>

      <FightSeal canFight={canFight} fighting={fighting} onFight={onFight} />
    </div>
  );
}
