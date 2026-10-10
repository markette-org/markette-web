import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { fieldErrors } from '../../core/errors';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { allTimezones } from '../../shared/utils/dates';

@Component({
  selector: 'app-profile-section',
  imports: [FormsModule, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="card stack" (ngSubmit)="save()" id="profile">
      <div class="row" style="gap: 14px">
        <app-avatar [name]="auth.user()?.name || auth.user()?.email || ''" [size]="52" color="var(--accent)" />
        <div>
          <h2>Your profile</h2>
          <p class="muted small">{{ auth.user()?.email }}</p>
        </div>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="p-name">Name</label>
          <input id="p-name" name="name" class="input" [(ngModel)]="name" autocomplete="name" [class.invalid]="fe()['name']" />
          @if (fe()['name']) {
            <span class="error">{{ fe()['name'] }}</span>
          }
        </div>
        <div class="field">
          <label for="p-tz">Your time zone</label>
          <select id="p-tz" name="tz" class="select" [(ngModel)]="timezone">
            @for (tz of timezones; track tz) {
              <option [value]="tz">{{ tz }}</option>
            }
          </select>
          @if (fe()['timezone']) {
            <span class="error">{{ fe()['timezone'] }}</span>
          } @else {
            <span class="hint">Scheduling always uses the workspace time zone; this is your personal default.</span>
          }
        </div>
      </div>
      @if (general()) {
        <div class="form-error" role="alert">{{ general() }}</div>
      }
      <div>
        <button type="submit" class="btn primary" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          Save profile
        </button>
      </div>
    </form>
  `,
})
export class ProfileSectionComponent {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly timezones = allTimezones();
  protected readonly name = signal('');
  protected readonly timezone = signal('UTC');
  protected readonly saving = signal(false);
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly general = signal('');

  constructor() {
    effect(() => {
      const u = this.auth.user();
      if (!u) return;
      this.name.set(u.name);
      this.timezone.set(u.timezone || 'UTC');
    });
  }

  protected save() {
    this.saving.set(true);
    this.fe.set({});
    this.general.set('');
    this.auth.updateMe({ name: this.name().trim(), timezone: this.timezone() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Profile saved');
      },
      error: (err) => {
        this.saving.set(false);
        const { fields, general } = fieldErrors(err);
        this.fe.set(fields);
        this.general.set(general);
      },
    });
  }
}
