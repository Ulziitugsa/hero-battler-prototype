import { useState } from 'react';
import { BOX_ART } from '../game/box/boxArt';
import { getArchetypeBox, type ArchetypeBoxId } from '../game/box/archetypeBoxes';
import { CardArtwork } from './CardArtwork';

/** The title beside the image supplies its accessible name; keep the flagship as an error fallback. */
export function BoxArtwork({ boxId, priority = false }: { boxId: ArchetypeBoxId; priority?: boolean }) {
  const src = BOX_ART[boxId];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <CardArtwork cardId={getArchetypeBox(boxId).flagshipId} animated={false} />;
  return <img className="box-key-art" src={src} width={480} height={320} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSrc(src)} />;
}
