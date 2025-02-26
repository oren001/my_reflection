'use client';

import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

// Add type declaration for the console bridge
declare global {
  interface Window {
    console_log_bridge?: {
      postMessage(message: string): void;
    };
  }
}

export default function ConsoleLogBridge() {
  useEffect(() => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    // Override console.log
    console.log = function(...args) {
      originalConsoleLog.apply(console, args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return arg.toString();
          }
        }
        return arg;
      }).join(' ');
      
      if (window.console_log_bridge) {
        window.console_log_bridge.postMessage(message);
      } else {
        // Fallback for when bridge isn't available
        originalConsoleLog.call(console, '[WebView]', message);
      }
    };

    // Override console.error
    console.error = function(...args) {
      originalConsoleError.apply(console, args);
      const message = args.map(arg => {
        if (arg instanceof Error) {
          return arg.stack || arg.message;
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return arg.toString();
          }
        }
        return arg;
      }).join(' ');
      
      if (window.console_log_bridge) {
        window.console_log_bridge.postMessage('ERROR: ' + message);
      }
    };

    // Override console.warn
    console.warn = function(...args) {
      originalConsoleWarn.apply(console, args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return arg.toString();
          }
        }
        return arg;
      }).join(' ');
      
      if (window.console_log_bridge) {
        window.console_log_bridge.postMessage('WARN: ' + message);
      }
    };

    // Initialize Capacitor
    const initializeCapacitor = async () => {
      try {
        // Add Capacitor app listeners
        await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          console.log('[Capacitor] Back button pressed, canGoBack:', canGoBack);
          if (canGoBack) {
            window.history.back();
          } else {
            CapacitorApp.exitApp();
          }
        });

        await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          console.log('[Capacitor] App state changed, isActive:', isActive);
        });

        console.log('[Capacitor] Listeners initialized');
      } catch (error) {
        console.error('[Capacitor] Error initializing:', error);
      }
    };

    initializeCapacitor();

    return () => {
      // Restore original console methods
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      // Cleanup Capacitor listeners
      CapacitorApp.removeAllListeners();
    };
  }, []);

  return null;
} 