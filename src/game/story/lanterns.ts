import { ENCOUNTER_DECKS } from '../campaign/encounterDecks';
import { STARTER_DECKS } from '../cards/starterDecks';

export const LANTERN_TRIALS = [
  { id: 'the-unlit-road', name: 'The unlit road', subtitle: 'A watch with no relief', cardId: 'und-bone-soldier', deck: ENCOUNTER_DECKS.patrol, briefing: 'At sunset, the dead return to the milestones where they fell. They do not attack the village. They face the forest. Mira asks you to take one watch in their place.', tactic: 'Open lanes matter. Build a board before the patrol can return.', ending: 'The soldier lowers his blade. Under his rusted helmet is a brass tag: a name, a village, and a date from a hundred years ago. He has been guarding the road home ever since.' },
  { id: 'a-debt-of-fire', name: 'A debt of fire', subtitle: 'What the lanterns keep away', cardId: 'inf-hellhound', deck: STARTER_DECKS.infernal, briefing: 'Beyond the milestones, a furnace burns without fuel. Its hounds follow the heat of living hearts. The Kingdom called this a curse. Someone once called it a bargain.', tactic: 'Infernal death effects punish trades. Protect your health, not just your heroes.', ending: 'Inside the furnace you find the royal seal. The fire was purchased to end a winter. The price was every name the kingdom would rather forget.' },
  { id: 'the-kings-last-watch', name: 'The king’s last watch', subtitle: 'A name worth remembering', cardId: 'und-vharos', deck: ENCOUNTER_DECKS.tyrant, briefing: 'Vharos offers you his lantern. “They called me tyrant when I refused to let the dead be erased. If you can hold this road, I can finally put it down.” Prove you can carry his watch.', tactic: 'Vharos revives once. Keep a spell ready for the second exchange.', ending: 'For the first time in a century, the king sits down. Dawn catches the names stitched into his cloak. You read them aloud. One by one, the lanterns go out. Not extinguished. Home.' },
] as const;

const KEY = 'embervale:lanterns:v1';
export function loadLanternProgress(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && LANTERN_TRIALS.some(t => t.id === id)))] : [];
  } catch { return []; }
}
export function canPlayTrial(id: string, cleared: readonly string[]): boolean {
  const index = LANTERN_TRIALS.findIndex(t => t.id === id);
  return index >= 0 && (index === 0 || cleared.includes(LANTERN_TRIALS[index - 1].id));
}
export function completeLanternTrial(id: string): boolean {
  const cleared = loadLanternProgress();
  if (!canPlayTrial(id, cleared)) return false;
  try { localStorage.setItem(KEY, JSON.stringify([...new Set([...cleared, id])])); return true; }
  catch { return false; }
}
/** Dev/playtest only. See game/devReset.ts's resetEverything (Commercial Prototype Phase 11). */
export function resetLanternProgress(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
