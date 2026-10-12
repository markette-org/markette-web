import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkspaceService } from '../../core/workspace.service';
import { IconComponent } from '../../shared/components/icon.component';
import { ApiMcpSectionComponent } from './api-mcp-section.component';
import { MembersSectionComponent } from './members-section.component';
import { NotificationsSectionComponent } from './notifications-section.component';
import { ProfileSectionComponent } from './profile-section.component';
import { SlotsSectionComponent } from './slots-section.component';
import { TeamsSectionComponent } from './teams-section.component';
import { WorkspaceSectionComponent } from './workspace-section.component';

type Tab = 'workspace' | 'queue' | 'members' | 'teams' | 'notifications' | 'profile' | 'api';

@Component({
  selector: 'app-settings-page',
  imports: [IconComponent, WorkspaceSectionComponent, SlotsSectionComponent, MembersSectionComponent, TeamsSectionComponent, NotificationsSectionComponent, ProfileSectionComponent, ApiMcpSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <div class="eyebrow">{{ ws.active()?.name }}</div>
          <h1>Settings</h1>
          <p class="subtitle">Workspace preferences, posting queue, members, teams, notifications, your profile and API access.</p>
        </div>
      </header>

      <div class="tabs" role="tablist" aria-label="Settings sections">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            [id]="'tab-' + t.id"
            [attr.aria-selected]="tab() === t.id"
            [attr.aria-controls]="'panel-' + t.id"
            (click)="select(t.id)"
          >
            <app-icon [name]="t.icon" [size]="16" /> {{ t.label }}
          </button>
        }
      </div>

      <div class="panel" role="tabpanel" [id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()">
        @switch (tab()) {
          @case ('workspace') {
            <app-workspace-section />
          }
          @case ('queue') {
            <app-slots-section />
          }
          @case ('members') {
            <app-members-section />
          }
          @case ('teams') {
            <app-teams-section />
          }
          @case ('notifications') {
            <app-notifications-section />
          }
          @case ('profile') {
            <app-profile-section />
          }
          @case ('api') {
            <app-api-mcp-section />
          }
        }
      </div>
    </div>
  `,
  styles: `
    .panel {
      padding-top: 20px;
      max-width: 980px;
    }
  `,
})
export class SettingsPage implements OnInit {
  protected readonly ws = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'workspace', label: 'Workspace', icon: 'settings' },
    { id: 'queue', label: 'Queue', icon: 'queue' },
    { id: 'members', label: 'Members', icon: 'user' },
    { id: 'teams', label: 'Teams', icon: 'users' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'api', label: 'API & MCP', icon: 'lock' },
  ];
  protected readonly tab = signal<Tab>('workspace');

  ngOnInit() {
    this.route.fragment.subscribe((f) => {
      if (f && this.tabs.some((t) => t.id === f)) this.tab.set(f as Tab);
      if (f === 'mobile-app') {
        // Deep link from the user menu ("Install the app"): API & MCP tab, scrolled to the card.
        this.tab.set('api');
        setTimeout(() => document.getElementById('mobile-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
    });
  }

  protected select(t: Tab) {
    this.tab.set(t);
    this.router.navigate([], { relativeTo: this.route, fragment: t, replaceUrl: true });
  }
}
