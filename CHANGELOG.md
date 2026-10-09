# Frontend changelog

Newest first. One or two lines per change: what + why, with the key file/area. Move "Unreleased" under a
date when it's committed. Paths are relative to `GameSocial/src/app`.

## Unreleased
- Post permalinks `/posts/:id`: signed-out visitors match a public route first (`guards/anonymous.guard` `canMatch`) and get
  a read-only preview (`pages/post-permalink/public-post-page` + `public-post-view`: header with Sign in / Join, post,
  sign-in prompt; returnUrl brings them back); signed-in users fall through to the full `PostCard` inside the app
  (`pages/post-permalink`). Post card "Copy link" / "↗ Share" now use the permalink, with the native share sheet where the
  browser has one. Post notifications (other than clips, which open the player) go to the permalink.
- Settings → "Your data & account" (`pages/settings/settings-danger`): **Download my data** (JSON file, once per 24 h) and
  **Delete account…** (`account-delete-sheet`, password re-check; a captain gets the server's list of squads to hand
  over). On success the session is dropped and `/login` explains the 14-day grace period; signing in during it shows
  "your account deletion was cancelled". DM threads with a deleted account show a read-only note.
- Notifications: topbar bell with unread badge and a dropdown of the latest 8 (`layout/notification-bell`), the full list at
  `/notifications` (All/Unread, Load more), rows via `shared/notification-item` (copy built from the type in
  `notification-text.ts`; click = mark read + open the target). Live through the new user hub client
  `services/realtime/user-realtime.service` (`/api/hubs/me`, started by `main-layout`, stopped on logout/session end);
  badges live in `services/notification-center` (not to be confused with the toast `NotificationService`).
- Direct messages: `/messages` (conversation list) and `/messages/:id` (thread) in one page (`pages/messages`, list state in
  `inbox.store`); phones show the list, then the thread full screen (immersive) with a back button. Live messages, typing,
  "Seen", older pages on demand, Enter to send, read-only note when blocked / not allowed, report a message (⚑ →
  `ReportService`, type `DirectMessage`), "Delete for me" sheet. Topbar messages icon with the unread-conversations badge;
  profiles show **Message** when `canMessage`. Moderation queue knows the `DirectMessage` type.
- Safety: ··· menus on post cards, review cards, comments (feed, reviews, clip rail), the profile page, the squad chat
  (desktop hover ⚑ + phone "Mesajı bildir") and the squad peek sheet open one shared report sheet
  (`shared/report-sheet`, hosted once in `main-layout` via `ReportService.open(...)`). Block from post cards and profiles
  (`services/safety/block.service`): the author's cards vanish at once; a blocked profile shows an "unavailable" state with
  Unblock; the squad chat folds messages from people you blocked ("Göster"). `/settings` got Privacy (who can message,
  show online, profile activity for followers only) and Blocked users sections.
- Backoffice → Moderation (`Moderation.Manage`): report queue grouped by target (Open / Resolved, type chips), preview,
  latest note, Dismiss / Remove (reason) / Restore, Ban author, per-item history. Users page: Ban/Unban column + "Banned
  only" filter; both use `backoffice/ban-sheet`. A banned account's refresh (403 `AccountBanned`) and the hub's
  `sessionEnded` event end the session; `messageRemoved` drops a moderated chat message live.
- Account pages: register now goes to `/check-inbox` (resend with a 60 s cooldown) instead of signing in; `/verify-email`
  (sign-up and email-change links, then sign in → onboarding), `/forgot-password`, `/reset-password`. Login offers
  "Resend verification email" on the `EmailNotVerified` 403 and a "Forgot password?" link. Shared `pages/auth/auth-card`.
- `/settings` (account menu → Account settings): avatar upload/remove, bio, studio name (developers), username (cooldown),
  email change with pending/cancel, password change (adopts the new token pair). New `services/account`, `MeService.set/patch`,
  `shared/password-rules`. The profile page shows the real avatar, bio and studio name, with "Edit profile" on your own.
