import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { backofficeGuard } from './guards/backoffice.guard';
import { permissionGuard } from './guards/permission.guard';
import { anonymousMatch } from './guards/anonymous.guard';
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
  // Account email flows. verify-email and reset-password open from an emailed link, so they work signed
  // in too (email change from Settings, a reset requested on another device).
  {
    path: 'check-inbox',
    loadComponent: () => import('./pages/auth/check-inbox/check-inbox').then((m) => m.CheckInbox),
    canActivate: [guestGuard],
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
    canActivate: [guestGuard],
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./pages/auth/verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  // Post permalink: signed-out visitors get a read-only preview (link previews come from the API's OG page);
  // signed-in users fall through to the full post inside the app (below).
  {
    path: 'posts/:id',
    canMatch: [anonymousMatch],
    loadComponent: () => import('./pages/post-permalink/public-post-page/public-post-page').then((m) => m.PublicPostPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      { path: 'feed', loadComponent: () => import('./pages/feed/feed').then((m) => m.Feed) },
      { path: 'games', loadComponent: () => import('./pages/games/games').then((m) => m.Games) },
      { path: 'clips', loadComponent: () => import('./pages/clips/clips').then((m) => m.Clips) },
      // Clip Player.dc.html — full player + queue (?from=hot|following|new, ?t=seconds).
      { path: 'clips/:id', loadComponent: () => import('./pages/clip-player/clip-player').then((m) => m.ClipPlayer) },
      { path: 'reviews', loadComponent: () => import('./pages/reviews/reviews').then((m) => m.Reviews) },
      { path: 'trophies', loadComponent: () => import('./pages/trophies/trophies').then((m) => m.Trophies) },
      { path: 'squads', loadComponent: () => import('./pages/squads/squads').then((m) => m.Squads) },
      {
        path: 'squads/:id',
        // flush: squad odası full-bleed çalışır — sol sidebar topbar'a yapışık ve
        // main kolondan bağımsız kayar (bkz. MainLayout.isFlush).
        // immersive: telefonda topbar ve alt tab bar gizlenir; oda kendi başlığını ve
        // en altta yazma alanını gösterir (bkz. MainLayout.isImmersive).
        data: { flush: true, immersive: true },
        loadComponent: () => import('./pages/squads/squad-room/squad-room').then((m) => m.SquadRoom),
      },
      { path: 'posts/:id', loadComponent: () => import('./pages/post-permalink/post-permalink').then((m) => m.PostPermalink) },
      { path: 'profile/:id', loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile) },
      { path: 'onboarding', loadComponent: () => import('./pages/onboarding/onboarding').then((m) => m.Onboarding) },
      // Account menu lists + header search (feed agent).
      { path: 'saved', data: { mode: 'saved' }, loadComponent: () => import('./pages/me/post-list/my-post-list').then((m) => m.MyPostList) },
      { path: 'me/clips', data: { mode: 'clips' }, loadComponent: () => import('./pages/me/post-list/my-post-list').then((m) => m.MyPostList) },
      { path: 'me/reviews', data: { mode: 'reviews' }, loadComponent: () => import('./pages/me/post-list/my-post-list').then((m) => m.MyPostList) },
      { path: 'drafts', loadComponent: () => import('./pages/me/drafts/drafts').then((m) => m.Drafts) },
      { path: 'search', loadComponent: () => import('./pages/search/search-results').then((m) => m.SearchResults) },
      // Account settings: profile, avatar, username, email, password.
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
      { path: 'notifications', loadComponent: () => import('./pages/notifications/notifications').then((m) => m.Notifications) },
      // DMs: one page for the list and the open thread (children carry only the id). Phones show the thread
      // full screen (immersive); flush lets the list and thread scroll on their own.
      {
        path: 'messages',
        loadComponent: () => import('./pages/messages/messages').then((m) => m.Messages),
        children: [
          { path: '', data: { flush: true }, children: [] },
          { path: ':conversationId', data: { flush: true, immersive: true }, children: [] },
        ],
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
      {
        path: 'moderation',
        canActivate: [permissionGuard(PERMISSIONS.ModerationManage)],
        loadComponent: () => import('./backoffice/moderation-admin/moderation-admin').then((m) => m.ModerationAdmin),
      },
    ],
  },
  { path: '**', redirectTo: 'feed' },
];
