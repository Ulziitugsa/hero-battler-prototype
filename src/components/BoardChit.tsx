import type { HeroInstance, Side } from '../game/types';
import { CardArtwork } from './CardArtwork';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { RARITY_GEMS } from './cardVisuals';
import type { ChitVisual } from './animation/chitEffects';
import { Icon } from './Icon';
import { useBattleCardDisplay } from './combatDisplay';
import { GameCard } from './card/GameCard';
import '../styles/ascension.css';

/** A Unit on the board: the shared card face (GameCard, board density) with its current ATK, every effect in its board
 * wording, and its live state (Shield, Silence, this round's ATK change, which conditional effects are on), tinted gold
 * for the player's own Units and ember for the enemy's. The same face in every battle mode: `display.rules` picks card
 * combat's rules or a legacy battle's (BattleCardDisplay). `anim`, when present, is this round's currently-playing
 * animation beat for this specific Unit (see `components/animation`, built from the engine's own event log).
 * The experimental per-unit-HP resolver (Combat V2, development builds only) keeps its own chit below. */
export function BoardChit({ hero, side, anim, disabled, focused, onClick }: { hero: HeroInstance; side: Side; anim?: ChitVisual | null; disabled?: boolean; /** The card the focus panel shows. */ focused?: boolean; onClick: () => void }) {
  const card = getCard(hero.cardId);
  const mine = side === 'player';
  const gemCount = RARITY_GEMS[card.rarity];
  const artUrl = cardArtUrl(hero.cardId);
  const v2 = hero.maxHp !== undefined;
  const display = useBattleCardDisplay();

  if (!v2) {
    const rules = display?.rules ?? 'card';
    const atk = display ? display.unitAtk(hero) : hero.power;
    return (
      <button
        type="button"
        className={`zone-card hero-zone-card card-face ${mine ? 'mine' : 'theirs'} ${hero.shielded ? 'chit-shield-active' : ''} ${hero.silenced ? 'chit-silenced-persistent' : ''} ${focused ? 'is-focused' : ''} ${anim?.className ?? ''}`}
        aria-pressed={focused}
        onClick={onClick}
        disabled={disabled}
        aria-label={`${card.name}, ${atk} ATK. Tap for details.`}
      >
        <GameCard
          cardId={hero.cardId}
          density="board"
          rules={rules}
          masteryRank={display?.masteryRank(hero.cardId, side, hero) ?? 0}
          name={hero.shortName}
          atk={atk}
          tempAtk={display ? display.tempAtk(hero) : hero.tempPower}
          silenced={hero.silenced}
          shielded={hero.shielded}
          passiveState={display?.passiveStates(hero.instanceId)}
        />
        {hero.shielded && <span className="chit-shield-ring" aria-hidden="true" />}
        {anim?.floaters.map((f) => (
          <span key={f.key} className={`floater floater-${f.kind}`}>
            {f.text}
          </span>
        ))}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`zone-card hero-zone-card ${mine ? 'mine' : 'theirs'} ${hero.shielded ? 'chit-shield-active' : ''} ${hero.silenced ? 'chit-silenced-persistent' : ''} ${anim?.className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${card.name}, ATK ${hero.power}, HP ${hero.hp ?? hero.maxHp} of ${hero.maxHp}. Tap to inspect.`}
    >
      <span className={`zone-card-art ${hero.faction}`}>
        {artUrl ? (
          <CardArtwork cardId={hero.cardId} className="zone-card-art-image" />
        ) : (
          <>
            <span className="zone-card-figure-head" />
            <span className="zone-card-figure-body" />
          </>
        )}
      </span>
      <span className="zone-card-gems">
        {Array.from({ length: gemCount }, (_, i) => (
          <span key={i} className="gem" />
        ))}
      </span>
      {hero.ascension ? <span className="zone-card-asc" title="Ascended">{['', 'I', 'II', 'III'][hero.ascension]}</span> : null}
      {/* Experimental per-unit-HP combat keeps its own readout. */}
      <span className="zone-card-power v2">ATK {hero.power}</span>
      {hero.maxHp !== undefined && <span className="zone-card-vitality" aria-label={`HP ${hero.hp ?? hero.maxHp} / ${hero.maxHp}`}><span className="zone-card-vitality-fill" style={{ width: `${Math.max(0, Math.min(100, ((hero.hp ?? hero.maxHp) / hero.maxHp) * 100))}%` }} /><small>{hero.hp ?? hero.maxHp}/{hero.maxHp} HP{(hero.combatShield ?? 0) > 0 ? ` · SH ${hero.combatShield}` : ''}</small></span>}
      {hero.tempPower !== 0 && (
        <span className="zone-card-buff">
          {hero.tempPower > 0 ? '+' : '\u2212'}
          {Math.abs(hero.tempPower)}
        </span>
      )}
      <span className="zone-card-name bare">{hero.shortName}</span>
      {hero.shielded && <span className="chit-shield-ring" aria-hidden="true" />}
      {hero.silenced && (
        <span className="chit-silence-icon" aria-hidden="true">
          <Icon name="mute" size={11} />
        </span>
      )}
      {anim?.floaters.map((f) => (
        <span key={f.key} className={`floater floater-${f.kind}`}>
          {f.text}
        </span>
      ))}
    </button>
  );
}
