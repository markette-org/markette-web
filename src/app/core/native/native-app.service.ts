import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { CapacitorShareTarget } from '@capgo/capacitor-share-target';
import { AuthService } from '../auth.service';
import { CatalogService } from '../catalog.service';
import { ToastService } from '../toast.service';
import { ExternalService } from './external.service';
import { isNative } from './platform';
import { ShareIntakeService } from './share-intake.service';

/** Routes where the Android back button leaves the app instead of navigating back. */
const ROOTS = ['/', '/login', '/server'];

/**
 * Native (Capacitor) glue: status bar, splash, Android back button, share intake,
 * returning from the system browser, and external links. A no-op in browsers.
 */
@Injectable({ providedIn: 'root' })
export class NativeAppService {
  private router = inject(Router);
  private share = inject(ShareIntakeService);
  private external = inject(ExternalService);
  private catalog = inject(CatalogService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private started = false;

  init() {
    if (!isNative() || this.started) return;
    this.started = true;
    document.documentElement.classList.add('native');

    // Share sheet: the plugin keeps events until a listener exists, so cold starts work too.
    void CapacitorShareTarget.addListener('shareReceived', (event) => this.share.receive(event)).catch(() => undefined);

    void App.addListener('backButton', ({ canGoBack }) => this.onBack(canGoBack));
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) this.onResume();
    });

    this.syncStatusBar();
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.syncStatusBar());

    // External links (target=_blank or other origins) go to the system browser.
    document.addEventListener('click', (e) => this.interceptLink(e), true);
  }

  /** Called once the first screen has rendered. */
  hideSplash() {
    if (isNative()) void SplashScreen.hide().catch(() => undefined);
  }

  private syncStatusBar() {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    // Style.Dark = light text for dark backgrounds.
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  }

  private onBack(canGoBack: boolean) {
    // 1. An open dialog (modals use <dialog>): close it.
    const dialogs = Array.from(document.querySelectorAll('dialog[open]')) as HTMLDialogElement[];
    const top = dialogs[dialogs.length - 1];
    if (top) {
      const cancel = new Event('cancel', { cancelable: true });
      if (top.dispatchEvent(cancel)) top.close();
      return;
    }
    // 2. A drawer, menu or mobile sidebar: they all close on Escape.
    if (document.querySelector('.drawer, .menu, .shell.open')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    // 3. History, unless we are at a root screen.
    const path = this.router.url.split(/[?#]/)[0] || '/';
    if (canGoBack && !ROOTS.includes(path)) {
      history.back();
      return;
    }
    void App.exitApp();
  }

  private onResume() {
    const reason = this.external.awaitingReturn();
    if (!reason || !this.auth.isLoggedIn()) return;
    this.external.awaitingReturn.set(null);
    if (reason === 'oauth') {
      this.catalog.loadChannels(true).subscribe({
        next: () => this.toast.info('Channels refreshed', 'If you finished connecting in the browser, the account now appears here.'),
        error: () => undefined,
      });
    } else {
      // Billing: re-render the current page so plan data reloads.
      const url = this.router.url;
      void this.router.navigateByUrl('/switching', { skipLocationChange: true }).then(() => this.router.navigateByUrl(url));
    }
  }

  private interceptLink(e: MouseEvent) {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    let external = a.target === '_blank';
    try {
      external ||= new URL(href).origin !== location.origin;
    } catch {
      return;
    }
    if (!external) return;
    e.preventDefault();
    e.stopPropagation();
    void this.external.open(href);
  }
}
