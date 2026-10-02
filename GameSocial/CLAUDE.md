You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## This project (Tavern / GameSocial frontend)

Recent work and the reasoning behind it: `../CHANGELOG.md` — read it before starting in an area you haven't
touched this session.

### Skills
- Load the `angular-developer` skill before writing or reviewing frontend code (components, signals, forms,
  routing, styling, tests). Its guidance applies on top of the rules in this file; where they differ, this file wins.

### Workspace (shared with the backend repo)
Tavern (repo name GameSocial) is a social app for gamers: feed (photo / clip / review / devlog / poll posts),
clips, reviews, trophies, squads (Discord-like rooms with channels and realtime chat). The UI calls it **Tavern**.
The backend is a separate git repo next to this one: `../../GameSocialBackend` (.NET 10, FastEndpoints,
EF Core + Npgsql, SignalR). It has its own `CLAUDE.md` and `CHANGELOG.md`.

- Local dev: `ng serve` proxies `/api` (including the SignalR hub, ws) and `/media` to the API at
  `http://localhost:5234` (`proxy.conf.json`); the user usually has the API running.
  DB is the Docker container `posgreslocal` (Postgres, db `GameSocial`). Inspect it read-only with
  `docker exec posgreslocal psql -U postgres -d GameSocial -c '<sql>'` (quote PascalCase names) —
  handy when a list renders empty. API calls need a JWT, so unauthenticated curl only shows 401.
- Verify with `npx ng build --configuration development`. The default (production) build fails on pre-existing
  CSS budget errors in `post-composer.scss` / `clip-stage.scss` — not a regression. Say exactly what was and
  wasn't exercised.
- UI copy is English, except the squad room (sidebar/sheets), which is Turkish.
- Designs come from the ARENA mockups (Claude Design); comments like `05-squad.html L22` / `expl.html 2a`
  point into them. Match designs closely — read every state, don't approximate.
- After a meaningful change, add a line to `../CHANGELOG.md` (newest first, 1–2 lines, what + why).

### Map (`src/app`)
- `pages/<page>/` — lazy routes from `app.routes.ts` (feed, games, clips, clips/:id, reviews, trophies, squads,
  squads/:id, profile/:id, onboarding, saved, me/*, drafts, search). Big pages split into child folders
  (`pages/feed/feed-sidebar`, `pages/squads/squad-room/squad-sidebar`, `pages/squads/hub/*`).
- `backoffice/` — admin area (games, languages, settings, users); `guards/` (auth, guest, permission, backoffice).
- `services/<area>/` — one HTTP service per backend area, `@Service()` + `inject(HttpClient)`, URLs `/api/...`.
  Squads are split: `squad.service` (core/chat), `squad-room.service` (room data), `squad-hub.service`
  (discover/join/invites/sessions), `squad-realtime.service` (SignalR hub `/api/hubs/squads`).
- `models/*.model.ts` — mirror `Domain.Responses.*` (comments name the C# type). Enums are string unions.
- `shared/` — reusable UI: `sheet-modal`, `squad-create-sheet` (+ `squad-sheet-frame` for small sheets),
  `player-picker` (username combobox: followed users first, then `/api/search`; only real accounts),
  `review-sheet`, `clip-stage`, `photo-viewer`, `star-rating`, `api-error.util.ts`
  (`extractApiErrorMessage(err, fallback)` — always use it for server messages), `bottom-sheet` (phone sheet),
  `media-query.ts` (`mediaQuery(PHONE_QUERY)` signal — only for markup that differs on phones; styling stays in
  `@media`). Phone styles go in a sibling `*.mobile.scss` (styleUrls) to stay under the CSS budget.
- Route data: `flush` (no content inset) and `immersive` (phones hide topbar + tab bar; the squad room).
- `layout/` — `main-layout`, `topbar` (brand: `assets/tavern-logo.png` + "Tavern"), `toast-list`.
- Toasts: `NotificationService.success()/error()`. Current user: `AuthService.currentUser()` (from JWT claims);
  full profile: `MeService.me()`.
- Feature flags: `src/environments/environment*.ts` → `environment.features` (`squadVoice: false` hides squad
  voice sessions everywhere). Update both files.

### Styling
- Tokens in `src/styles/_variables.scss` (`$color-*`, radius scale, `$font-family-mono`); shared primitives in
  `src/styles.scss` (`.card`, `.btn`, `.page-head`/`.page-sub`, `.section-head*`, `.mono`, `.visually-hidden`)
  and `src/styles/_form-controls.scss` (`.chip`, `.chip-divider`). Reuse them; don't re-derive px values.
- Palette: accent red + greys only (no yellow/indigo); avatars are rounded squares.
- Component styles have an 8 kB warning / 16 kB error budget — split big components instead of growing one file.

### Patterns
- Filter "tabs" made of chips: exactly one selected, `role="tablist"`/`role="tab"` + `aria-selected`.
- List reloads on filter/search change: cancel the in-flight request (keep the `Subscription`, unsubscribe)
  and clear the old list, so a slow older response can't overwrite the new one.
- Popovers inside sheets: the sheet body scrolls, so render suggestion lists in flow, not absolutely positioned.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
