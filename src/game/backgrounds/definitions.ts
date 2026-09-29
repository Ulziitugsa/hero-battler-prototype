import { isEventCosmeticUnlocked } from '../events/cosmetics';

/** 'event': unlocked permanently by a live-event reward (game/events). */
export type BackgroundUnlockType = 'default' | 'progression' | 'future' | 'event';

export interface BackgroundDefinition {
  id: string;
  name: string;
  asset: string;
  unlockType: BackgroundUnlockType;
  /** Number of cleared Campaign nodes required for progression unlocks. */
  clearedNodesRequired?: number;
  /** Display name of the event that awards an 'event' unlock. */
  eventName?: string;
  description: string;
  pixelArt: boolean;
}

export const DEFAULT_BACKGROUND_ID = 'moonwater-village';

export const BACKGROUNDS: readonly BackgroundDefinition[] = [
  { id: DEFAULT_BACKGROUND_ID, name: 'Moonwater Village', asset: '/art/pixel/moonwater.png', unlockType: 'default', description: 'The lakeside home beneath the crescent.', pixelArt: true },
  { id: 'emerald-canopy', name: 'Emerald Canopy', asset: '/art/backgrounds/emerald-canopy.png', unlockType: 'progression', clearedNodesRequired: 3, description: 'A sunlit trail through the old forest.', pixelArt: true },
  { id: 'sunstone-canyon', name: 'Sunstone Canyon', asset: '/art/backgrounds/sunstone-canyon.png', unlockType: 'progression', clearedNodesRequired: 7, description: 'Golden paths between ancient mesas.', pixelArt: true },
  { id: 'violet-grove', name: 'Violet Grove', asset: '/art/backgrounds/violet-grove.png', unlockType: 'event', eventName: 'The Long Vigil', description: 'A strange grove of luminous fungi.', pixelArt: true },
  { id: 'coral-garden', name: 'Coral Garden', asset: '/art/backgrounds/coral-garden.png', unlockType: 'future', description: 'A bright garden beneath the waves.', pixelArt: true },
];

export function backgroundIsUnlocked(background: BackgroundDefinition, clearedNodes: number): boolean {
  if (background.unlockType === 'default') return true;
  if (background.unlockType === 'future') return false;
  if (background.unlockType === 'event') return isEventCosmeticUnlocked(background.id);
  return clearedNodes >= (background.clearedNodesRequired ?? Number.POSITIVE_INFINITY);
}

export function getBackground(id: string): BackgroundDefinition {
  return BACKGROUNDS.find((background) => background.id === id) ?? BACKGROUNDS[0];
}
