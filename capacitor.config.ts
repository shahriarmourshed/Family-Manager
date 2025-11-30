
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.family.manager',
  appName: 'Family Manager',
  webDir: 'out',
  bundledWebRuntime: false,
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  server: {
    url: 'http://YOUR_LIVE_APP_URL.com', // <-- IMPORTANT: Replace with your deployed URL
    cleartext: true,
  },
};

export default config;
