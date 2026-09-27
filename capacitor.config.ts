import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moonwater.game',
  appName: 'Moonwater',
  webDir: 'dist',
  backgroundColor: '#081723',
  ios: { contentInset: 'automatic' },
  android: { backgroundColor: '#081723' },
};

export default config;
