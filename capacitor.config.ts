import type { CapacitorConfig } from '@capacitor/cli';

const devUrl = process.env.CAPACITOR_DEV_URL;

const config: CapacitorConfig = {
  appId: 'com.woventex.productionportal',
  appName: 'ProductionPortal',
  webDir: 'dist',
  server: devUrl
    ? {
        url: devUrl,
        cleartext: true,
        androidScheme: 'https',
      }
    : {
        androidScheme: 'https',
        cleartext: false,
      },

  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'productionportal',
    limitsNavigationsToAppBoundDomains: true,
    scrollEnabled: true,
    allowsLinkPreview: true,
    backgroundColor: '#f1f3f5',
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1B2A4A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f1f3f5',
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
