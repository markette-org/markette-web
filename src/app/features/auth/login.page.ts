import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ServerConfigService } from '../../core/server-config.service';
import { SsoDiscovery } from '../../core/models';
import { PlatformInfoService } from '../../core/platform-info.service';
import { formatError } from '../../core/errors';
import { WorkspaceService } from '../../core/workspace.service';
import { AuthArtComponent } from './auth-art.component';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, AuthArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <div class="form-side">
      <form class="form-box" (ngSubmit)="submit()" novalidate>
        <div class="brand">
          <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)" /><path d="M16 46V20l16 15 16-15v26" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" /><circle cx="48" cy="46" r="5" fill="var(--coral)" /></svg>
          {{ platform.instanceName() }}
        </div>
        <div>
          <h1>Welcome back</h1>
          <p class="lead">Sign in to plan, publish and measure.</p>
        </div>
        @if (server.native) {
          <div class="server-line small">
            <span class="muted">Server</span>
            <span class="mono truncate">{{ server.server() }}</span>
            <a routerLink="/server" class="link-btn small">Change server</a>
          </div>
        }
        @if (tokenMode()) {
          <div class="field">
            <label for="api-token">API token</label>
            <input id="api-token" name="apiToken" type="password" class="input mono" [(ngModel)]="apiToken" placeholder="mkt_…" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus />
            <span class="hint">Create one on the web in Settings → API &amp; MCP. It signs you in as yourself; you can revoke it there at any time.</span>
          </div>
          @if (error()) {
            <div class="form-error" role="alert">{{ error() }}</div>
          }
          <button type="button" class="btn primary lg block" (click)="tokenLogin()" [disabled]="busy()">
            @if (busy()) {
              <span class="spinner"></span>
            }
            Sign in with token
          </button>
          <button type="button" class="btn ghost block" (click)="tokenMode.set(false); error.set('')">Use email and password</button>
        } @else if (step() === 'email') {
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" class="input" [(ngModel)]="email" (blur)="prefetch()" autocomplete="username" required autofocus />
          </div>
          @if (error()) {
            <div class="form-error" role="alert">{{ error() }}</div>
          }
          <button type="submit" class="btn primary lg block" [disabled]="busy()">
            @if (busy()) {
              <span class="spinner"></span>
            }
            Continue
          </button>
        } @else {
          <div class="who">
            <span class="truncate">{{ email() }}</span>
            <button type="button" class="link-btn small" (click)="changeEmail()">Change</button>
          </div>
          @if (sso(); as d) {
            @if (server.native) {
              <div class="notice accent small">
                <span>
                  <strong>{{ d.organization }} uses single sign-on.</strong> SSO opens on the web and can't return to the app:
                  create an API token on the web (Settings → API &amp; MCP) and
                  <button type="button" class="link-btn" (click)="tokenMode.set(true)">sign in with it</button>{{ d.enforced ? '.' : ', or use your password below.' }}
                </span>
              </div>
            } @else {
            <button type="button" class="btn lg block" [class.primary]="d.enforced || !ssoSecondary()" (click)="startSso()" [disabled]="redirecting()">
              @if (redirecting()) {
                <span class="spinner"></span>
              } @else {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              }
              Continue with {{ d.organization }} SSO
            </button>
            @if (d.enforced) {
              <p class="muted small">{{ d.organization }} requires single sign-on for your email domain, so password sign-in is turned off.</p>
            }
            }
          }
          @if (!sso()?.enforced) {
            @if (sso()) {
              <div class="or"><span>or sign in with your password</span></div>
            }
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" class="input" [(ngModel)]="password" autocomplete="current-password" required autofocus />
            </div>
          }
          @if (error()) {
            <div class="form-error" role="alert">{{ error() }}</div>
          }
          @if (!sso()?.enforced) {
            <button type="submit" class="btn lg block" [class.primary]="!sso() || ssoSecondary()" [disabled]="busy()">
              @if (busy()) {
                <span class="spinner"></span>
              }
              Sign in
            </button>
          }
        }
        @if (server.native && !tokenMode()) {
          <p class="alt small"><button type="button" class="link-btn" (click)="tokenMode.set(true); error.set('')">Sign in with an API token</button></p>
        }
        @if (platform.signupsOpen()) {
          <p class="alt">New to {{ platform.instanceName() }}? <a routerLink="/register" [queryParams]="registerParams()">Create an account</a></p>
        } @else {
          <p class="alt">Accounts are by invitation only. Ask your team for an invitation link{{ platform.supportEmail() ? ' or contact ' + platform.supportEmail() : '' }}.</p>
        }
        @if (platform.supportEmail()) {
          <p class="alt small">Trouble signing in? Contact <a [href]="'mailto:' + platform.supportEmail()">{{ platform.supportEmail() }}</a></p>
        }
      </form>
    </div>
    <app-auth-art />
  `,
})
export class LoginPage {
  protected readonly platform = inject(PlatformInfoService);
  private auth = inject(AuthService);
  private ws = inject(WorkspaceService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal(this.route.snapshot.queryParamMap.get('sso_error') ?? '');
  protected readonly step = signal<'email' | 'password'>('email');
  protected readonly sso = signal<SsoDiscovery | null>(null);
  /** SSO offered but optional: password stays the primary action, SSO is the alternative. */
  protected readonly ssoSecondary = signal(true);
  protected readonly redirecting = signal(false);
  protected readonly server = inject(ServerConfigService);
  protected readonly tokenMode = signal(false);
  protected readonly apiToken = signal('');
  private discovered: { email: string; result: Promise<SsoDiscovery | null> } | null = null;

  private nextUrl(): string {
    const next = this.route.snapshot.queryParamMap.get('next') || '/';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/';
  }

  private discover(email: string): Promise<SsoDiscovery | null> {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return Promise.resolve(null);
    if (this.discovered?.email !== e) {
      this.discovered = {
        email: e,
        result: firstValueFrom(this.auth.discoverSso(e, this.nextUrl())).then(
          (r) => (r.sso ? r : null),
          () => null,
        ),
      };
    }
    return this.discovered.result;
  }

  /** Called on email blur: look up SSO early so Continue feels instant. */
  protected prefetch() {
    void this.discover(this.email());
  }

  protected changeEmail() {
    this.step.set('email');
    this.sso.set(null);
    this.password.set('');
    this.error.set('');
  }

  protected startSso() {
    const url = this.sso()?.start_url;
    if (!url) return;
    this.redirecting.set(true);
    window.location.href = url;
  }

  protected tokenLogin() {
    const t = this.apiToken().trim();
    if (!t.startsWith('mkt_')) {
      this.error.set('Paste a personal API token; it starts with mkt_.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.loginWithApiToken(t).subscribe({
      next: () => {
        this.ws.clear();
        this.router.navigateByUrl(this.nextUrl());
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(
          err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)
            ? 'This token was not accepted. It may be revoked or expired.'
            : formatError(err),
        );
      },
    });
  }

  protected registerParams() {
    const inv = this.route.snapshot.queryParamMap.get('invitation');
    return inv ? { invitation: inv } : {};
  }

  protected async submit() {
    if (this.step() === 'email') {
      if (!this.email().trim()) {
        this.error.set('Enter your email.');
        return;
      }
      this.busy.set(true);
      this.error.set('');
      const d = await this.discover(this.email());
      this.busy.set(false);
      this.sso.set(d);
      // When SSO is available it is the primary action; the password stays as the alternative.
      this.ssoSecondary.set(false);
      this.step.set('password');
      return;
    }
    if (!this.email() || !this.password()) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.email().trim(), this.password()).subscribe({
      next: () => {
        this.ws.clear();
        this.router.navigateByUrl(this.nextUrl());
      },
      error: async (err) => {
        this.busy.set(false);
        if (err instanceof HttpErrorResponse && err.status === 403 && /single sign-on/i.test(formatError(err))) {
          this.discovered = null;
          const d = await this.discover(this.email());
          if (d) {
            this.sso.set({ ...d, enforced: true });
            this.error.set('');
            return;
          }
        }
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 401
            ? 'That email and password do not match an account.'
            : formatError(err),
        );
      },
    });
  }
}
