# Frontend changelog

Newest first. One or two lines per change: what + why, with the key file/area. Move "Unreleased" under a
date when it's committed. Paths are relative to `GameSocial/src/app`.

## Unreleased
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
