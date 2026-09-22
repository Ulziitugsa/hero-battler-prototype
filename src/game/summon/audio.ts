import type { SummonSoundEvent } from './sound';

/** Small original synthesized score. Audio is opt-in and unlocked by a user gesture. */
export class ArchiveAudio {
  private context: AudioContext | null = null;
  private enabled = false;
  async enable() {
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      this.enabled = true;
    } catch { this.enabled = false; }
    return this.enabled;
  }
  disable() { this.enabled = false; void this.context?.suspend().catch(() => {}); }
  close() { this.enabled = false; void this.context?.close().catch(() => {}); this.context = null; }
  play(event: SummonSoundEvent) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const score: Record<SummonSoundEvent, number[]> = {
      summon_start: [130.81, 196], rarity_rare: [261.63, 392], rarity_epic: [261.63, 329.63, 493.88],
      rarity_legendary: [130.81, 196, 261.63, 392], seal_break: [65.41, 130.81],
      card_reveal: [523.25, 659.25, 783.99], featured_reveal: [783.99, 1046.5],
    };
    score[event].forEach((frequency, i) => {
      const start = ctx.currentTime + i * .07;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = event === 'seal_break' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.035, start + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .8);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(start); oscillator.stop(start + .85);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
}