- New `shared/game-picker`: a searchable game combobox (Signal Forms control, id as text). It lists followed games first,
  searches the server and loads more on scroll; the list renders in the top layer. It replaces the catalogue `<select>`s
  (composer clip, poll, devlog, review sheet, clip upload, squad create). The catalogue is paged now, so pickers no longer
  download every game. Devlog and review pickers filter on the server (`ownedByMe`, `notReviewedByMe`).
- Paged lists:
  - Games page: server search + "Load more".
  - Onboarding: genre filter on the server + "Show more games".
  - Feed sidebar: first 50 follows, "Show more", and a server filter once there are more.
  - Backoffice games/users: search + `shared/pager`; users can be filtered to developer requests.
  - Follow state comes from `game.isFollowed`.
- `/search` has type tabs (All, Players, Games, Squads, Clips, Reviews, Posts). "All" shows a few of each with "See all";
  the other tabs page with "Load more". Squad results open the room for members and `/squads?q=` (hub search) for others.
- `GameLookup` (services/game) caches games by id, so a bare id (feed `?game=` label, preselected pickers) resolves
  without the whole catalogue. Removed the full-catalogue loads from feed, reviews, squad room and composer inputs.
- Session refresh: login keeps the new `refreshToken`; `POST /api/auth/refresh` renews the access token shortly before it
  expires and on a 401 (one shared request, then the original call is retried). Guards check expiry at call time, tabs share
  login/logout through `storage` events, and SignalR asks for a fresh token. Logout sends the refresh token so the server can drop it.
- Logout / account switch fires `AuthService.sessionEnded$`: `SquadRealtimeService.disconnect()` stops the hub connection and
  `MeService` forgets the previous profile, so the next login reconnects as the new user.
- Squad pins update live: the room listens to `pinChanged` (message pinned state, squad pin count, the open actions sheet).
- Squad room state moved into room-scoped stores (`squad-room/state/`: room, chat, library, voice sessions); the inline
  "Post to squad" and "Kanal ekle" sheets are now `squad-composer-sheet` / `squad-add-channel-sheet`.
- Sheets: `shared/overlay` adds `appDialog` (focus moves in, Tab is trapped, focus returns to the opener, Escape closes only the
  top-most sheet via `OverlayStack`) and `appBackdropClose` (closes only when the press and the click both land on the backdrop —
  a text selection dragged out of a sheet no longer closes it). Used by `sheet-modal`, `bottom-sheet`, `squad-sheet-frame`, `photo-viewer`.
  Page-level Escape handlers (drawer, topbar menu, chat attach) stand down while a sheet is open.
- Error states: Games, Profile (404 vs other errors, `switchMap`), Search and the squad room show a "Try again" card
  (`shared/load-error`) instead of an empty or "not found" page; the feed sidebar lists say when they failed. Error toasts use the
  server's message (`extractApiErrorMessage` now also reads ProblemDetails, plain-text bodies and gives 0 / 429 / 5xx their own text).
- Production build passes with no budget warnings: the composer is split into `composer-clip-panel`, `composer-screenshots-panel`,
  `composer-more-menu`, `poll-sheet`, `devlog-sheet`; post-card comments are `post-comments`; squad settings has
  `settings-games-picker` / `settings-members-tab`; clip-stage styles are split per chrome and its tracks use `appTrackDrag`;
  chips moved to `styles/_chips.scss`.
- Removed dead code: `pages/squads/last-squad-id.ts`, `hasSpoilers` / `richTextToPlain`. Search tiles use `appImg`.
- All forms moved to Signal Forms (`@angular/forms/signals`); FormsModule / ReactiveFormsModule / ngModel are gone. Login and
  register submit through `[formRoot]` + `submission.action` (server errors come back as form errors). Shared helpers in
  `shared/form-errors.ts` (`fieldError`, `submitError`, `serverError`). Length/min/max limits moved from attributes to schema rules.
