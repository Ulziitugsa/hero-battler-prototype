import { useState } from 'react';
import { GamePage } from './GamePage';
import { ENEMY_DECK, PLAYER_DECK, buildBattleScene } from './battleScenes';

/**
 * Dev-only QA page (?battleScene=2, 3 or vael): the battle screen on a scripted card-combat board (battleScenes.ts), so
 * card faces, the focus panel and the battle log can be checked and screenshotted on the same board every time.
 */
export function BattleSceneLabPage({ scene, onBack }: { scene: string; onBack: () => void }) {
  const [built] = useState(() => buildBattleScene(scene));
  return <GamePage playerDeck={PLAYER_DECK} enemyDeck={ENEMY_DECK} playerDeckLabel="Kingdom" enemyDeckLabel="Undead" onExit={onBack} combatModel="card" initialState={built.state} initialEvents={built.events} />;
}
