import { StatusBar, Style } from '@capacitor/status-bar';
import { device } from './device';

export async function configureStatusBar(): Promise<void> {
  if (!device.isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark }); // Dark = light icons, for the dark backing strip.
    await StatusBar.setBackgroundColor({ color: '#100e14' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch { /* Native status bar configuration is best effort. */ }
}
