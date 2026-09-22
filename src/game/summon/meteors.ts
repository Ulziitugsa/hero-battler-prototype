import type { Rarity } from '../types';

export type Meteor = { index: number; rarity: Rarity; x: number; y: number; delay: number; depth: number; bend: number };
// Irregular staging preserves individual identities without forming rows or columns.
const POSITIONS = [[.22,.39],[.64,.28],[.39,.67],[.78,.58],[.5,.46],[.16,.72],[.83,.34],[.6,.77],[.33,.2],[.72,.84]];
export function buildMeteors(pulls: readonly { rarity: Rarity }[]): Meteor[] {
  return pulls.map((pull, index) => {
    const [x,y] = pulls.length === 1 ? [.49,.48] : POSITIONS[index % POSITIONS.length];
    return { index, rarity: pull.rarity, x, y, delay: pulls.length === 1 ? 0 : ((index * 7) % 10) * .035, depth: .65 + ((index * 3) % 7) * .11, bend: (index % 2 ? 1 : -1) * (.08 + (index % 3) * .025) };
  });
}
export function meteorPoint(m: Meteor, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const startX = m.x + .82;
  const startY = m.y - (.28 + (m.index % 4) * .035);
  const controlX = (startX + m.x) / 2;
  const controlY = (startY + m.y) / 2 + m.bend * .12;
  return { x: (1-p)**2*startX + 2*(1-p)*p*controlX + p*p*m.x, y: (1-p)**2*startY + 2*(1-p)*p*controlY + p*p*m.y };
}