- New `shared/select-control.ts` (`select[formField]`). Signal Forms' built-in select handling loops forever against Chrome's
  customizable `<select>` (`<selectedcontent>`) and crashed the tab when a sheet opened; this directive takes over as a
  custom control. Import it wherever a `<select [formField]>` is used.
- Session sheet: capacity outside 2–32 now shows "Spots must be between 2 and 32." (before, the button did nothing).
- Squads on phones (≤ 768px, from the "Tavern Squads — Mobile" prototype). The room route is `immersive` (no topbar /
  tab bar). `squad-room-header` replaces the banner, the sidebar becomes the ☰ drawer, the rail moves to
  `squad-members-sheet`, and a long press opens `squad-message-sheet` (7 reactions, pin, copy, profile). The composer's
  ▶ ▣ fold into a ＋ menu, clips stay 2 columns. The hub stacks search/buttons, puts the invite above "Your squads",
  shows friends as a strip, and makes the whole card the room link. New `shared/bottom-sheet`, `shared/media-query`.
- Room sidebar "Squad'larım" collapses (all sizes), collapsed by default and remembered (`arena.squadSidebar.squadsOpen`).
  The collapsed row still shows the other squads' icons and their unread total.
- Every feed clip now uses the "clip of the day" card: the clip-stage `feed` variant plus the "Öne çıkan yorumlar"
  thread. Only the badge differs ("CLIP OF THE DAY" / "CLIP"). The post's ··· menu (save, link, edit, delete) moved
  into the stage's buttons via the new `extraActions` input. Right to left the buttons are ⛶, mute, ···; feed
  cards have no speed button, while the Clips hero keeps it. The old inline card and its styles are no longer used in the feed.
- Feed autoplay is off: inline clips no longer start muted when scrolled into view; they play only when tapped,
  and a playing clip still pauses once it scrolls away (`clip-stage` `observeVisibility`).
- Feed and Clips card buttons share one order, right to left: ⛶ Clip Player, mute, speed (`clip-stage` feed/hero and
  inline variants). The inline card gained the speed button.
- The feed "clip of the day" ⛶ now opens the Clip Player like the inline card and the Clips hero. It used to open the
  fullscreen overlay, so the same button did different things.
- Post composer: below ~340px the post-type buttons wrap instead of scrolling the feed sideways (`post-composer.mobile.scss`).
- `/clips/:id` on phones uses the 9:16 vertical stage only for portrait clips. Landscape clips keep the full 16:9
  player, which lost half the picture and its controls before. Under 640px the control row drops the volume slider,
  ⏮ ⏭, CC and theater (`shared/clip-stage/clip-stage.mobile.scss`).
- Feed inline clips: tapping the picture plays/pauses in place; a new ⛶ button opens the Clip Player. It used to
  navigate on any tap, which felt like being sent to Clips (the Clips tab is active on `/clips/:id`).
- ≤ 600px: the feed "clip of the day" and the Clips hero letterbox the clip instead of cropping it, with a smaller overlay.
  The Clips hero box no longer cuts off the author row and progress bar.
- Phone navigation (≤ 768px): a new `layout/mobile-tab-bar` (Feed, Clips, Reviews, Squads, Trophies). The topbar keeps
  only the logo, a search icon that opens search full-width, and the avatar; the account menu opens as a bottom sheet
  (`topbar.mobile.scss`). Desktop is unchanged.
- Removed "Squads looking for you": the squads hub lists other squads only for a search or "Browse all".
- Backoffice games have a release date; the review sheet caps hours played to the time since release. Reviews copy
  no longer claims "tracked playtime".
- A post's owner can delete others' comments on it (feed card, `review-card` — which had no comment delete before —
  and `clip-rail-comments` via the new `postOwnerId` input).
- Post edit/delete for the author: "✎ Edit post" / "✕ Delete post" (click twice) in the feed card's ··· menu (the review
  layout gained the menu), and Edit/Delete pills on `review-card`. Editing uses the new `shared/post-edit-sheet`.
  Edited posts show "· edited". Vote buttons are disabled on your own posts.
