import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.carnesandsons.organizeplus",
  appName: "Organize Plus",
  webDir: "dist",
  server: {
    // Load the live UltraOffice2.0 build so native devices always use the latest code.
    url: "https://codex-ultron.onrender.com",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    // Force WebView to always load fresh content from the server
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: true,
    // Grant WebView permission to use microphone for Twilio Voice calls
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#152744",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
