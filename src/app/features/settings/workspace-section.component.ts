import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { fieldErrors } from '../../core/errors';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { allTimezones } from '../../shared/utils/dates';

@Component({
  selector: 'app-workspace-section',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ws.active(); as w) {
      <form class="card stack" (ngSubmit)="save()">
        <div class="card-head">
          <h2>Workspace</h2>
          @if (!ws.isAdmin()) {
            <span class="chip outline"><app-icon name="lock" [size]="12" /> Admins can change these</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="w-name">Name</label>
            <input id="w-name" name="name" class="input" [(ngModel)]="name" [disabled]="!ws.isAdmin()" [class.invalid]="fe()['name']" />
            @if (fe()['name']) {
              <span class="error">{{ fe()['name'] }}</span>
            }
          </div>
          <div class="field">
            <label for="w-slug">Slug</label>
            <input id="w-slug" class="input mono" [value]="w.slug" disabled />
            <span class="hint">Used in the X-Workspace API header.</span>
          </div>
          <div class="field">
            <label for="w-tz">Time zone</label>
            <select id="w-tz" name="tz" class="select" [(ngModel)]="timezone" [disabled]="!ws.isAdmin()">
              @for (tz of timezones; track tz) {
                <option [value]="tz">{{ tz }}</option>
              }
            </select>
            <span class="hint">Calendar, queue slots and best times use this zone.</span>
          </div>
          <div class="field">
            <label for="w-gap">Minimum gap between posts (minutes)</label>
            <input id="w-gap" name="gap" type="number" min="0" max="1440" step="5" class="input" [(ngModel)]="gap" [disabled]="!ws.isAdmin()" [class.invalid]="fe()['min_gap_minutes']" />
            @if (fe()['min_gap_minutes']) {
              <span class="error">{{ fe()['min_gap_minutes'] }}</span>
            } @else {
              <span class="hint">Best-time scheduling keeps at least this much space between posts on the same channel.</span>
            }
          </div>
          <div class="field full">
            <label class="switch">
              <input type="checkbox" name="ai" [(ngModel)]="ai" [disabled]="!ws.isAdmin()" />
              <span class="track"></span>
              <span><strong>AI assistance</strong> — adapt copy per network, suggest times with rationale, plan campaigns.</span>
            </label>
            @if (ai() && ws.serverAi() === false) {
              <span class="hint warning-text">AI is turned off on this server, so AI features stay hidden even when enabled here.</span>
            }
          </div>
        </div>
        @if (general()) {
          <div class="form-error" role="alert">{{ general() }}</div>
        }
        @if (ws.isAdmin()) {
          <div class="row">
            <button type="submit" class="btn primary" [disabled]="saving()">
              @if (saving()) {
                <span class="spinner"></span>
              }
              Save changes
            </button>
          </div>
        }
      </form>

      @if (ws.isOwner()) {
        <section class="card danger-zone stack">
          <div>
            <h2>Delete workspace</h2>
            <p class="muted small">Removes all channels, posts, media and analytics of <strong>{{ w.name }}</strong>. Published posts stay on the networks. This cannot be undone.</p>
          </div>
          <div><button type="button" class="btn danger" (click)="remove()"><app-icon name="trash" [size]="16" /> Delete workspace</button></div>
        </section>
      }
    }
  `,
  styles: `
    .danger-zone {
      margin-top: 16px;
      border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
    }
    .danger-zone h2 {
      font-size: 1rem;
      color: var(--danger);
      margin-bottom: 4px;
    }
  `,
})
export class WorkspaceSectionComponent {
  protected readonly ws = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  protected readonly timezones = allTimezones();
  protected readonly name = signal('');
  protected readonly timezone = signal('UTC');
  protected readonly gap = signal(0);
  protected readonly ai = signal(false);
  protected readonly saving = signal(false);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');

  constructor() {
    effect(() => {
      const w = this.ws.active();
      if (!w) return;
      this.name.set(w.name);
      this.timezone.set(w.timezone);
      this.gap.set(w.min_gap_minutes);
      this.ai.set(w.ai_enabled);
    });
  }

  protected save() {
    const w = this.ws.active();
    if (!w) return;
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    this.ws
      .update(w.id, {
        name: this.name().trim(),
        timezone: this.timezone(),
        min_gap_minutes: Number(this.gap()) || 0,
        ai_enabled: this.ai(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Workspace saved');
        },
        error: (err) => {
          this.saving.set(false);
          const { fields, general } = fieldErrors(err);
          this.fe.set(fields);
          this.general.set(general || (Object.keys(fields).length ? '' : 'Could not save.'));
        },
      });
  }

  protected async remove() {
    const w = this.ws.active();
    if (!w) return;
    const ok = await this.confirm.ask({
      title: `Delete ${w.name}?`,
      message: 'All channels, posts, media, campaigns and analytics in this workspace will be permanently deleted.',
      confirmLabel: 'Delete workspace',
      danger: true,
      typeToConfirm: w.name,
    });
    if (!ok) return;
    this.ws.remove(w.id).subscribe({
      next: () => {
        this.toast.success('Workspace deleted');
        this.router.navigateByUrl('/');
      },
      error: (err) => this.toast.error('Could not delete workspace', err),
    });
  }
}
