# 🎛️ Admin User Guide — Movie Sources Manager

**Location:** `/admin/movie-sources` (login: `/admin` with your admin credentials)

---

## 1. Sources Manager overview

The page shows one card per registered source:

```
┌──────────────────────────────────────────────────────────────┐
│ Internet Archive (Legacy Source)   [LEGACY · PROTECTED]      │
│ https://archive.org                                          │
│ ● Active   Total Movies: 15   Last Import: …                 │
│ [Run Now (Legacy Pipeline)] [View Logs] [Rejected Items]     │
│ 🔒 Protected legacy pipeline — cannot be disabled/modified.  │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Wikimedia Commons   [EXTERNAL SOURCE]                        │
│ https://commons.wikimedia.org                                │
│ ● Active   ✓ Connected   Total Movies: 9                     │
│ Last Import: …  Next Scheduled: …  Last Run Stats: …         │
│ [Run Now] [Test Connection] [Disable] [View Logs] …          │
└──────────────────────────────────────────────────────────────┘
```

- **Legacy source (Internet Archive):** the original pipeline, fully preserved.
  "Run Now (Legacy Pipeline)" delegates to the pre-existing importer; its
  scheduler and settings pages are unchanged. The card is intentionally
  **read-only** (no disable/enable) to guarantee the old library can never be
  switched off from the new UI.
- **External sources** (currently: Wikimedia Commons) run **independently**
  with their own scheduler, license policy, logs and rejected-items list.

### Buttons
| Button | Action |
|---|---|
| **Run Now** | Starts an import cycle for that source. Watch progress live in the **Live Import Console** at the bottom of the page (Server-Sent Events — shows every fetch/license/validation/dedupe decision in real time). |
| **Test Connection** | Performs a *real* API ping (`siteinfo`) against the source and stores the result on the card (✓ Connected / ✗ Connection failed). |
| **Enable / Disable** | Toggles whether the scheduler may run this source. Disabled sources are skipped automatically. The legacy source has no toggle by design. |
| **View Logs** | Opens the filtered import-log viewer for this source. |
| **Rejected Items** | Opens the rejection audit list for this source. |
| **Configure** | Source-specific settings (see below). |

## 2. Configuring the Wikimedia Commons source

`/admin/movie-sources/wikimedia_commons/configure`

| Setting | Meaning |
|---|---|
| **Search Queries** (`\|`-separated) | Official Commons search keywords. `filetype:video` is always enforced. Recommended: `incategory:"Videos of films in the public domain"`, `incategory:"Films from Archive.org"`, `incategory:"Films by Georges Méliès"`, plain keywords such as `silent film documentary`. |
| **Candidates per Cycle** | How many items each run inspects (API etiquette caps pages at 50; 10 recommended). |
| **Schedule Interval (Hours)** | Multi-source scheduler cadence (default **6h**, independent from the legacy scheduler). |
| **Minimum Duration (Seconds)** | Quality gate — rejects short clips/fragments (default 180 s). |
| **Request Delay (ms)** | Politeness delay between API calls (do not set below 250 ms). |
| **Enable automated multi-source scheduler** | Master switch for the 6-hour cycle. |

Each query keeps an **incremental offset cursor** (stored in settings), so every
cycle discovers NEW material and wraps around only when a query is exhausted.

## 3. Import Logs Viewer

`/admin/movie-sources/logs` — filter by **source / status / date range**.
Each row shows found / imported / rejected / duplicate counts, duration,
status, and an expandable **event trace** of the run (the same lines shown in
the live console, persisted for audit).

## 4. Rejected Items (legal & quality blocks)

`/admin/movie-sources/rejected` — every candidate that was blocked BEFORE
entering the library, with:
- the **rejection stage** (license / validation / processing),
- the **exact reason** (e.g. "License restricts to NON-COMMERCIAL use (NC)…"),
- a link to inspect the original file page, and
- **View Raw Data** — the full candidate record including the license metadata
  that produced the decision (legal audit evidence).

Identical rejections are de-duplicated across runs; delete a record only if you
want it re-recorded on the next run. Rejections never disappear silently.

## 5. How to add Source #3, #4, …

1. Create `movie_sources/<new_source>/` with five collaborators
   (Fetcher, Parser, LicenseChecker, Validator, Importer wiring) — copy the
   `wikimedia_commons/` module as the reference implementation.
2. Register the importer in `movie_sources/index.js` (one line).
3. Restart. The source appears in the manager with its own card, logs, and
   settings; the scheduler picks it up automatically.

Full template documentation: `README.md` → "Adding new sources".

## 6. Compliance quick-reference

- License policy: https://commons.wikimedia.org/wiki/Commons:Licensing
- API usage policy: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines
- Full verification record: `docs/SOURCE_VALIDATION_wikimedia_commons.md`
