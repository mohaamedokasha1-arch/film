# 📋 Source Validation Document — Wikimedia Commons (NEW Movie Source #2)

> **Mandatory pre-implementation legal verification, completed BEFORE any code was written.**
> Verification date: **2026-09-16** · Verified against the live official policy pages and the live
> production API. Re-verify quarterly or before major deployment changes.

---

## 1. Source Validation Template (mandatory fields)

| Field | Value |
|---|---|
| **Source Name** | Wikimedia Commons |
| **Source URL** | https://commons.wikimedia.org |
| **Access Method** | **Official MediaWiki Action API** (`https://commons.wikimedia.org/w/api.php`) — no scraping, no API key required, free anonymous read access |
| **License Type** | Per-file: **Public Domain, CC0, CC BY, CC BY-SA only** (platform forbids NC/ND). Accepted classes are configured per site settings and every item is verified individually at import time. |
| **Terms of Service URL** | https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use |
| **API Usage Policy URL** | https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines |
| **Licensing Policy URL** | https://commons.wikimedia.org/wiki/Commons:Licensing |
| **Commercial Use Allowed** | **Yes — Conditional**: each file's own license must permit it. Commons' licensing policy *requires* that hosted files allow "free reuse for any purpose, including commercial" — non-commercial-only and no-derivatives licenses are banned platform-wide. Our importer independently re-verifies this per item (fail-closed). |
| **Advertisement Allowed** | **Yes** — for PD/CC0/CC BY/CC BY-SA files (all permit commercial reuse; CC BY/BY-SA require attribution, which the platform renders on every movie page). |
| **Re-hosting Allowed** | **Yes** for accepted license classes (redistribution permitted). Implementation choice: the platform **links/streams directly** from `upload.wikimedia.org` rather than re-hosting, which is explicitly supported ("Download or hotlink the file" — https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia). `can_rehost` is stored per item as license-approved. |
| **Attribution Required** | **Conditional** — `AttributionRequired` extmetadata flag is stored per item; CC BY/CC BY-SA items render a machine-copyable attribution line (author + license + source link) on their public page. |
| **API Rate Limits / Etiquette** | Follow User-Agent policy (identifiable UA with contact e-mail), serial requests with configurable politeness delay (default 500 ms), `maxlag=5`, retry honoring `Retry-After`. See https://www.mediawiki.org/wiki/API:Etiquette |

## 2. Legal Proof — policy excerpts (retrieved 2026-09-16)

