import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ppconstruye.app',
  appName: 'P&P CONSTRUYE',
  webDir: 'public',
  server: {
    url: 'https://construct-pp.vercel.app',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
