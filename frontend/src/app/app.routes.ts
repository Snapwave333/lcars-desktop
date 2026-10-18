import { Routes } from '@angular/router';
import type { IconName } from './shared/icon-data';

export interface NavItem {
  path: string;
  title: string;
  label: string;
  code: string;
  color: string;
  key: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { path: 'files', icon: 'folder_open', title: 'FILE SYSTEMS', label: 'FILES', code: '01', color: 'c-frame-a', key: '1' },
  { path: 'apps', icon: 'apps', title: 'APPLICATIONS', label: 'APPS', code: '02', color: 'c-frame-d', key: '2' },
  { path: 'sensors', icon: 'radar', title: 'SENSOR ARRAY', label: 'SENSORS', code: '03', color: 'c-frame-b', key: '3' },
  { path: 'tools', icon: 'build', title: 'ENGINEERING', label: 'TOOLS', code: '04', color: 'c-frame-c', key: '4' },
  { path: 'config', icon: 'tune', title: 'CONFIGURATION', label: 'CONFIG', code: '05', color: 'c-frame-d', key: '5' },
  { path: 'log', icon: 'history', title: 'ACTIVITY LOG', label: 'LOG', code: '06', color: 'c-frame-b', key: '6' },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'files' },
  { path: 'files', data: { nav: NAV[0] }, loadComponent: () => import('./features/files/files').then((m) => m.FilesPage) },
  { path: 'apps', data: { nav: NAV[1] }, loadComponent: () => import('./features/apps/apps').then((m) => m.AppsPage) },
  { path: 'sensors', data: { nav: NAV[2] }, loadComponent: () => import('./features/sensors/sensors').then((m) => m.SensorsPage) },
  { path: 'tools', data: { nav: NAV[3] }, loadComponent: () => import('./features/tools/tools').then((m) => m.ToolsPage) },
  { path: 'config', data: { nav: NAV[4] }, loadComponent: () => import('./features/config/config').then((m) => m.ConfigPage) },
  { path: 'log', data: { nav: NAV[5] }, loadComponent: () => import('./features/activity/activity').then((m) => m.ActivityPage) },
  { path: '**', redirectTo: 'files' },
];
