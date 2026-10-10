import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { fieldErrors } from '../../core/errors';
import { ToastService } from '../../core/toast.service';
import { WorkspaceService, browserTimezone } from '../../core/workspace.service';
import { ModalComponent } from '../../shared/components/modal.component';
import { allTimezones } from '../../shared/utils/dates';

/** "New organization" dialog: creates the org + its first workspace and switches to it. */
@Component({
  selector: 'app-new-org-dialog',
  imports: [FormsModule, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      [open]="open()"
      title="New organization"
      subtitle="A separate company or client account with its own workspaces, people and plan. You become its owner."
      (closed)="closed.emit()"
      [dismissible]="!busy()"
    >
      <form id="new-org-form" class="stack" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="new-org-name">Organization name</label>
          <input id="new-org-name" name="name" class="input" [class.invalid]="fe()['name']" [ngModel]="name()" (ngModelChange)="onName($event)" placeholder="e.g. Acme Inc." autocomplete="organization" required />
          @if (fe()['name']) {
            <span class="error">{{ fe()['name'] }}</span>
          }
        </div>
        <div class="field">
          <label for="new-org-ws">First workspace</label>
          <input id="new-org-ws" name="ws" class="input" [class.invalid]="fe()['workspace_name']" [ngModel]="wsName()" (ngModelChange)="onWsName($event)" [placeholder]="name() || 'Defaults to the organization name'" />
          @if (fe()['workspace_name']) {
            <span class="error">{{ fe()['workspace_name'] }}</span>
          } @else {
            <span class="hint">One brand or client. You can add more workspaces later.</span>
          }
        </div>
        <div class="field">
          <label for="new-org-tz">Time zone</label>
          <select id="new-org-tz" name="tz" class="select" [ngModel]="tz()" (ngModelChange)="tz.set($event)">
            @for (z of timezones; track z) {
              <option [value]="z">{{ z }}</option>
            }
          </select>
        </div>
        @if (error()) {
          <div class="form-error" role="alert">{{ error() }}</div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()" [disabled]="busy()">Cancel</button>
        <button type="submit" form="new-org-form" class="btn primary" [disabled]="busy()">
          @if (busy()) {
            <span class="spinner"></span>
          }
          Create organization
        </button>
      </div>
    </app-modal>
  `,
})
export class NewOrgDialogComponent {
  readonly open = input(false);
  readonly closed = output<void>();

  private readonly ws = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly timezones = allTimezones();
  protected readonly name = signal('');
  protected readonly wsName = signal('');
  private wsTouched = false;
  protected readonly tz = signal(browserTimezone());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fe = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      if (this.open()) {
        this.name.set('');
        this.wsName.set('');
        this.wsTouched = false;
        this.tz.set(this.ws.active()?.timezone || browserTimezone());
        this.error.set('');
        this.fe.set({});
      }
    });
  }

  protected onName(v: string) {
    this.name.set(v);
    if (!this.wsTouched) this.wsName.set(v);
  }

  protected onWsName(v: string) {
    this.wsTouched = true;
    this.wsName.set(v);
  }

  protected submit() {
    const name = this.name().trim();
    if (!name) {
      this.fe.set({ name: 'Give the organization a name.' });
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.fe.set({});
    this.ws.createOrganization({ name, workspace_name: this.wsName().trim() || name, timezone: this.tz() }).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.toast.success('Organization created', `Switched to ${res.workspace.name} in ${res.organization.name}.`);
        this.closed.emit();
        this.router.navigateByUrl('/channels');
      },
      error: (err) => {
        this.busy.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        const other = Object.entries(fields)
          .filter(([k]) => k !== 'name' && k !== 'workspace_name')
          .map(([, v]) => v);
        this.error.set([general, ...other].filter(Boolean).join('\n'));
      },
    });
  }
}