- Comment editing ("Düzenle", "· düzenlendi") in `post-card`, `review-card` and `clip-rail-comments`.
- Register asks for a developer account instead of granting one. Backoffice → Users has a Developer checkbox with a
  "Requested" badge and a Decline button. The devlog composer only lists games owned by your account.
- The review sheet hides games you already reviewed (`me.reviewedGameIds`).
- Squad settings: "Yasakla" on members and join requests, plus a "Yasaklılar" list with "Yasağı kaldır". The room
  leaves to /squads when the server sends `removedFromSquad`.
- Removed the `/images` proxy (the backend no longer serves a default poster).
- Squads hub cards (`hub-squad-card`, `hub-discover-card`, `hub-peek-sheet`) use the squad placeholder
  instead of the name's initial. They have inline templates, so the earlier rollout had missed them.
- Every `<select>` now has a themed dropdown list (`styles.scss`, using `appearance: base-select` behind `@supports`).
  It's a dark sheet panel with hover rows, a red-tinted selected row with a ✓, and the arrow flips when open.
  Browsers without support keep the native list. `squad-create-sheet` dropped its hand-drawn ▾ in favour of it.
  Every select carries `<button><selectedcontent>` so a long value ends in "…" instead of wrapping the field.
  The list is capped at 360px wide and long options wrap.
- Removed the mini player (`shared/mini-player`). Leaving Clips or the Clip Player mid-clip no longer docks the clip
  in the corner, and the pin/resume logic is gone too. The shared Autoplay switch moved to `shared/clip-autoplay.service`.
- Feed `post-card` now shows comment replies: "N yanıt" loads them inline, and a new reply appears there and
  updates its top-level parent's count. Before this, only the count changed and replies were never fetched.
- New `shared/img-fallback` (`<img [appImg]="url" fallback="avatar|game|squad|banner">`) on every avatar, game cover,
  squad icon and the squad banner. It shows the new `assets/placeholder-*.svg` when the URL is empty or the file 404s.
  `proxy.conf.json` now also proxies `/images`, so the backend's default poster loads under `ng serve`.
  The squad banner no longer stretches that portrait default poster; it uses `placeholder-banner.svg` instead.
- Squad invites use a new `shared/player-picker`: an autocomplete with followed users first, then any player via
  `/api/search`, and only real accounts can be added. It's used in the create-squad sheet (＋ invite) and in
  `pages/squads/hub/hub-invite-sheet`, where picking someone sends the invite immediately. Previously free text
  was accepted, and a typo failed the whole create.

## 2026-10-01
- Login page rebranded: swinging tavern-sign logo (`NgOptimizedImage`, reduced-motion aware) and
  "Welcome back to the Tavern".
- Squad voice sessions switched off behind `environment.features.squadVoice = false` (room sidebar
  "Sesli sohbet", voice panel, session sheet, polling, "In voice" friend status). Components kept.
- Feed sidebar suggests 5 games with a ＋ follow button when you follow none; `/games` Follow button works.
  Previously following was only possible in onboarding (the two screens pointed at each other).
- Squads hub search also filters "Your squads" (discover excludes squads you're in). Requests are cancelled
  on change, the stale list is cleared, and failures show an error card with retry.

## 2026-09-30
- Squad sessions moved from the hub ("Open sessions right now" + bottom voice bar, now deleted) into the squad
  room sidebar under "Kanallar", Discord-style (`squad-sidebar`, `squad-voice-panel`). Currently flagged off.
- Reviews: "Games you play / Following / Newest" are real tabs (exactly one selected); a stale request
  can no longer overwrite the new tab. `?game=` deep link opens on Newest.

## 2026-09-10 → 09-11
- ARENA design rework: shared primitives (`.card`, `.btn`, `.chip`, `.page-head`, `.section-head`), photo
  viewer, photo posts, video cards; squads rework (hub + room).

## 2026-09-07 → 09-08
- Video processing state on posts; game genres; other users' profile pages; squad navigation fix.

## 2026-08-29 → 09-02
- Initial app UI, form controls, app title.
