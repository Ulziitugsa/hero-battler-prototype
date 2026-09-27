import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Register Moonwater navigation for Android system Back. */
export function registerBackButton(onBack: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let active = true;
  const listener = App.addListener('backButton', () => { if (active) onBack(); });
  return () => { active = false; void listener.then((handle) => handle.remove()); };
}
