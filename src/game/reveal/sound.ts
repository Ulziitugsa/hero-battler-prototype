// Audio-ready event hooks for the Summon presentation. No audio ships - nothing here plays a sound - but
// the sequence controller emits these at the right beats, so a future audio layer only has to subscribe.

export type RevealSoundEvent = 'reveal_start' | 'rarity_rare' | 'rarity_epic' | 'rarity_legendary' | 'seal_break' | 'card_reveal' | 'featured_reveal';

type Listener = (event: RevealSoundEvent) => void;
const listeners = new Set<Listener>();

export function onRevealSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRevealSound(event: RevealSoundEvent): void {
  for (const l of [...listeners]) l(event);
}
