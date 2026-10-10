import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { PlatformInfoService } from '../../core/platform-info.service';
import { IconComponent } from '../../shared/components/icon.component';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Shared header + tab strip for the superadmin console. */
@Component({
  selector: 'app-platform-header',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div>
        <div class="eyebrow platform-eyebrow">Platform</div>
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="actions"><ng-content /></div>
    </header>
    <nav class="tabs platform-tabs" aria-label="Platform sections">
      <a routerLink="/platform" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Overview</a>
      <a routerLink="/platform/organizations" routerLinkActive="active">Organizations</a>
      <a routerLink="/platform/users" routerLinkActive="active">Users</a>
      <a routerLink="/platform/health" routerLinkActive="active">Health</a>
      <a routerLink="/platform/ai-usage" routerLinkActive="active">AI usage</a>
      <a routerLink="/platform/plans" routerLinkActive="active">Plans</a>
      <a routerLink="/platform/settings" routerLinkActive="active">Settings</a>
    </nav>
    @if (info.publishingPaused()) {
      <div class="paused-warning" role="alert">
        <app-icon name="pause" [size]="18" />
        <div>
          <strong>All publishing is paused.</strong>
          The scheduler hands nothing to the workers; scheduled posts wait until publishing is resumed.
        </div>
        <a routerLink="/platform/settings" fragment="publishing" class="btn sm">Manage</a>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 22px;
    }
    .page-header {
      margin-bottom: 14px;
    }
    .platform-eyebrow {
      color: var(--coral) !important;
    }
    .platform-tabs a.active {
      border-bottom-color: var(--coral);
    }
    .paused-warning {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--danger-soft);
      border: 1.5px solid var(--danger);
      color: var(--text);
      font-size: 0.88rem;
    }
    .paused-warning app-icon {
      color: var(--danger);
    }
    .paused-warning div {
      flex: 1;
    }
  `,
})
export class PlatformHeaderComponent implements OnInit {
  protected readonly info = inject(PlatformInfoService);

  ngOnInit() {
    this.info.ensureSettings();
  }

  readonly title = input.required<string>();
  readonly subtitle = input('');
}
