# Frontend changelog

Newest first. One or two lines per change: what + why, with the key file/area. Move "Unreleased" under a
date when it's committed. Paths are relative to `GameSocial/src/app`.

## Unreleased
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
