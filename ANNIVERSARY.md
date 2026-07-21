# Anniversary system

Documentation for the anniversary feature built into `index.html`. This file
covers **Phase 1 (data model)**, which is implemented. Later sections
(engine, cards, Record tab) are stubbed here and will be filled in as those
phases land.

## Data model

Every "site" — both a user pin (`user.pins[]`) and a user overlay on a
built-in surveyed site (`user.extras[baseSiteId]`) — carries these fields:

| field             | type                          | meaning                                             |
|-------------------|-------------------------------|-----------------------------------------------------|
| `firstVisit`      | `"YYYY-MM-DD"` \| `null`      | anchor for visit anniversaries                      |
| `lastVisit`       | `"YYYY-MM-DD"` \| `null`      | most recent visit                                   |
| `demolishedDate`  | `"YYYY-MM-DD"` \| `null`      | anchor for memorial anniversaries                   |
| `demolitionNoted` | `"YYYY-MM-DD"` \| `null`      | when you found out (often much later)               |
| `built`           | `"YYYY"` \| `"YYYY-MM-DD"` \| `null` | optional; enables building-age lines         |

### Dates are strings, never `Date` objects

All dates are stored as plain `YYYY-MM-DD` **strings**. Never store `Date`
objects or timestamps: timezone drift would otherwise push an 11 pm photo onto
the wrong calendar day. All comparisons must be done on the string parts.
Helpers: `ymd(dateObj)` formats a `Date` to a local `YYYY-MM-DD` string;
`todayYMD()` returns today's.

### Photos

Photos migrated from bare strings to objects:

```js
{ src: "data:image/jpeg;..." | "photos/xyz.jpg", date: "YYYY-MM-DD" | null, caption?: string }
```

`src` is either an inline data URL (not yet synced) or a repo-relative path
(after a GitHub sync). Two helpers abstract the shape: `photoSrc(ph)` and
`photoDate(ph)` — always go through them so legacy strings still work.

- **On upload**, EXIF `DateTimeOriginal` is read from the original JPEG's APP1
  segment *before* the canvas re-encode strips it (the strip is intentional).
  The parse is dependency-free (`parseExif` / `parseTiff`). The extracted date
  becomes the photo's `date`.
- **Manual override**: each photo thumbnail in the editor has a date input.
- When `firstVisit` is unset, the editor suggests the earliest photo date with
  a "use as first visit" link — always overridable, since the first visit
  isn't always the first photo.

## Migration

`normalizeSite(o)` migrates one site object in place: it adds any missing date
fields (as `null`) and converts bare-string photos to `{src, date:null}`.
`normalizeUser()` runs it across all pins and extras and bumps
`user.version` to `2`.

It is **idempotent** — safe to run repeatedly — and runs:

- on `loadLocal()` (local storage read),
- at the end of `mergeUser()` (so GitHub pulls and imports are normalized).

Because it only *adds* fields and only rewrites string photos, it never
corrupts data already synced to GitHub.

## GitHub sync round-trip

- New fields are plain strings/null and serialize cleanly into
  `urbex-user-data.json`.
- Photo objects serialize as-is; `uploadPhotoList` handles both a bare-string
  legacy entry and a `{src,date}` object, replacing a data-URL `src` with the
  committed `photos/…` path while preserving `date`.
- `mergeUser` calls `preserveDates(incoming, local)` per site so a pull from an
  older/other device that lacks a date **cannot wipe** a date you set locally.

## The "visited" tag

`visited` is an ordinary tag, so it participates in the tag filter like any
other. Convenience on top of it:

- Every location popup (built-in and user pin) has a **Mark visited / ✓
  Visited** button that toggles the `visited` tag (`toggleVisitedBase` /
  `toggleVisitedPin`). Toggling a built-in site's `visited` on creates a
  minimal `extras` entry; toggling the last thing off removes the empty entry.
- A visited location's map popup is rendered **gold** instead of white — the
  popup element gets a `visited-popup` class (`applyPopupGold`), applied both
  on open and immediately when toggled.

## Editor UI

The existing pin/notes modal gained the date fields. `demolishedDate` sits
right under the status selector because setting it implies the site is gone —
picking a demolished date auto-selects the `gone` status (for user pins), and
for a built-in site it flips the site's status to `gone` on save.

Which fields show per modal mode:

| mode        | name/region/status | demolished + dates | tags/photos |
|-------------|--------------------|--------------------|-------------|
| `newPin`    | yes                | yes                | yes         |
| `editPin`   | yes                | yes                | yes         |
| `extra`     | no                 | yes (writes extras)| yes         |
| `editBase`  | yes                | no (dates live in extras) | no   |

## The engine (Phase 2)

`anniversary.js` is a **pure, DOM-free, side-effect-free** module exposed as
`window.Anniversary`. It's deterministic — same inputs always give the same
output, so a reopened card shows the same copy line — and it takes the date as
an argument so it can be tested with a fake "today":

```js
Anniversary.computeEvents(user, "2025-06-15", { copy, userName, baseName })
```

- `copy` — the pool object (defaults to `window.ANNIVERSARY_COPY`).
- `userName` — name used for `{user}` and the past-70-years pronoun shift.
- `baseName(siteId)` — resolves a built-in site's display name (the engine
  never reaches into the app's `BASE` global; the app injects this).

Returned events:

```js
{ siteId, siteName, kind:"visit"|"demolition", years, anchorDate,
  tier:"milestone"|"numberEgg"|"generic", line, photos }  // photos: up to 5
```

### Firing rules

- An anchor fires when its **month and day** match today and `years >= 1`
  (comparisons on the string parts — no `Date` math).
