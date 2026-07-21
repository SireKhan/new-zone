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
- Past **70 years** on visit anniversaries, `you`/`your` are swapped for the
  user's name — the pronoun shift is the joke.

### `format(line, ctx)`

Replaces `{location} {years} {date} {user} {building_age}`. Unknown or null
placeholders are **left intact** (`{bogus}` stays `{bogus}`), never
`undefined`.

### App bridge

`window.anniversaryEventsToday(dateStr?)` in `index.html` wires the live
`user` object, the resolved base names, and `annUserName()` into the engine.
No cards or Record tab yet — that's Phase 3/4.

## Adding copy lines

Edit `anniversary-copy.js` only — it's pure data. Milestone/numberEgg pools
are arrays of plain strings keyed by year; generic is an array of
`{t:tone, s:"line"}`. Use the placeholders above. Keep milestone lines
(especially 50 and 100) weighty — they carry the feature and must never read
as a joke.

_Phases 3–4 (cards, Record tab) are not yet implemented._
