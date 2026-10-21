import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { fieldErrors } from '../../core/errors';
import { Channel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/components/icon.component';

interface BotState {
  installed: boolean;
  upload_mode: 'handoff' | 'bot';
  has_cookies: boolean;
  recipe: Record<string, unknown>[];
  custom_recipe: boolean;
  test: { status: 'running' | 'ok' | 'incomplete' | 'failed'; message?: string; at: string; screenshot?: string } | null;
}

/** Hand-off sites: choose between uploading by hand and the optional upload bot (admins). */
@Component({
  selector: 'app-upload-bot-panel',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <div class="bot stack-sm">
        <div class="segmented" role="radiogroup" aria-label="How it is published">
          <button type="button" role="radio" [attr.aria-checked]="s.upload_mode === 'handoff'" (click)="save({ upload_mode: 'handoff' })">By hand</button>
          <button type="button" role="radio" [attr.aria-checked]="s.upload_mode === 'bot'" (click)="save({ upload_mode: 'bot' })" [disabled]="!s.has_cookies">Upload bot</button>
        </div>
        @if (!s.installed) {
          <p class="hint warning-text">The upload bot is not running on this server, so posts are always prepared for you to upload.</p>
        }
        <p class="hint">
          The bot uses this account's browser session: sign in on the site, export its cookies as JSON (for example with the Cookie-Editor
          extension) and paste them here. It never solves CAPTCHAs or works around the site's checks; whatever it cannot finish comes back to
          you as “Ready to upload”. Automating uploads can break the site's terms.
        </p>
        <textarea class="textarea mono small" rows="3" [(ngModel)]="cookies" [placeholder]="s.has_cookies ? 'Session saved. Paste new cookies to replace it.' : '[{&quot;name&quot;: …}]'" aria-label="Session cookies"></textarea>
        @if (fe()['bot_cookies']) {
          <span class="error">{{ fe()['bot_cookies'] }}</span>
        }
        <div class="row-wrap">
          <button type="button" class="btn sm" (click)="save({ bot_cookies: cookies })" [disabled]="!cookies.trim()">Save session</button>
          <button type="button" class="btn sm ghost" (click)="save({ test: true })" [disabled]="!s.installed || !s.has_cookies || s.test?.status === 'running'">
            @if (s.test?.status === 'running') {
              <span class="spinner"></span>
            }
            Test the upload bot
          </button>
          <button type="button" class="btn sm ghost" (click)="showRecipe.set(!showRecipe())">{{ showRecipe() ? 'Hide' : 'Edit' }} steps</button>
        </div>
        @if (s.test; as t) {
          <div class="notice small" [class.success]="t.status === 'ok'" [class.warning]="t.status === 'incomplete' || t.status === 'failed'">
            <app-icon [name]="t.status === 'ok' ? 'check' : 'alert'" [size]="14" />
            <span>
              {{ t.status === 'running' ? 'Testing… it opens the upload page with the session and checks the form, without uploading.' : t.message }}
              @if (t.screenshot) {
                <a [href]="t.screenshot" target="_blank" rel="noopener">Screenshot</a>
              }
            </span>
          </div>
        }
        @if (showRecipe()) {
          <p class="hint">
            Steps the bot follows (JSON). The defaults use generic selectors and were not tested on the sites' signed-in pages: run the test, and
            adjust the selectors when a site changes. Empty restores the default.
          </p>
          <textarea class="textarea mono small" rows="10" [(ngModel)]="recipe" aria-label="Bot steps"></textarea>
          @if (fe()['bot_recipe']) {
            <span class="error">{{ fe()['bot_recipe'] }}</span>
          }
          <div><button type="button" class="btn sm" (click)="saveRecipe()">Save steps</button></div>
        }
      </div>
    }
  `,
  styles: `
    .bot {
      border-top: 1px dashed var(--border);
      padding-top: 10px;
      margin-top: 6px;
    }
  `,
})
export class UploadBotPanelComponent implements OnInit, OnDestroy {
  readonly channel = input.required<Channel>();
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly state = signal<BotState | null>(null);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly showRecipe = signal(false);
  protected cookies = '';
  protected recipe = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private url() {
    return `channels/${this.channel().id}/upload-bot/`;
  }

  private apply(s: BotState) {
    this.state.set(s);
    this.recipe = JSON.stringify(s.recipe, null, 2);
    if (s.test?.status === 'running') this.timer = setTimeout(() => this.load(), 4000);
  }

  private load() {
    this.api.get<BotState>(this.url()).subscribe({ next: (s) => this.apply(s), error: () => undefined });
  }

  protected save(body: Record<string, unknown>) {
    this.fe.set({});
    this.api.post<BotState>(this.url(), body).subscribe({
      next: (s) => {
        this.apply(s);
        if ('bot_cookies' in body) {
          this.cookies = '';
          this.toast.success('Session saved');
        }
      },
      error: (err) => {
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        if (general) this.toast.error('Not saved', general);
      },
    });
  }

  protected saveRecipe() {
    const text = this.recipe.trim();
    try {
      this.save({ bot_recipe: text ? JSON.parse(text) : [] });
    } catch {
      this.fe.set({ bot_recipe: 'That is not valid JSON.' });
    }
  }
}