**Commons:Licensing** ([source](https://commons.wikimedia.org/wiki/Commons:Licensing)):
> "Wikimedia Commons only accepts free content… The following well-known licenses are preferred: Creative Commons Attribution/ShareAlike/Zero licenses… CC BY (1.0 2.0 2.5 3.0 4.0) — OK… CC BY-NC — **Not OK**… Unless also licensed under an acceptable free license, non-commercial and/or non-derivative content cannot be uploaded to Wikimedia Commons."

**Commons:Project scope** ([source](https://commons.wikimedia.org/wiki/Commons:Project_scope)):
> "To be considered freely licensed, the copyright owner has to release the file under an irrevocable licence which: **Permits free reuse for any purpose, including commercial. Permits the creation of derivative works.**"

**Wikimedia Foundation API Usage Guidelines** ([source](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines)):
> "When using Wikimedia APIs, an operator must: 1. Follow the User-Agent policy…; 2. Follow rate limiting requests…; 3. **Follow the requirements of the content licenses when republishing downloaded or cached data**… The existence of this policy does not require members of the Wikimedia community to get prior permission from the Wikimedia Foundation before using the APIs in a manner consistent with this policy."

**Commons:Reusing content outside Wikimedia** ([source](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)):
> "You do not need to obtain a specific statement of permission from the licensor(s)… some licenses require that the original creator be attributed… **Download or hotlink the file, and use it.**" + "the Wikimedia Foundation does not provide any warranty regarding the copyright status" → **this is why our system performs its own per-item verification and fail-closed rejection.**

## 3. Live API evidence (captured 2026-09-16)

Real request used by the fetcher (official Action API, namespace 6 = File, `filetype:video` enforced):

```
https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2
  &generator=search&gsrnamespace=6&gsrsearch=filetype:video incategory:"Videos of films in the public domain"
  &gsrlimit=10&prop=imageinfo&iiprop=url|extmetadata|mime|size|timestamp&iiurlwidth=480
```

Real response fields consumed (excerpt — `File:Night of the Living Dead (1968).webm`):

```json
{
  "title": "File:Night of the Living Dead (1968).webm",
  "imageinfo": [{
    "url": "https://upload.wikimedia.org/wikipedia/commons/2/24/Night_of_the_Living_Dead_(1968).webm",
    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Night_of_the_Living_Dead_(1968).webm",
    "mime": "video/webm", "duration": 5752.838, "size": 4093040711,
    "extmetadata": {
      "LicenseShortName": { "value": "Public domain" },
      "UsageTerms":       { "value": "Public domain" },
      "AttributionRequired": { "value": "false" },
      "Copyrighted":      { "value": "False" },
      "Artist":           { "value": "George A. Romero" },
      "DateTimeOriginal": { "value": "1968" }
    }
  }]
}
```

Additional real items verified: `1944 Иван Грозный.webm` (PD-Russia), `Tipps und Hinweise zur
CC-Lizensierung…webm` (**CC BY 4.0**, `AttributionRequired: true`), `Richard Stallman – Free Software
Free Society 1–3.ogv` (**CC BY-SA 3.0**, dual-licensed after license migration). Recorded copies of
these live responses are committed under `test/fixtures/wikimedia_commons/` for offline testing.

## 4. Per-item license verification (implemented)

`movie_sources/wikimedia_commons/WikimediaLicenseChecker.js` — runs for EVERY candidate:

| License on file | Decision |
|---|---|
| Public domain (+ `Copyrighted: False` corroboration) | ✅ ACCEPT |
| CC0 (any version) | ✅ ACCEPT |
| CC BY 1.0–4.0 | ✅ ACCEPT (attribution required & rendered) |
| CC BY-SA 1.0–4.0 | ✅ ACCEPT (attribution required & rendered) |
| Any **NC** variant (CC BY-NC/NC-SA/NC-ND) | ❌ REJECT — non-commercial |
| Any **ND** variant | ❌ REJECT — no derivatives |
| Fair use / non-free / All rights reserved | ❌ REJECT |
| GFDL-only (no free CC option) | ❌ REJECT (fail-closed) |
| Empty / unrecognized / ambiguous (e.g. PD claim + `Copyrighted: True` contradiction) | ❌ REJECT (fail-closed) |

Sample check output (from the automated suite, `npm test`):

```
ACCEPT: Public Domain (copyrighted=False)          → canRehost=true, commercialAllowed=true
REJECT: NC variants                                 → "License restricts to NON-COMMERCIAL use…"
REJECT: PD claim contradicted by copyright flag     → "Ambiguous rights… fail-closed"
ACCEPT: CC BY 4.0                                   → attributionRequired=true
```

## 5. Diversity coverage & honest limitations

| Goal | Coverage via Commons |
|---|---|
| Classic / silent films | ✅ Strong (PD categories, Méliès/Chaplin categories, pre-1929 cinema) |
| International films | ✅ Partial (e.g. Soviet `Иван Грозный`, US, EU archive uploads) |
| Public domain content | ✅ Excellent |
| CC-licensed content | ✅ Excellent (CC BY / CC BY-SA videos) |
| **Egyptian & Arabic movies** | ⚠️ Very sparse on Commons today (no dedicated video categories with feature films) |
| **Indian movies** | ⚠️ Very sparse on Commons today |

→ The prompt anticipated this: the system is built as a **multi-source registry**
(`movie_sources/`). Each future source (e.g. an Arabic public-domain archive with a verified API)
is one new module + one registration line — no existing code changes.

## 6. Compliance measures implemented

1. **Official API only** — no HTML scraping; identifiable User-Agent `AkavoxLegalMovieBot/1.0 (…contact: legal@akavox.org)`.
2. **Rate limiting** (default 500 ms serial delay, `maxlag=5`, Retry-After honored, exponential backoff).
3. **Per-item license gate** before any insert (fail-closed, evidence stored in `rejected_items.raw_data`).
4. **Attribution rendering** on movie pages for CC BY / CC BY-SA with copy button.
5. **Source page linkage** — every movie links back to its Commons file page; media is streamed from Wikimedia's own CDN.
6. **No ToS-violating bulk harvesting** — small batches (default 10), incremental cursors, 6-hour cadence.
7. **Audit trail** — `import_logs` + `rejected_items` preserve what was accepted/rejected and why, for future legal audits.

**Signature (developer acknowledgment on file):** see `docs/IMPLEMENTATION_REPORT.md` §7.
