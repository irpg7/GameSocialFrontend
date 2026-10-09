# GameSocial frontend (Tavern)

Angular 22 app in `GameSocial/` (run `ng`/`npm` commands there). Tavern (repo name GameSocial) is a social app for
gamers: feed (photo / clip / review / devlog / poll posts), clips, reviews, trophies, squads (Discord-like rooms with
channels and realtime chat). The UI calls it **Tavern**.
To catch up on an area, read its history: `git log --oneline -- <path>`, or `git log -S <symbol>`. Commit messages say what
changed and why.

## Skills
- Before writing or reviewing frontend code, load the `angular-developer` skill. It is Google's official skill from
  `angular/skills`, installed per machine with `npx skills add angular/skills`, not kept in this repo. If it's missing,
  tell the user instead of working without it.
- The skill holds the general Angular guidance; this file only adds project rules, and where they differ this file wins.
- Skip the skill's **testing** guides: no unit, harness, router or e2e tests, and no test files. Also skip its
  **Tailwind** guide, because this project styles with SCSS.
- Never use the .NET skills or agents (the `dotnet-claude-kit` plugin, enabled only in the backend repo) here.
- The backend is a separate repo next to this one: `../GameSocialBackend` (.NET 10, FastEndpoints, EF Core, SignalR).
  When you touch it, follow its `.claude/CLAUDE.md`. Its **Skills** section says which `dotnet-claude-kit` skills to
  use and which to avoid.

## Local dev
- `ng serve` (in `GameSocial/`) proxies `/api` (including SignalR hubs) and `/media` to `http://localhost:5234`
  (`proxy.conf.json`); the user usually has the API running.
- DB: Docker container `posgreslocal` (db `GameSocial`). Inspect read-only with
  `docker exec posgreslocal psql -U postgres -d GameSocial -c '<sql>'` (quote PascalCase names) — handy when a list
  renders empty. API calls need a JWT, so unauthenticated curl only shows 401.
- Verify with `npx ng build --configuration development` and `npx ng build` (production — passes with no budget warnings;
  keep it that way). No tests or test scripts: the user tests manually, so end with what they should check by hand.
- UI copy is English, except the squad room (sidebar/sheets), which is Turkish. All copy will move to translations
  later — don't reword existing text.
- Designs come from the ARENA mockups (Claude Design); comments like `05-squad.html L22` / `expl.html 2a` point into
  them. Match designs closely — read every state, don't approximate.
- Commit only when the user asks. Commit messages say what changed and why; that history replaces a changelog.

## Angular rules for this codebase (v22)
- Standalone only, and don't write `standalone: true`; OnPush is the default, don't set it.
- `input()` / `output()` / `model()`, `computed()` / `linkedSignal()`; no `@HostBinding` / `@HostListener` (use `host`).
- Native control flow; `class`/`style` bindings, not `ngClass`/`ngStyle`; `inject()`, not constructor injection.
- New singleton services use `@Service()`.
- Forms: Signal Forms only (`form()` + `[formField]`, `[formRoot]` + `submission.action`); no FormsModule/ngModel.
  Messages via `shared/form-errors.ts`. **Every `<select [formField]>` needs `SelectControl` (`shared/select-control.ts`)
  in the component's imports** — without it Chrome's customizable select loops with Signal Forms and crashes the tab.
  Limits go in the schema (`maxLength`, `min`, `max`), not as attributes (NG8022).
- Accessibility: WCAG AA (focus management, contrast, ARIA).

## Map (`GameSocial/src/app`)
- `pages/<page>/` — lazy routes from `app.routes.ts`; big pages split into child folders.
- `backoffice/` — admin area (games, languages, settings, users, moderation); `guards/` (auth, guest/anonymous,
  permission, backoffice).