- **Feb 29** anchors surface on **Mar 1** in non-leap years.
- A site with both `firstVisit` and `demolishedDate` on the same day produces
  **two** events; the engine sorts the demolition one first (the card features
  it and lists the other).

### Copy precedence & selection

`milestone > numberEgg > generic`. Milestones are **never** overridden.

- Milestone years: 1, 5, 10, 15, 20, 25, then every 25. A milestone year with
  no exact pool (e.g. 125) falls back to the nearest lower milestone pool.
- Generic selection is **seeded** on `hash(siteId|years)` (FNV-1a, never
  `Math.random`), so it's stable across reopens and varies by site/year.
- Generic lines are tone-tagged (`warm|wry|absurd|plain`) and weighted by
  year: **1–3 skew warm**, later years skew absurd.
- The voice is always second person — `{user}` resolves to **"You"**. There is
  no name substitution or pronoun swap.

### `format(line, ctx)`

Replaces `{location} {years} {date} {user} {building_age}`. Unknown or null
placeholders are **left intact** (`{bogus}` stays `{bogus}`), never
`undefined`.

### Upcoming / date checks

`Anniversary.upcomingEvents(user, fromStr, opts)` returns future anniversaries
(next occurrence strictly after `fromStr`) sorted by `daysOut`, each with
`{date, daysOut, years, tier, line, ...}`. Used by the card footer and the
date-check hub. `nextOccurrence(anchor, fromStr)` gives the next date an anchor
lands on (Feb-29 → Mar-1 in non-leap years).

## The cards (Phase 3)

`openAnniversaryCard(event)` renders one of two variants over `#annVeil`:

- **Anniversary (visit)** — light card, photo strip earliest→latest, a **cake**
  button that spawns ghosts (drifting up, fading; ~1/50 a party variant) plus
  confetti whose colors sample the centered photo. Escalates with clicks
  (1 → a few → screen-filling). Counter: "you have released N ghosts from this
  building."
- **Memorial (demolition)** — muted dark card, no confetti, photo strip
  **last-first** with the final frame labeled "The last time you saw this
  standing," a **flowers** button whose petals fall and **accumulate** at the
  card's base. Counter: "you have left N flowers here."

Both: footer with the next upcoming anniversary (or "No anniversaries on the
horizon. Go find somewhere new."); tap the card to fly to the pin and open its
popup; dismissible (never destroys the event); **`prefers-reduced-motion`** →
no particles, counters still count; optional sound, **default off**.

Layout: a centered column on a **soft-silver** card — big title
(`{years} Year Anniversary!` / `{years} Year Memorial`), a rounded image box,
the flavor line, then the button. When a site has **no photo**, the box shows
`fallback-site.svg` (a utility-pole silhouette) with a **black border**.

Performance: one `requestAnimationFrame` loop, particle cap 420, canvas
transforms only. Emoji are pre-rendered once to sprite canvases and blitted
with `drawImage` (never per-frame `fillText`), and photo color sampling is
cached per image — so spam-clicking holds ~60fps even at the cap.

Counters and seen/opened state live in **`urbexAtlasRecord.v1`** (device-local,
never synced). At most **one** card fires on launch — today's most significant
*unseen* event; everything else waits in the hub.

## Date control (device vs. custom)

The 🎂 **Anniversaries** button opens a hub where you choose whether the site
checks against **your device's date** or **a date you pick**. A custom date is
stored in `urbexAtlasDateOverride` (device-local) and drives `effectiveToday()`,
which every anniversary computation uses. The hub lists that date's
anniversaries (tap to open the card) and the next upcoming one.

## The Record tab (Phase 4)

The 🎂 **Record** button opens a full-screen tab (over the map) with a
segmented control — **Upcoming · Passed · Achievements** — defaulting to
whichever has unseen items (Passed if any are unseen, else Upcoming). The
device/custom **date control** lives at the top of this tab.

- **Upcoming** — `upcomingEvents`, nearest first. Thin rows: thumbnail, site
  name, milestone / "Memorial", days out, date. Demolition rows muted. Tapping
  flies the map to the pin.
- **Passed** — `pastEvents` (every past occurrence, one per year since the
  anchor), reverse-chronological. **Unopened** rows carry a dot. Tapping opens
  the full card. Missed anniversaries never expire — a years-old one still
  opens in full.
- **Achievements** — four tiered categories, each with its own badge tiers:
  **Places visited** (pins/extras tagged `visited`; 1/5/10/25/50/75/100),
  **Pictures taken** (total photos; 1/50/100/250/500/750/1000/1500/2000),
  **Ghosts released** and **Flowers left** (per-site counters;
  1/50/250/1K/5K/25K/100K/500K/1M). Each shows the live count, unlocked/locked
  tier chips, and how many more to the next badge.

Cake button: **ghosts rise from the bottom of the screen** across the full
width and fade out by 85% up; **confetti** bursts from the button.

State is device-local in `urbexAtlasRecord.v1`: `seen` (surfaced in the list
or auto-opened — clears the badge), `opened` (card actually opened — clears the
row dot), plus the ghost/flower counters. The header button is **badged with a
single count of unseen passed items**; surfacing them in the Passed list marks
them seen and clears it. At most one card auto-opens on launch; the Record tab
never auto-plays a queue.

Empty states: with no dates, "add a first-visit or demolished date… to start
the clock"; with dates but nothing passed yet, "Your first will be {date}, with
{location}."

## Adding copy lines

Edit `anniversary-copy.js` only — it's pure data. Milestone/numberEgg pools
are arrays of plain strings keyed by year; generic is an array of
`{t:tone, s:"line"}`. Use the placeholders above. Keep milestone lines
(especially 50 and 100) weighty — they carry the feature and must never read
as a joke.

_Phases 3–4 (cards, Record tab) are not yet implemented._
