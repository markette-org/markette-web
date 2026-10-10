import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceService } from '../../core/workspace.service';
import { IconComponent } from './icon.component';

/** Detects "used this month's AI allowance" messages and points to the billing card. */
export function isAiQuotaMessage(text: string | null | undefined): boolean {
  return /AI allowance/i.test(text ?? '');
}

@Component({
  selector: 'app-ai-quota-hint',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div class="notice accent quota" role="status">
        <app-icon name="sparkles" [size]="16" />
        <span>
          This organization has used its AI tokens for the month.
          @if (ws.isOrgAdmin()) {
            <a routerLink="/organization" [queryParams]="{ org: ws.active()?.organization }" fragment="billing">Upgrade the plan</a> — some plans include unlimited AI.
          } @else {
            Ask an organization admin to upgrade the plan, or wait until next month.
          }
        </span>
      </div>
    }
  `,
  styles: `
    .quota {
      margin-top: 8px;
    }
  `,
})
export class AiQuotaHintComponent {
  readonly message = input<string | null | undefined>('');
  protected readonly ws = inject(WorkspaceService);
  protected readonly show = computed(() => isAiQuotaMessage(this.message()));
}