- `services/<area>/` — one HTTP service per backend area (`@Service()` + `inject(HttpClient)`, URLs `/api/...`).
  Squads are split: `squad.service` (core/chat), `squad-room.service` (room data), `squad-hub.service`
  (discover/join/invites/sessions), `squad-realtime.service` (hub `/api/hubs/squads`).
  `realtime/user-realtime.service` is the always-on per-user hub (`/api/hubs/me`: notifications, DMs, badges), started by
  `main-layout` via `NotificationCenterService.start()`. `notification-center` = in-app notifications + topbar badges;
  `notification/NotificationService` = toasts (different thing).
- `models/*.model.ts` — mirror the backend's `Domain.Responses.*` (comments name the C# type). Enums are string unions.
- `layout/` — `main-layout`, `topbar`, `notification-bell`, `toast-list`.
- Current user: `AuthService.currentUser()` (JWT claims); full profile: `MeService.me()`.
- Feature flags: `src/environments/environment*.ts` → `environment.features` (`squadVoice: false`). Update both files.

## Shared building blocks (`shared/`) — reuse, don't re-create
- Overlays: every sheet/modal is its own component and uses `overlay/` (`appDialog` focus trap + top-most Escape via
  `OverlayStack`, `appBackdropClose`). Frames: `sheet-modal`, `bottom-sheet` (phone), `squad-create-sheet` /
  `squad-sheet-frame` (small sheets).
- Errors: `extractApiErrorMessage(err, fallback)` from `api-error.util.ts` for every server message; `load-error` for
  failed loads ("Try again").
- Pickers: `player-picker` (followed users first, then `/api/search`), `game-picker` (searchable; `[formField]` binds the
  id as text; never load the whole catalogue — use `GameLookup` to name a game by id).
- Lists from the API are paged (`PagedResult<T>`); `pager` for backoffice tables.
- `media-query.ts` (`mediaQuery(PHONE_QUERY)`) only for markup that differs on phones; styling stays in `@media`.
- Reports: `ReportService.open({ type, id, label })` — never add another report sheet. Blocked check:
  `BlockService.isBlocked(userId)`; the server already hides blocked users' content, the client only hides cards blocked
  mid-session and folds squad chat messages.
- Notification copy and click targets: `notification-item/notification-text.ts` (one place per type).

## Feature notes
- Account: signed-out pages use `pages/auth/auth-card` + `pages/auth/_auth-form.scss`; `/settings` sections live in
  `pages/settings/*` (`settings-danger` = data export + deletion). Account calls go through `services/account`, which
  keeps `MeService.me()` in sync and adopts new token pairs (`AuthService.applySession`). Password rules:
  `shared/password-rules.ts`.
- `/posts/:id` has two routes: a signed-out one first (`canMatch: [anonymousMatch]`, `post-permalink/public-post-page`, no
  main layout, never calls authenticated APIs) and the in-app one. Share links always point at `/posts/:id`; link
  previews come from the API's OG page via the reverse proxy, not from Angular.
- DMs: `/messages` is one page for list + thread (state in `inbox.store`); child routes carry only the id. Start one with
  `DirectMessageService.open(userId)`; only offer it when the profile says `canMessage`.
- Route data: `flush` (no content inset) and `immersive` (phones hide topbar + tab bar).

## Styling
- Tokens in `src/styles/_variables.scss` (`$color-*`, radius scale, `$font-family-mono`); primitives in `src/styles.scss`
  (`.card`, `.btn`, `.page-head`, `.section-head*`, `.mono`, `.visually-hidden`), `_form-controls.scss`, `_chips.scss`.
  Reuse them; don't re-derive px values.
- Palette: accent red + greys only (no yellow/indigo); avatars are rounded squares.
- Component styles: 8 kB warning / 16 kB error budget. Split big components; phone styles go in a sibling
  `*.mobile.scss` (`styleUrls`).
- Chip filter "tabs": exactly one selected, `role="tablist"`/`role="tab"` + `aria-selected`.
- Popovers inside sheets render in flow (the sheet body scrolls) or in the top layer with `popover` (as `game-picker`).
- List reloads on filter/search change: cancel the in-flight request and clear the old list, so a slow older response
  can't overwrite the new one.
