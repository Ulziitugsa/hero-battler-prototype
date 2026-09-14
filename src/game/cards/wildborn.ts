import type { CardDefinition } from '../types';

// Wild - beasts and nature spirits. Growth, big Power, lane movement.

export const WILDBORN_CARDS: CardDefinition[] = [
  {
    id: 'wld-forest-wolf',
    name: 'Forest Wolf',
    shortName: 'Forest Wolf',
    faction: 'wildborn',
    type: 'hero',
    role: 'Beast',
    rarity: 'common',
    cost: 1,
    power: 5,
    tags: ['Beast'],
    boardText: '+2 if lane empty',
    abilities: [
      {
        trigger: 'ON_PLAY',
        conditions: [{ type: 'LANE_EMPTY_ENEMY_SIDE' }],
        actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'PERMANENT', target: 'SELF' }],
        text: 'If the opposing lane is empty when played, gain +2 Power.',
      },
    ],
  },
  {
    id: 'wld-ancient-treant',
    name: 'Ancient Treant',
    shortName: 'Anc. Treant',
    faction: 'wildborn',
    type: 'hero',
    role: 'Beast',
    rarity: 'epic',
    cost: 3,
    power: 4,
    tags: ['Beast', 'Nature'],
    boardText: 'Round End: +1 Power',
    abilities: [
      {
        trigger: 'ROUND_END',
        actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'SELF' }],
        text: 'End of Round: Gain +1 Power.',
      },
    ],
  },
  {
    id: 'wld-titanroot',
    name: 'Titanroot',
    shortName: 'Titanroot',
    faction: 'wildborn',
    type: 'hero',
    role: 'Beast',
    rarity: 'legendary',
    cost: 4,
    power: 8,
    tags: ['Beast', 'Nature'],
    boardText: 'Round End: +2 Power',
    abilities: [
      {
        trigger: 'ROUND_END',
        actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'PERMANENT', target: 'SELF' }],
        text: 'End of Round: Gain +2 Power.',
      },
    ],
  },
];
