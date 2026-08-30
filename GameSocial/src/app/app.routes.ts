import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { backofficeGuard } from './guards/backoffice.guard';
import { permissionGuard } from './guards/permission.guard';
import { PERMISSIONS } from './constants/permissions';

export const routes: Routes = [
  { path: '', redirectTo: 'feed', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
    canActivate: [guestGuard],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      { path: 'feed', loadComponent: () => import('./pages/feed/feed').then((m) => m.Feed) },
      { path: 'games', loadComponent: () => import('./pages/games/games').then((m) => m.Games) },
      { path: 'clips', loadComponent: () => import('./pages/clips/clips').then((m) => m.Clips) },
      { path: 'reviews', loadComponent: () => import('./pages/reviews/reviews').then((m) => m.Reviews) },
      { path: 'trophies', loadComponent: () => import('./pages/trophies/trophies').then((m) => m.Trophies) },
      { path: 'squads', loadComponent: () => import('./pages/squads/squads').then((m) => m.Squads) },
      {
        path: 'squads/:id',
        loadComponent: () => import('./pages/squads/squad-room/squad-room').then((m) => m.SquadRoom),
      },
    ],
  },
  {
    path: 'backoffice',
    canActivate: [authGuard, backofficeGuard],
    loadComponent: () => import('./backoffice/backoffice-layout/backoffice-layout').then((m) => m.BackofficeLayout),
    children: [
      { path: '', redirectTo: 'games', pathMatch: 'full' },
      {
        path: 'games',
        canActivate: [permissionGuard(PERMISSIONS.GameManage)],
        loadComponent: () => import('./backoffice/games-admin/games-admin').then((m) => m.GamesAdmin),
      },
      {
        path: 'languages',
        canActivate: [permissionGuard(PERMISSIONS.TranslationsManage)],
        loadComponent: () => import('./backoffice/translations-admin/translations-admin').then((m) => m.TranslationsAdmin),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard(PERMISSIONS.SettingsManage)],
        loadComponent: () => import('./backoffice/settings-admin/settings-admin').then((m) => m.SettingsAdmin),
      },
      {
        path: 'users',
        canActivate: [permissionGuard(PERMISSIONS.UsersManage)],
        loadComponent: () => import('./backoffice/users-admin/users-admin').then((m) => m.UsersAdmin),
      },
    ],
  },
  { path: '**', redirectTo: 'feed' },
];
