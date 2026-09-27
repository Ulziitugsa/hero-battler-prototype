import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';

export const APP_RESUMED_EVENT = 'moonwater:app-resumed';

/** Install once near the app root; normalizes Capacitor and browser foreground events. */
export function installLifecycleBridge(): () => void {
  let previousActive = true;
  const onVisibility = () => {
    const active = document.visibilityState === 'visible';
    if (active && !previousActive) window.dispatchEvent(new Event(APP_RESUMED_EVENT));
    previousActive = active;
  };
  document.addEventListener('visibilitychange', onVisibility);
  const nativeListener = Capacitor.isNativePlatform()
    ? App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !previousActive) window.dispatchEvent(new Event(APP_RESUMED_EVENT));
        previousActive = isActive;
      })
    : null;
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    void nativeListener?.then((listener) => listener.remove());
  };
}

export function useAppResume(callback: () => void): void {
  useEffect(() => {
    window.addEventListener(APP_RESUMED_EVENT, callback);
    return () => window.removeEventListener(APP_RESUMED_EVENT, callback);
  }, [callback]);
}
