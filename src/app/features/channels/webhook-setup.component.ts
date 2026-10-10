import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { Channel } from '../../core/models';
import { ConfirmService } from '../../shared/components/confirm.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/components/icon.component';

/** "Webhook setup" panel for the generic webhook integration: URL, signing secret, payload and verification code. */
@Component({
  selector: 'app-webhook-setup',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="setup">
      <summary class="small strong">Webhook setup</summary>
      <div class="stack-sm body">
        <span class="label small">Endpoint</span>
        <div class="row">
          <code class="mono-box truncate">{{ setup().url || '—' }}</code>
          <button type="button" class="btn sm" (click)="copy(setup().url)" [disabled]="!setup().url"><app-icon name="copy" [size]="14" /> Copy</button>
        </div>

        <span class="label small">Signing secret</span>
        @if (setup().signing_secret; as secret) {
          <div class="row">
            <code class="mono-box truncate">{{ revealed() ? secret : mask(secret) }}</code>
            <button type="button" class="btn sm ghost" (click)="revealed.set(!revealed())" [attr.aria-pressed]="revealed()">
              <app-icon name="eye" [size]="14" /> {{ revealed() ? 'Hide' : 'Reveal' }}
            </button>
            <button type="button" class="btn sm" (click)="copy(secret)"><app-icon name="copy" [size]="14" /> Copy</button>
            <button type="button" class="btn sm ghost" (click)="rotate()" [disabled]="rotating()">
              <app-icon name="refresh" [size]="14" /> Rotate
            </button>
          </div>
        } @else {
          <p class="muted small">Only workspace admins can see the signing secret.</p>
        }

        <p class="small">
          Every request carries <code>{{ sigHeader() }}</code> and <code>{{ tsHeader() }}</code>. The signature is
          <code>sha256=</code> followed by the hex HMAC-SHA256 of <code>&lt;timestamp&gt;.&lt;raw body&gt;</code> computed with the signing secret.
          Verify it against the raw request body, not re-serialised JSON, and reject old timestamps.
        </p>

        <div class="row label-row">
          <span class="label small">Sample payload</span>
          <span class="spacer"></span>
          <button type="button" class="btn sm ghost" (click)="copy(payload())"><app-icon name="copy" [size]="14" /> Copy</button>
        </div>
        <pre class="code">{{ payload() }}</pre>

        <div class="row label-row">
          <span class="label small">Verify in an n8n Code node (JavaScript)</span>
          <span class="spacer"></span>
          <button type="button" class="btn sm ghost" (click)="copy(snippet())"><app-icon name="copy" [size]="14" /> Copy</button>
        </div>
        <pre class="code">{{ snippet() }}</pre>

        <p class="notice accent small">
          <app-icon name="info" [size]="14" />
          <span>Reply with JSON <code>{{ '{' }}id, url{{ '}' }}</code> to have Markette store them; 5xx and timeouts are retried.</span>
        </p>
      </div>
    </details>
  `,
  styles: `
    .setup {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 10px;
    }
    summary {
      cursor: pointer;
    }
    .body {
      margin-top: 10px;
    }
    .mono-box {
      flex: 1;
      padding: 6px 8px;
      border-radius: 8px;
      background: var(--bg-sunken);
      font-family: var(--font-mono);
      font-size: 0.78rem;
    }
    .code {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--bg-sunken);
      border: 1px solid var(--border);
      font-family: var(--font-mono);
      font-size: 0.74rem;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 260px;
    }
    .label-row {
      margin-top: 6px;
    }
  `,
})
export class WebhookSetupComponent {
  readonly channel = input.required<Channel>();
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly catalog = inject(CatalogService);

  protected readonly rotating = signal(false);

  protected async rotate() {
    const ok = await this.confirm.ask({
      title: 'Rotate the signing secret?',
      message: 'The current secret stops working immediately. Update your receiver (e.g. the n8n Code node) with the new one.',
      confirmLabel: 'Rotate secret',
      danger: true,
    });
    if (!ok) return;
    this.rotating.set(true);
    this.api.post<Channel>(`channels/${this.channel().id}/rotate-secret/`).subscribe({
      next: (ch) => {
        this.catalog.upsertChannel(ch);
        this.revealed.set(true);
        this.rotating.set(false);
        this.toast.success('New signing secret created');
      },
      error: (err) => {
        this.rotating.set(false);
        this.toast.error('Could not rotate the secret', err);
      },
    });
  }

  protected readonly revealed = signal(false);
  protected readonly setup = computed(() => this.channel().setup ?? {});
  protected readonly sigHeader = computed(() => this.setup().signature_header || 'X-Markette-Signature');
  protected readonly tsHeader = computed(() => this.setup().timestamp_header || 'X-Markette-Timestamp');

  protected readonly payload = computed(() => {
    const ch = this.channel();
    return JSON.stringify(
      {
        event: 'publication.created',
        idempotency_key: 'markette-target-1234',
        sent_at: '2026-10-10T09:00:00+00:00',
        target_id: 1234,
        channel: { id: ch.id, name: ch.name },
        post: {
          title: 'Autumn launch',
          text: 'Our autumn collection is here. https://example.com/autumn',
          link: 'https://example.com/autumn',
          tags: ['launch'],
          options: {},
          media: [{ url: 'https://example.com/media/cover.jpg', mime: 'image/jpeg', alt: 'Cover photo', width: 1600, height: 900, size: 245000 }],
        },
      },
      null,
      2,
    );
  });

  protected readonly snippet = computed(
    () => `// n8n Code node — runs after a Webhook node with "Raw body" enabled.
// Use the raw request body: re-serialised JSON will not match the signature.
const crypto = require('crypto');

const secret = 'YOUR_SIGNING_SECRET';
const headers = $json.headers;
const ts = headers['${this.tsHeader().toLowerCase()}'];
const signature = (headers['${this.sigHeader().toLowerCase()}'] || '').replace(/^sha256=/, '');
const rawBody = Buffer.from($binary.data.data, 'base64').toString('utf8');

// Reject requests older than 5 minutes (replay protection).
if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
  throw new Error('Stale or missing timestamp');
}

const expected = crypto.createHmac('sha256', secret).update(\`\${ts}.\${rawBody}\`).digest('hex');
const ok =
  signature.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
if (!ok) throw new Error('Invalid signature');

return [{ json: JSON.parse(rawBody) }];`,
  );

  protected mask(secret: string): string {
    return secret.length <= 6 ? '••••••' : `${secret.slice(0, 4)}${'•'.repeat(Math.min(24, secret.length - 4))}`;
  }

  protected async copy(text: string | null | undefined) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  }
}
