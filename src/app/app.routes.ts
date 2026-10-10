import { Component } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, serverGuard, superadminGuard, writerGuard } from './core/guards';

@Component({ selector: 'app-blank', template: '' })
class BlankComponent {}

export const routes: Routes = [
  {
    path: 'server',
    title: 'Connect to your server · Markette',
    loadComponent: () => import('./features/auth/server-setup.page').then((m) => m.ServerSetupPage),
  },
  {
    path: 'login',
    canActivate: [serverGuard, guestGuard],
    title: 'Sign in · Markette',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'sso/complete',
    title: 'Signing in · Markette',
    loadComponent: () => import('./features/auth/sso-complete.page').then((m) => m.SsoCompletePage),
  },
  {
    path: 'register',
    canActivate: [serverGuard],
    title: 'Create account · Markette',
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: '',
    canActivate: [serverGuard, authGuard],
    loadComponent: () => import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Dashboard · Markette',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'compose',
        canActivate: [writerGuard],
        title: 'Compose · Markette',
        loadComponent: () => import('./features/compose/compose.page').then((m) => m.ComposePage),
      },
      {
        path: 'posts/:id/edit',
        canActivate: [writerGuard],
        title: 'Edit post · Markette',
        loadComponent: () => import('./features/compose/compose.page').then((m) => m.ComposePage),
      },
      {
        path: 'posts/:id',
        title: 'Post · Markette',
        loadComponent: () => import('./features/posts/post-detail.page').then((m) => m.PostDetailPage),
      },
      {
        path: 'posts',
        title: 'Posts · Markette',
        loadComponent: () => import('./features/posts/posts.page').then((m) => m.PostsPage),
      },
      {
        path: 'calendar',
        title: 'Calendar · Markette',
        loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'analytics',
        title: 'Analytics · Markette',
        loadComponent: () => import('./features/analytics/analytics.page').then((m) => m.AnalyticsPage),
      },
      {
        path: 'best-times',
        title: 'Best times · Markette',
        loadComponent: () => import('./features/best-times/best-times.page').then((m) => m.BestTimesPage),
      },
      {
        path: 'campaigns/:id',
        title: 'Campaign · Markette',
        loadComponent: () => import('./features/campaigns/campaign-detail.page').then((m) => m.CampaignDetailPage),
      },
      {
        path: 'campaigns',
        title: 'Campaigns · Markette',
        loadComponent: () => import('./features/campaigns/campaigns.page').then((m) => m.CampaignsPage),
      },
      {
        path: 'channels/connect/:requestId',
        title: 'Choose accounts · Markette',
        loadComponent: () => import('./features/channels/connect-picker.page').then((m) => m.ConnectPickerPage),
      },
      {
        path: 'channels',
        title: 'Channels · Markette',
        loadComponent: () => import('./features/channels/channels.page').then((m) => m.ChannelsPage),
      },
      {
        path: 'settings',
        title: 'Settings · Markette',
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'organization',
        title: 'Organization · Markette',
        loadComponent: () => import('./features/organization/organization.page').then((m) => m.OrganizationPage),
      },
      {
        path: 'platform',
        canActivate: [superadminGuard],
        loadChildren: () => import('./features/platform/platform.routes').then((m) => m.PLATFORM_ROUTES),
      },
      { path: 'switching', component: BlankComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
