import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voiceclone.app',
  appName: 'Voice Clone',
  webDir: 'out',
  server: {
    androidScheme: 'file',
    cleartext: true,
    allowNavigation: ['*']
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
    loggingBehavior: 'debug',
    initialFocus: true,
    minWebViewVersion: 65,
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: "APK"
    },
    appendUserAgent: 'Voice Clone Android App',
    backgroundColor: '#FFFFFF',
    overrideUserAgent: ''
  },
  plugins: {
    Permissions: {
      microphone: true
    }
  },
  loggingBehavior: 'debug'
};

export default config; 