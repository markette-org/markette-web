import { Routes } from '@angular/router';

export const PLATFORM_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Platform · Markette',
    loadComponent: () => import('./overview.page').then((m) => m.PlatformOverviewPage),
  },
  {
    path: 'organizations/:id',
    title: 'Organization · Platform · Markette',
    loadComponent: () => import('./organization-detail.page').then((m) => m.PlatformOrganizationDetailPage),
  },
  {
    path: 'organizations',
    title: 'Organizations · Platform · Markette',
    loadComponent: () => import('./organizations.page').then((m) => m.PlatformOrganizationsPage),
  },
  {
    path: 'users',
    title: 'Users · Platform · Markette',
    loadComponent: () => import('./users.page').then((m) => m.PlatformUsersPage),
  },
  {
    path: 'health',
    title: 'Health · Platform · Markette',
    loadComponent: () => import('./health.page').then((m) => m.PlatformHealthPage),
  },
  {
    path: 'settings',
    title: 'Settings · Platform · Markette',
    loadComponent: () => import('./settings.page').then((m) => m.PlatformSettingsPage),
  },
  {
    path: 'plans',
    title: 'Plans · Platform · Markette',
    loadComponent: () => import('./plans.page').then((m) => m.PlatformPlansPage),
  },
  {
    path: 'ai-usage',
    title: 'AI usage · Platform · Markette',
    loadComponent: () => import('./ai-usage.page').then((m) => m.PlatformAiUsagePage),
  },
];
