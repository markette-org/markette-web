import { Injectable, signal } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { isNative } from './platform';

/**
 * Opening URLs outside the app.
 * - `open()`: links meant for a new tab (network posts, docs, profiles).
 * - `go()`: flows that leave the app and come back (OAuth, Stripe). On the web the page navigates;
 *   in the native app the system browser opens and `awaitingReturn` is set so the app can refresh
 *   when it becomes active again.
 */
@Injectable({ providedIn: 'root' })
export class ExternalService {
  readonly native = isNative();
  /** What to refresh when the user comes back from the browser (native only). */
  readonly awaitingReturn = signal<'oauth' | 'billing' | null>(null);

  async open(url: string) {
    if (!url) return;
    if (this.native) await Browser.open({ url });
    else window.open(url, '_blank', 'noopener');
  }

  async go(url: string, reason: 'oauth' | 'billing' = 'oauth') {
    if (!url) return;
    if (this.native) {
      this.awaitingReturn.set(reason);
      await Browser.open({ url });
    } else {
      window.location.href = url;
    }
  }
}
