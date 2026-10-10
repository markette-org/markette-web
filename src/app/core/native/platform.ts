import { Capacitor } from '@capacitor/core';

/** True inside the Android/iOS app (Capacitor), false in a browser. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): 'android' | 'ios' | 'web' {
  try {
    return Capacitor.getPlatform() as 'android' | 'ios' | 'web';
  } catch {
    return 'web';
  }
}
