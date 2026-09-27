import { Capacitor } from '@capacitor/core';

export const device = {
  isNative: (): boolean => Capacitor.isNativePlatform(),
  platform: (): string => Capacitor.getPlatform(),
};
