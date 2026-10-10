import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CatalogService } from '../../core/catalog.service';
import { fieldErrors } from '../../core/errors';
import { Campaign } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService } from '../../core/workspace.service';
import { ModalComponent } from '../../shared/components/modal.component';
import { addDays, todayYmd } from '../../shared/utils/dates';
import { PALETTE } from '../../shared/utils/format';

/** Create / edit campaign dialog. Pass `campaign` to edit, null to create. */
@Component({
  selector: 'app-campaign-form',
  imports: [ModalComponent, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      [open]="open()"
      [title]="campaign() ? 'Edit campaign' : 'New campaign'"
      subtitle="Group posts around a launch, an event or a theme. Campaign periods show up on the calendar."
      [dismissible]="!saving()"
      (closed)="closed.emit()"
    >
      <form id="campaign-form" class="form-grid" (ngSubmit)="save()" novalidate>
        <div class="field full">
          <label for="cf-name">Name</label>
          <input id="cf-name" name="name" class="input" [class.invalid]="fe()['name']" [(ngModel)]="name" placeholder="Spring launch" required />
          @if (fe()['name']) {
            <span class="error">{{ fe()['name'] }}</span>
          }
        </div>
        <div class="field">
          <label for="cf-start">Starts</label>
          <input id="cf-start" name="start" type="date" class="input" [class.invalid]="fe()['starts_on']" [(ngModel)]="startsOn" required />
          @if (fe()['starts_on']) {
            <span class="error">{{ fe()['starts_on'] }}</span>
          }
        </div>
        <div class="field">
          <label for="cf-end">Ends</label>
          <input id="cf-end" name="end" type="date" class="input" [class.invalid]="fe()['ends_on']" [(ngModel)]="endsOn" [min]="startsOn()" required />
          @if (fe()['ends_on']) {
            <span class="error">{{ fe()['ends_on'] }}</span>
          }
        </div>
        <div class="field full">
          <label for="cf-brief">Brief</label>
          <textarea id="cf-brief" name="brief" class="textarea" rows="5" [(ngModel)]="brief" placeholder="Goal, audience, key messages, links, tone of voice…"></textarea>
          <span class="hint">The AI planner uses the brief to draft posts for this campaign.</span>
        </div>
        <div class="field full">
          <span class="label" id="cf-color-label">Colour</span>
          <div class="row-wrap" role="radiogroup" aria-labelledby="cf-color-label">
            @for (c of palette; track c) {
              <button
                type="button"
                class="swatch"
                role="radio"
                [attr.aria-checked]="color() === c"
                [attr.aria-label]="c"
                [style.background]="c"
                (click)="color.set(c)"
              ></button>
            }
            <label class="swatch custom" [style.background]="color()" title="Custom colour">
              <span class="sr-only">Custom colour</span>
              <input type="color" name="color" [(ngModel)]="color" />
            </label>
          </div>
        </div>
        @if (error()) {
          <div class="form-error full" role="alert">{{ error() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()" [disabled]="saving()">Cancel</button>
        <button type="submit" form="campaign-form" class="btn primary" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          {{ campaign() ? 'Save changes' : 'Create campaign' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .swatch {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 0;
      cursor: pointer;
      box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px transparent;
      position: relative;
    }
    .swatch[aria-checked='true'] {
      box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text);
    }
    .swatch.custom {
      background-image: conic-gradient(from 0deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e) !important;
      display: inline-block;
    }
    .swatch.custom input {
      position: absolute;
      inset: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
  `,
})
export class CampaignFormComponent {
  private api = inject(ApiService);
  private catalog = inject(CatalogService);
  private toast = inject(ToastService);
  private ws = inject(WorkspaceService);

  readonly open = input(false);
  readonly campaign = input<Campaign | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Campaign>();

  protected readonly palette = PALETTE;
  protected readonly name = signal('');
  protected readonly brief = signal('');
  protected readonly startsOn = signal('');
  protected readonly endsOn = signal('');
  protected readonly color = signal(PALETTE[0]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly fe = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const c = this.campaign();
      const today = todayYmd(this.ws.timezone());
      this.name.set(c?.name ?? '');
      this.brief.set(c?.brief ?? '');
      this.startsOn.set(c?.starts_on ?? today);
      this.endsOn.set(c?.ends_on ?? addDays(today, 27));
      this.color.set(c?.color ?? PALETTE[this.catalog.campaigns().length % PALETTE.length]);
      this.error.set('');
      this.fe.set({});
      this.saving.set(false);
    });
  }

  protected save() {
    this.error.set('');
    this.fe.set({});
    if (!this.name().trim()) {
      this.fe.set({ name: 'Give the campaign a name.' });
      return;
    }
    if (!this.startsOn() || !this.endsOn()) {
      this.error.set('Choose a start and an end date.');
      return;
    }
    if (this.endsOn() < this.startsOn()) {
      this.fe.set({ ends_on: 'The campaign ends before it starts.' });
      return;
    }
    const body = {
      name: this.name().trim(),
      brief: this.brief(),
      starts_on: this.startsOn(),
      ends_on: this.endsOn(),
      color: this.color(),
    };
    const c = this.campaign();
    this.saving.set(true);
    const req = c ? this.api.patch<Campaign>(`campaigns/${c.id}/`, body) : this.api.post<Campaign>('campaigns/', body);
    req.subscribe({
      next: (saved) => {
        this.saving.set(false);
        const merged = { ...saved, post_count: saved.post_count ?? c?.post_count ?? 0 };
        this.catalog.upsertCampaign(merged);
        this.toast.success(c ? 'Campaign updated' : 'Campaign created');
        this.saved.emit(merged);
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        const known = ['name', 'starts_on', 'ends_on'];
        const other = Object.entries(fields)
          .filter(([k]) => !known.includes(k))
          .map(([k, v]) => `${k}: ${v}`);
        this.error.set([general, ...other].filter(Boolean).join('\n'));
      },
    });
  }
}
