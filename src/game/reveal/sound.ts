// Sound events for the pack-opening ceremony. The sequence controller emits them at the right beats; the Box screen's
// opt-in Sound toggle subscribes the small synthesized score in audio.ts (off by default, unlocked by a tap).

export type RevealSoundEvent = 'reveal_start' | 'rarity_rare' | 'rarity_epic' | 'rarity_legendary' | 'seal_break' | 'card_reveal' | 'headline_reveal';

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
