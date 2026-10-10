import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../shared/components/icon.component';

const STYLES: Record<string, { cls: string; label: string; icon: string }> = {
  pending: { cls: 'warning', label: 'Pending review', icon: 'clock' },
  changes_requested: { cls: 'danger', label: 'Changes requested', icon: 'edit' },
  approved: { cls: 'success', label: 'Approved', icon: 'check' },
};

/** Approval status chip; renders nothing for posts outside the approval workflow (''). */
@Component({
  selector: 'app-approval-chip',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (style(); as s) {
      <span class="chip {{ s.cls }}" [attr.title]="title() || null"><app-icon [name]="s.icon" [size]="12" />{{ s.label }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    :host:empty {
      display: none;
    }
  `,
})
export class ApprovalChipComponent {
  readonly status = input<string | null | undefined>('');
  readonly title = input('');
  protected readonly style = computed(() => STYLES[this.status() ?? ''] ?? null);
}
