import { ImpactStyle, Haptics } from '@capacitor/haptics';
import { device } from './device';

async function impact(style: ImpactStyle): Promise<void> {
  if (!device.isNative()) return;
  try { await Haptics.impact({ style }); } catch { /* Haptics are optional on unsupported hardware. */ }
}

export const haptics = {
  light: () => impact(ImpactStyle.Light),
  levelUp: () => impact(ImpactStyle.Medium),
  starGain: () => impact(ImpactStyle.Light),
  campaignVictory: () => impact(ImpactStyle.Medium),
  chapterComplete: () => impact(ImpactStyle.Heavy),
  ascension: () => impact(ImpactStyle.Heavy),
  legendary: () => impact(ImpactStyle.Heavy),
};
