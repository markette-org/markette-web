import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { fieldErrors } from '../../core/errors';
import { SavedReport } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RelativeTimePipe } from '../../shared/pipes/tz-date.pipe';
import { copyText } from '../platform/platform-utils';

const PERIODS = [
  { value: 'previous_week', label: 'Previous week (Monday–Sunday)' },
  { value: 'previous_month', label: 'Previous month' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

const FREQUENCIES = [
  { value: '', label: 'Not emailed' },
  { value: 'weekly', label: 'Every Monday at 8:00' },
  { value: 'monthly', label: 'On the 1st at 8:00' },
] as const;

interface Draft {
  id: number | null;
  name: string;
  period: SavedReport['period'];
  frequency: SavedReport['frequency'];
  recipients: string;
}

@Component({
  selector: 'app-reports-section',
  imports: [FormsModule, IconComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card stack">
      <div class="card-head">
        <div>
          <h2>Reports</h2>
          <p class="muted small">Email a summary with a CSV of every publication each week or month, and share a read-only page with clients who have no account.</p>
        </div>
      </div>
      @if (!ws.isAdmin()) {
        <div class="notice"><app-icon name="lock" [size]="16" /><span>Workspace admins manage reports.</span></div>
      } @else {
        @for (r of reports(); track r.id) {
          <article class="item stack-sm">
            <div class="row">
              <strong class="grow">{{ r.name }}</strong>
              <span class="muted small">{{ periodLabel(r.period) }} · {{ freqLabel(r.frequency) }}</span>
            </div>
            @if (r.recipients.length) {
              <span class="small muted">To {{ r.recipients.join(', ') }}</span>
            }
            @if (r.last_error) {
              <div class="notice warning small"><app-icon name="alert" [size]="14" /><span>{{ r.last_error }}</span></div>
            } @else if (r.last_sent_at) {
              <span class="tiny muted">Last sent {{ r.last_sent_at | relTime }}</span>
            }
            @if (r.share_url) {
              <div class="row">
                <code class="mono truncate grow">{{ r.share_url }}</code>
                <button type="button" class="btn sm" (click)="copy(r.share_url)"><app-icon name="copy" [size]="14" /> Copy</button>
                <a class="btn sm ghost" [href]="r.share_url" target="_blank" rel="noopener"><app-icon name="external" [size]="14" /> Open</a>
              </div>
            }
            <div class="row-wrap">
              <button type="button" class="btn sm" (click)="sendNow(r)" [disabled]="busy() === r.id || !r.recipients.length">
                @if (busy() === r.id) {
                  <span class="spinner"></span>
                } @else {
                  <app-icon name="send" [size]="14" />
                }
                Send now
              </button>
              @if (r.share_url) {
                <button type="button" class="btn sm ghost" (click)="share(r, false)">Stop sharing</button>
              } @else {
                <button type="button" class="btn sm ghost" (click)="share(r, true)"><app-icon name="link" [size]="14" /> Share a link</button>
              }
              <button type="button" class="btn sm ghost" (click)="edit(r)"><app-icon name="edit" [size]="14" /> Edit</button>
              <span class="spacer"></span>
              <button type="button" class="btn sm danger-ghost" (click)="remove(r)"><app-icon name="trash" [size]="14" /> Delete</button>
            </div>
          </article>
        }
        @if (draft(); as f) {
          <form class="item stack" (ngSubmit)="save()">
            <div class="form-grid">
              <div class="field">
                <label for="rp-name">Name</label>
                <input id="rp-name" name="name" class="input" [(ngModel)]="f.name" />
                @if (fe()['name']) {
                  <span class="error">{{ fe()['name'] }}</span>
                }
              </div>
              <div class="field">
                <label for="rp-period">Period</label>
                <select id="rp-period" name="period" class="select" [(ngModel)]="f.period">
                  @for (p of periods; track p.value) {
                    <option [value]="p.value">{{ p.label }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="rp-freq">Email it</label>
                <select id="rp-freq" name="frequency" class="select" [(ngModel)]="f.frequency">
                  @for (p of frequencies; track p.value) {
                    <option [value]="p.value">{{ p.label }}</option>
                  }
                </select>
                <span class="hint">In the workspace's time zone. Needs the server's email settings.</span>
              </div>
              <div class="field">
                <label for="rp-to">Recipients</label>
                <input id="rp-to" name="to" class="input" [(ngModel)]="f.recipients" placeholder="client@example.org, boss@example.org" />
                @if (fe()['recipients']) {
                  <span class="error">{{ fe()['recipients'] }}</span>
                }
              </div>
            </div>
            <div class="row">
              <button type="submit" class="btn primary" [disabled]="saving()">{{ f.id ? 'Save' : 'Create report' }}</button>
              <button type="button" class="btn ghost" (click)="draft.set(null)">Cancel</button>
            </div>
          </form>
        } @else {
          <div><button type="button" class="btn" (click)="add()"><app-icon name="plus" [size]="16" /> New report</button></div>
        }
      }
    </section>
  `,
  styles: `
    .item {
      border: 1px solid var(--border);
      border-radius: var(--radius, 10px);
      padding: 12px 14px;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class ReportsSectionComponent implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly periods = PERIODS;
  protected readonly frequencies = FREQUENCIES;
  protected readonly reports = signal<SavedReport[]>([]);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly saving = signal(false);
  protected readonly busy = signal<number | null>(null);
  protected readonly fe = signal<Record<string, string>>({});

  ngOnInit() {
    if (this.ws.isAdmin()) this.reload();
  }

  private reload() {
    this.api.get<SavedReport[]>('reports/').subscribe({ next: (r) => this.reports.set(r), error: (err) => this.toast.error('Could not load reports', err) });
  }

  protected periodLabel(v: string) {
    return PERIODS.find((p) => p.value === v)?.label ?? v;
  }

  protected freqLabel(v: string) {
    return FREQUENCIES.find((p) => p.value === v)?.label ?? v;
  }

  protected add() {
    this.fe.set({});
    this.draft.set({ id: null, name: 'Monthly report', period: 'previous_month', frequency: 'monthly', recipients: '' });
  }

  protected edit(r: SavedReport) {
    this.fe.set({});
    this.draft.set({ id: r.id, name: r.name, period: r.period, frequency: r.frequency, recipients: r.recipients.join(', ') });
  }

  protected save() {
    const f = this.draft();
    if (!f) return;
    const body = {
      name: f.name.trim(),
      period: f.period,
      frequency: f.frequency,
      recipients: f.recipients
        .split(/[\s,;]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
    this.saving.set(true);
    const req = f.id ? this.api.patch<SavedReport>(`reports/${f.id}/`, body) : this.api.post<SavedReport>('reports/', body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.draft.set(null);
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        if (general) this.toast.error('Not saved', general);
      },
    });
  }

  protected sendNow(r: SavedReport) {
    this.busy.set(r.id);
    this.api.post<SavedReport>(`reports/${r.id}/send/`).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.success('Report sent', r.recipients.join(', '));
        this.reload();
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error('Not sent', err);
      },
    });
  }

  protected share(r: SavedReport, on: boolean) {
    const req = on ? this.api.post<SavedReport>(`reports/${r.id}/share/`) : this.api.delete<SavedReport>(`reports/${r.id}/share/`);
    req.subscribe({ next: () => this.reload(), error: (err) => this.toast.error('Could not change sharing', err) });
  }

  protected async remove(r: SavedReport) {
    if (!(await this.confirm.ask({ title: `Delete ${r.name}?`, message: 'Its shared link stops working.', confirmLabel: 'Delete', danger: true }))) return;
    this.api.delete(`reports/${r.id}/`).subscribe({ next: () => this.reload(), error: (err) => this.toast.error('Could not delete', err) });
  }

  protected async copy(text: string) {
    if (await copyText(text)) this.toast.success('Link copied');
  }
}
