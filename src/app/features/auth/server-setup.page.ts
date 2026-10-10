import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PublicInfo } from '../../core/models';
import { PlatformInfoService } from '../../core/platform-info.service';
import { ServerConfigService } from '../../core/server-config.service';
import { WorkspaceService } from '../../core/workspace.service';

/** Native app, first launch (or "Change server"): pick the Markette server to talk to. */
@Component({
  selector: 'app-server-setup-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  host: { class: 'server-setup' },
  template: `
    <div class="form-side">
      <form class="form-box" (ngSubmit)="check()" novalidate>
        <div class="brand">
          <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)" /><path d="M16 46V20l16 15 16-15v26" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" /><circle cx="48" cy="46" r="5" fill="var(--coral)" /></svg>
          Markette
        </div>
        <div>
          <h1>Connect to your server</h1>
          <p class="lead">Enter the address of your Markette installation — the same one you open in the browser.</p>
        </div>

        <div class="field">
          <label for="server">Server address</label>
          <input
            id="server"
            name="server"
            type="url"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            class="input"
            [ngModel]="url()"
            (ngModelChange)="onInput($event)"
            placeholder="https://markette.example.org"
            autocomplete="url"
            autofocus
          />
          @if (insecure()) {
            <span class="hint warning-text">This address uses http://, so passwords and tokens travel unencrypted. Use https:// whenever possible.</span>
          } @else {
            <span class="hint">Ask your administrator if you are not sure.</span>
          }
        </div>

        @if (error()) {
          <div class="form-error" role="alert">{{ error() }}</div>
        }

        @if (found(); as f) {
          <div class="notice success found" role="status">
            <div class="stack-sm">
              <strong>{{ f.instance_name || 'Markette' }}</strong>
              <span class="small mono">{{ normalized() }}</span>
              @if (f.announcement) {
                <span class="small">{{ f.announcement }}</span>
              }
            </div>
          </div>
          <button type="button" class="btn primary lg block" (click)="save()">Use this server</button>
          <button type="button" class="btn ghost block" (click)="found.set(null)">Try another address</button>
        } @else {
          <button type="submit" class="btn primary lg block" [disabled]="busy() || !url().trim()">
            @if (busy()) {
              <span class="spinner"></span>
            }
            Check server
          </button>
        }

        @if (server.server(); as current) {
          <p class="alt small">Currently connected to <span class="mono">{{ current }}</span></p>
        }
      </form>
    </div>
  `,
  styles: `
    :host.server-setup {
      grid-template-columns: minmax(0, 1fr);
    }
    .found {
      align-items: flex-start;
    }
  `,
})
export class ServerSetupPage {
  protected readonly server = inject(ServerConfigService);
  private readonly platform = inject(PlatformInfoService);
  private readonly auth = inject(AuthService);
  private readonly ws = inject(WorkspaceService);
  private readonly router = inject(Router);

  protected readonly url = signal(this.server.server() ?? '');
  protected readonly normalized = signal<string | null>(null);
  protected readonly insecure = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly found = signal<PublicInfo | null>(null);

  protected onInput(v: string) {
    this.url.set(v);
    this.found.set(null);
    this.error.set('');
    this.insecure.set(/^http:\/\//i.test(v.trim()));
  }

  protected async check() {
    const n = this.server.normalize(this.url());
    if (!n) {
      this.error.set('Enter a valid address, e.g. https://markette.example.org');
      return;
    }
    this.normalized.set(n);
    this.insecure.set(n.startsWith('http://'));
    this.busy.set(true);
    this.error.set('');
    try {
      const info = await this.server.probe(n);
      if (!info || typeof info !== 'object' || !('instance_name' in info)) throw new Error('not markette');
      this.found.set(info);
    } catch {
      this.error.set(`No Markette server answered at ${n}. Check the address and that the server is reachable from this phone.`);
    } finally {
      this.busy.set(false);
    }
  }

  protected async save() {
    const n = this.normalized();
    const info = this.found();
    if (!n || !info) return;
    const changed = n !== this.server.server();
    if (changed) {
      // Tokens belong to the previous server.
      this.ws.clear();
      this.auth.logout(false);
    }
    this.server.save(n);
    this.platform.info.set(info);
    await this.router.navigateByUrl('/login');
  }
}
