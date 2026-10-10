import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { formatError } from '../../core/errors';
import { Slot } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { ProviderIconComponent } from '../../shared/components/provider-icon.component';
import { weekdayNames } from '../../shared/utils/dates';

@Component({
  selector: 'app-slots-section',
  imports: [FormsModule, IconComponent, ModalComponent, ProviderIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card stack">
      <div class="card-head">
        <div>
          <h2>Posting queue</h2>
          <p class="muted small">"Add to queue" puts a post in the next free slot. Times are in {{ ws.timezone() }}.</p>
        </div>
        @if (ws.canWrite()) {
          <button type="button" class="btn soft" (click)="presetOpen.set(true)"><app-icon name="zap" [size]="16" /> Apply preset</button>
        }
      </div>

      <div class="row-wrap scope">
        <label for="scope" class="strong small">Slots for</label>
        <div class="segmented" role="group" aria-label="Scope">
          <button type="button" [attr.aria-pressed]="kind() === 'ws'" (click)="setKind('ws')">Workspace-wide</button>
          <button type="button" [attr.aria-pressed]="kind() === 'team'" (click)="setKind('team')" [disabled]="!catalog.teams().length">Team</button>
          <button type="button" [attr.aria-pressed]="kind() === 'channel'" (click)="setKind('channel')" [disabled]="!catalog.channels().length">Channel</button>
        </div>
        @if (kind() === 'team') {
          <label for="scope-team" class="sr-only">Team</label>
          <select id="scope-team" class="select sm" style="width: auto; min-width: 220px" [ngModel]="scopeId()" (ngModelChange)="scopeId.set($event)">
            @for (t of catalog.teams(); track t.id) {
              <option [ngValue]="t.id">{{ t.name }}{{ teamCount(t.id) ? ' (' + teamCount(t.id) + ')' : '' }}</option>
            }
          </select>
        } @else if (kind() === 'channel') {
          <label for="scope-ch" class="sr-only">Channel</label>
          <select id="scope-ch" class="select sm" style="width: auto; min-width: 240px" [ngModel]="scopeId()" (ngModelChange)="scopeId.set($event)">
            <optgroup label="Relevant to this workspace">
              @for (ch of catalog.relevantChannels(); track ch.id) {
                <option [ngValue]="ch.id">{{ ch.name }} · {{ ch.provider_label }}{{ channelCount(ch.id) ? ' (' + channelCount(ch.id) + ')' : '' }}</option>
              }
            </optgroup>
            @if (catalog.otherChannels().length) {
              <optgroup label="More from your organization">
                @for (ch of catalog.otherChannels(); track ch.id) {
                  <option [ngValue]="ch.id">{{ ch.name }} · {{ ch.provider_label }}{{ channelCount(ch.id) ? ' (' + channelCount(ch.id) + ')' : '' }}</option>
                }
              </optgroup>
            }
          </select>
        }
        @if (scopeChannel(); as ch) {
          <app-provider-icon [provider]="ch.provider" [size]="20" />
        }
      </div>
      <p class="notice small">
        <app-icon name="info" [size]="16" />
        <span>
          Each channel uses its own slots first, then the slots of its teams, then the workspace-wide slots.
          @if (kind() === 'ws') {
            Workspace-wide slots apply to channels with no channel or team slots. The preset only replaces these.
          } @else if (kind() === 'team') {
            Team slots apply to the team's channels that have no slots of their own.
            @if (!scopedSlots().length) {
              This team has none yet, so its channels follow the workspace-wide queue.
            }
          } @else if (scopedSlots().length) {
            This channel uses its own slots below; team and workspace-wide slots are ignored for it.
          } @else {
            This channel has no slots of its own, so it follows its team's or the workspace-wide queue.
          }
        </span>
      </p>

      @if (loading()) {
        <div class="skeleton" style="height: 280px"></div>
      } @else {
        <div class="week" role="table" aria-label="Weekly posting slots">
          @for (d of days; track $index; let wd = $index) {
            <div class="day-row" role="row">
              <div class="day-name" role="rowheader">{{ d }}</div>
              <div class="times" role="cell">
                @for (s of byDay()[wd]; track s.id) {
                  <span class="slot" [class.off]="!s.active">
                    @if (ws.canWrite()) {
                      <button type="button" class="slot-toggle tabular" (click)="toggle(s)" [attr.aria-pressed]="s.active" [attr.title]="s.active ? 'Active — click to pause' : 'Paused — click to activate'">
                        {{ short(s.time) }}
                      </button>
                      <button type="button" class="slot-del" (click)="remove(s)" [attr.aria-label]="'Delete ' + d + ' ' + short(s.time)"><app-icon name="x" [size]="12" /></button>
                    } @else {
                      <span class="slot-toggle tabular">{{ short(s.time) }}</span>
                    }
                  </span>
                } @empty {
                  <span class="muted tiny">No slots</span>
                }
              </div>
              @if (ws.canWrite()) {
                <form class="add" (ngSubmit)="add(wd)">
                  <label class="sr-only" [for]="'add-' + wd">New time for {{ d }}</label>
                  <input [id]="'add-' + wd" type="time" class="input sm" [name]="'t' + wd" [ngModel]="draft()[wd] || ''" (ngModelChange)="setDraft(wd, $event)" />
                  <button type="submit" class="btn sm icon" [disabled]="!draft()[wd] || busy()" [attr.aria-label]="'Add time on ' + d"><app-icon name="plus" [size]="14" /></button>
                </form>
              }
            </div>
          }
        </div>
        <p class="muted tiny">{{ scopedSlots().length }} slots · {{ activeCount() }} active. Click a time to pause or resume it.</p>
      }
    </section>

    <app-modal [open]="presetOpen()" title="Apply a queue preset" subtitle="Replaces all workspace-wide slots. Channel and team slots are kept." (closed)="presetOpen.set(false)">
      <div class="stack">
        <div class="field">
          <label for="p-times">Times (comma separated, 24h)</label>
          <input id="p-times" class="input" [(ngModel)]="presetTimes" placeholder="09:15, 12:30, 17:45" />
        </div>
        <fieldset class="field" style="border: 0; padding: 0; margin: 0">
          <legend class="label" style="margin-bottom: 6px">Days</legend>
          <div class="row-wrap">
            @for (d of days; track $index; let wd = $index) {
              <label class="checkbox"><input type="checkbox" [checked]="presetDays().includes(wd)" (change)="togglePresetDay(wd)" /> {{ d }}</label>
            }
          </div>
        </fieldset>
        @if (presetError()) {
          <div class="form-error" role="alert">{{ presetError() }}</div>
        }
      </div>
      <div modal-footer>
        <button type="button" class="btn" (click)="presetOpen.set(false)">Cancel</button>
        <button type="button" class="btn primary" (click)="applyPreset()" [disabled]="busy()">
          @if (busy()) {
            <span class="spinner"></span>
          }
          Replace workspace slots
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .scope {
      gap: 10px;
    }
    .week {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }
    .day-row {
      display: grid;
      grid-template-columns: 70px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    .day-row:last-child {
      border-bottom: 0;
    }
    .day-row:nth-child(n + 6) {
      background: var(--surface-2);
    }
    .day-name {
      font-weight: 700;
      font-size: 0.88rem;
    }
    .times {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 30px;
      align-items: center;
    }
    .slot {
      display: inline-flex;
      align-items: center;
      border-radius: 8px;
      background: var(--accent-soft);
      color: var(--accent-ink);
      font-weight: 700;
      font-size: 0.82rem;
      overflow: hidden;
    }
    .slot.off {
      background: var(--bg-sunken);
      color: var(--muted);
      text-decoration: line-through;
    }
    .slot-toggle,
    .slot-del {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      padding: 5px 8px;
    }
    .slot-del {
      padding: 5px 6px 5px 2px;
      opacity: 0.6;
    }
    .slot-del:hover {
      opacity: 1;
    }
    .add {
      display: flex;
      gap: 6px;
    }
    .add .input {
      width: 120px;
    }
    @media (max-width: 640px) {
      .day-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
    }
  `,
})
export class SlotsSectionComponent implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  protected readonly catalog = inject(CatalogService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly days = weekdayNames('short');
  protected readonly slots = signal<Slot[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly kind = signal<'ws' | 'team' | 'channel'>('ws');
  protected readonly scopeId = signal<number | null>(null);
  protected readonly draft = signal<Record<number, string>>({});

  protected readonly presetOpen = signal(false);
  protected readonly presetTimes = signal('09:15, 12:30, 17:45');
  protected readonly presetDays = signal<number[]>([0, 1, 2, 3, 4]);
  protected readonly presetError = signal('');

  protected readonly scopeChannel = computed(() => (this.kind() === 'channel' ? this.catalog.channel(this.scopeId()) : undefined));
  protected readonly scopedSlots = computed(() => {
    const k = this.kind();
    const id = this.scopeId();
    return this.slots().filter((s) => {
      const ch = s.channel ?? null;
      const team = s.team ?? null;
      if (k === 'ws') return ch === null && team === null;
      if (k === 'team') return ch === null && team === id;
      return ch === id;
    });
  });
  protected readonly activeCount = computed(() => this.scopedSlots().filter((s) => s.active).length);
  protected readonly byDay = computed(() => {
    const rows: Slot[][] = Array.from({ length: 7 }, () => []);
    for (const s of this.scopedSlots()) rows[s.weekday]?.push(s);
    rows.forEach((r) => r.sort((a, b) => a.time.localeCompare(b.time)));
    return rows;
  });

  ngOnInit() {
    this.catalog.loadChannels().subscribe({ error: () => undefined });
    this.catalog.loadTeams().subscribe({ error: () => undefined });
    this.load();
  }

  private load() {
    this.api.get<Slot[]>('slots/').subscribe({
      next: (s) => {
        this.slots.set(Array.isArray(s) ? s : []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Could not load queue slots', err);
      },
    });
  }

  protected setKind(k: 'ws' | 'team' | 'channel') {
    this.kind.set(k);
    this.scopeId.set(k === 'team' ? (this.catalog.teams()[0]?.id ?? null) : k === 'channel' ? ((this.catalog.relevantChannels()[0] ?? this.catalog.channels()[0])?.id ?? null) : null);
  }

  protected teamCount(id: number) {
    return this.slots().filter((s) => s.team === id && !s.channel).length;
  }

  protected channelCount(id: number) {
    return this.slots().filter((s) => s.channel === id).length;
  }

  protected short(t: string) {
    return t.slice(0, 5);
  }

  protected setDraft(wd: number, v: string) {
    this.draft.update((d) => ({ ...d, [wd]: v }));
  }

  protected add(wd: number) {
    const t = this.draft()[wd];
    if (!t) return;
    if (this.byDay()[wd].some((s) => s.time.slice(0, 5) === t.slice(0, 5))) {
      this.toast.info('Already in the queue', `${this.days[wd]} ${t} exists.`);
      return;
    }
    this.busy.set(true);
    const k = this.kind();
    if (k !== 'ws' && this.scopeId() === null) return;
    const scope = { channel: k === 'channel' ? this.scopeId() : null, team: k === 'team' ? this.scopeId() : null };
    this.api.post<Slot>('slots/', { ...scope, weekday: wd, time: t, active: true }).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.slots.update((list) => [...list, s]);
        this.setDraft(wd, '');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error('Could not add slot', err);
      },
    });
  }

  protected toggle(s: Slot) {
    this.api.patch<Slot>(`slots/${s.id}/`, { active: !s.active }).subscribe({
      next: (u) => this.slots.update((list) => list.map((x) => (x.id === u.id ? u : x))),
      error: (err) => this.toast.error('Could not update slot', err),
    });
  }

  protected remove(s: Slot) {
    this.api.delete(`slots/${s.id}/`).subscribe({
      next: () => this.slots.update((list) => list.filter((x) => x.id !== s.id)),
      error: (err) => this.toast.error('Could not delete slot', err),
    });
  }

  protected togglePresetDay(wd: number) {
    this.presetDays.update((d) => (d.includes(wd) ? d.filter((x) => x !== wd) : [...d, wd].sort()));
  }

  protected async applyPreset() {
    const times = this.presetTimes()
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const bad = times.filter((t) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t));
    if (!times.length || bad.length) {
      this.presetError.set(bad.length ? `Not a valid time: ${bad.join(', ')}` : 'Enter at least one time.');
      return;
    }
    if (!this.presetDays().length) {
      this.presetError.set('Pick at least one day.');
      return;
    }
    this.presetError.set('');
    const existing = this.slots().filter((s) => s.channel === null && !s.team).length;
    if (existing) {
      this.presetOpen.set(false);
      const ok = await this.confirm.ask({
        title: 'Replace workspace-wide slots?',
        message: `The ${existing} existing workspace-wide slots will be deleted and replaced by ${times.length * this.presetDays().length} new ones.`,
        confirmLabel: 'Replace slots',
        danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(true);
    const padded = times.map((t) => t.padStart(5, '0'));
    this.api.post<Slot[]>('slots/preset/', { times: padded, weekdays: this.presetDays() }).subscribe({
      next: (list) => {
        this.busy.set(false);
        this.presetOpen.set(false);
        this.slots.set(list);
        this.kind.set('ws');
        this.scopeId.set(null);
        this.toast.success('Queue updated', `${padded.length * this.presetDays().length} workspace-wide slots created.`);
      },
      error: (err) => {
        this.busy.set(false);
        this.presetError.set(formatError(err));
        this.presetOpen.set(true);
      },
    });
  }
}
