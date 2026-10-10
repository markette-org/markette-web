import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ServerConfigService } from '../../core/server-config.service';
import { PlatformInfoService } from '../../core/platform-info.service';
import { fieldErrors, formatError } from '../../core/errors';
import { Workspace } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService, browserTimezone } from '../../core/workspace.service';
import { allTimezones } from '../../shared/utils/dates';
import { AuthArtComponent } from './auth-art.component';

@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink, AuthArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <div class="form-side">
      <div class="form-box">
        <div class="brand">
          <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)" /><path d="M16 46V20l16 15 16-15v26" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" /><circle cx="48" cy="46" r="5" fill="var(--coral)" /></svg>
          {{ platform.instanceName() }}
        </div>

        @if (server.native) {
          <div class="server-line small">
            <span class="muted">Server</span>
            <span class="mono truncate">{{ server.server() }}</span>
            <a routerLink="/server" class="link-btn small">Change server</a>
          </div>
        }
        @if (auth.isLoggedIn() && invitation()) {
          <div>
            <h1>Join the workspace</h1>
            <p class="lead">You were invited to a {{ platform.instanceName() }} workspace. Accept to add it to your account.</p>
          </div>
          @if (error()) {
            <div class="form-error" role="alert">{{ error() }}</div>
          }
          <button type="button" class="btn primary lg block" (click)="accept()" [disabled]="busy()">
            @if (busy()) {
              <span class="spinner"></span>
            }
            Accept invitation
          </button>
          <p class="alt">Wrong account? <button type="button" class="link-btn" (click)="switchAccount()">Sign out</button> and register with the invited email.</p>
        } @else if (!platform.signupsOpen() && !invitation()) {
          <div class="stack">
            <h1>Sign-up is by invitation</h1>
            <p class="lead">
              New accounts on {{ platform.instanceName() }} are created from an invitation. Ask an administrator of your organization to invite you;
              the link in the invitation email brings you back here.
            </p>
            @if (platform.supportEmail()) {
              <div class="notice">Need access? Contact <a [href]="'mailto:' + platform.supportEmail()">{{ platform.supportEmail() }}</a></div>
            }
            <a routerLink="/login" class="btn primary lg block">Sign in</a>
          </div>
        } @else {
          <form class="stack" (ngSubmit)="submit()" novalidate>
            <div>
              <h1>{{ invitation() ? 'Accept your invitation' : 'Create your account' }}</h1>
              <p class="lead">
                {{ invitation() ? 'Create an account with the email address the invitation was sent to.' : 'Start with a workspace for your brand. Invite your team later.' }}
              </p>
            </div>
            <div class="field">
              <label for="name">Your name</label>
              <input id="name" name="name" class="input" [(ngModel)]="name" autocomplete="name" />
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" class="input" [class.invalid]="fe()['email']" [(ngModel)]="email" autocomplete="email" required />
              @if (fe()['email']) {
                <span class="error">{{ fe()['email'] }}</span>
              } @else if (platform.signupDomains().length && !invitation()) {
                <span class="hint">Sign-up is limited to addresses at {{ platform.signupDomains().join(', ') }}.</span>
              }
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" class="input" [class.invalid]="fe()['password']" [(ngModel)]="password" autocomplete="new-password" required minlength="8" />
              @if (fe()['password']) {
                <span class="error">{{ fe()['password'] }}</span>
              } @else {
                <span class="hint">At least 8 characters; avoid common passwords.</span>
              }
            </div>
            @if (!invitation()) {
              <div class="field">
                <label for="org">Organization</label>
                <input id="org" name="org" class="input" [(ngModel)]="organizationName" placeholder="e.g. Acme Inc." autocomplete="organization" />
                <span class="hint">Your company or agency. It holds your workspaces, team and plan.</span>
              </div>
              <div class="field">
                <label for="workspace">First workspace</label>
                <input id="workspace" name="workspace" class="input" [(ngModel)]="workspaceName" placeholder="e.g. Acme Coffee — one brand or client" />
              </div>
            }
            <div class="field">
              <label for="tz">Time zone</label>
              <select id="tz" name="tz" class="select" [(ngModel)]="timezone">
                @for (tz of timezones; track tz) {
                  <option [value]="tz">{{ tz }}</option>
                }
              </select>
            </div>
            @if (error()) {
              <div class="form-error" role="alert">
                {{ error() }}
                @if (platform.supportEmail()) {
                  <br />Questions? Contact {{ platform.supportEmail() }}.
                }
              </div>
            }
            <button type="submit" class="btn primary lg block" [disabled]="busy()">
              @if (busy()) {
                <span class="spinner"></span>
              }
              Create account
            </button>
            <p class="alt">Already have an account? <a routerLink="/login" [queryParams]="invitation() ? { next: '/register?invitation=' + invitation() } : {}">Sign in</a></p>
          </form>
        }
      </div>
    </div>
    <app-auth-art />
  `,
})
export class RegisterPage {
  protected readonly auth = inject(AuthService);
  protected readonly platform = inject(PlatformInfoService);
  protected readonly server = inject(ServerConfigService);
  private ws = inject(WorkspaceService);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  protected readonly invitation = signal(this.route.snapshot.queryParamMap.get('invitation') ?? '');
  protected readonly name = signal('');
  protected readonly email = signal(this.route.snapshot.queryParamMap.get('email') ?? '');
  protected readonly password = signal('');
  protected readonly workspaceName = signal('');
  protected readonly organizationName = signal('');
  protected readonly timezone = signal(browserTimezone());
  protected readonly timezones = allTimezones();
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fe = signal<Record<string, string>>({});

  protected submit() {
    this.error.set('');
    this.fe.set({});
    if (!this.email() || !this.password()) {
      this.error.set('Email and password are required.');
      return;
    }
    this.busy.set(true);
    this.auth
      .register({
        email: this.email().trim(),
        password: this.password(),
        name: this.name().trim() || undefined,
        organization_name: this.organizationName().trim() || undefined,
        workspace_name: this.workspaceName().trim() || undefined,
        timezone: this.timezone(),
        invitation: this.invitation() || undefined,
      })
      .subscribe({
        next: () => {
          this.ws.clear();
          this.toast.success(`Welcome to ${this.platform.instanceName()}`, this.invitation() ? 'You joined the workspace.' : 'Connect your first channel to get started.');
          this.router.navigateByUrl(this.invitation() ? '/' : '/channels');
        },
        error: (err) => {
          this.busy.set(false);
          const { fields, general } = fieldErrors(err);
          this.fe.set(fields);
          const other = Object.entries(fields)
            .filter(([k]) => k !== 'email' && k !== 'password')
            .map(([, v]) => v);
          this.error.set([general, ...other].filter(Boolean).join('\n'));
        },
      });
  }

  protected accept() {
    this.busy.set(true);
    this.error.set('');
    this.api.post<Partial<Workspace>>('invitations/accept/', { token: this.invitation() }).subscribe({
      next: async (w) => {
        await this.ws.reload();
        this.toast.success('Invitation accepted', w?.name ? `You can now open ${w.name}.` : 'You joined the organization.');
        if (w?.slug) this.ws.setActive(w.slug);
        this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(formatError(err));
      },
    });
  }

  protected switchAccount() {
    this.ws.clear();
    this.auth.logout(false);
  }
}
