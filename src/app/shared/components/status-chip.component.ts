import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const STYLES: Record<string, { cls: string; label: string }> = {
  draft: { cls: '', label: 'Draft' },
  scheduled: { cls: 'accent', label: 'Scheduled' },
  queued: { cls: 'info', label: 'Queued' },
  publishing: { cls: 'info', label: 'Publishing' },
  published: { cls: 'success', label: 'Published' },
  partial: { cls: 'warning', label: 'Partial' },
  unconfirmed: { cls: 'warning', label: 'Needs checking' },
  handoff: { cls: 'accent', label: 'Ready to upload' },
  failed: { cls: 'danger', label: 'Failed' },
  cancelled: { cls: 'outline', label: 'Cancelled' },
  active: { cls: 'success', label: 'Active' },
  needs_reauth: { cls: 'warning', label: 'Needs reconnect' },
  disabled: { cls: 'outline', label: 'Disabled' },
};

@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip {{ style().cls }}" [attr.title]="title() || null"
    ><span class="dot" [class.pulse]="status() === 'publishing' || status() === 'queued'"></span>{{ label() || style().label }}</span
  >`,
  styles: `
    :host {
      display: inline-flex;
    }
    .pulse {
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
    }
  `,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly label = input<string>('');
  readonly title = input<string>('');
  protected readonly style = computed(() => STYLES[this.status()] ?? { cls: '', label: this.status() });
}
