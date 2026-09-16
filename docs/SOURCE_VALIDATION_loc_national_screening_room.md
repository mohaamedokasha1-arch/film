# Source Identification Report — Library of Congress National Screening Room

Verification date: **2026-09-16**. Official JSON API only. Fail-closed per item.

| Field | Value |
|---|---|
| **Source Name** | Library of Congress — National Screening Room |
| **Source URL** | https://www.loc.gov/collections/national-screening-room/ |
| **Access Method** | Official LOC JSON API (`?fo=json`) documented at https://www.loc.gov/apis/json-and-yaml/ |
| **API Documentation** | https://www.loc.gov/apis/json-and-yaml/requests/endpoints/ |
| **Primary license** | Item-level. Accepted only: **No known restrictions**, **Public Domain**, **CC0**, **CC BY / CC BY-SA**, **U.S. Government Work**, or **U.S. publication year ≤ configured PD cutoff** (default 1929). |
| **Commercial use** | Only when the item-level statement permits it. Ambiguous / copyrighted items are rejected. |
| **Redistribution / embedding** | Stream/hotlink official `tile.loc.gov` media. **Rehosting files is disabled** (`can_rehost=false`). |
| **Attribution** | Required: credit Library of Congress + item title + item URL. |
| **TOS** | https://www.loc.gov/legal/ — API: https://www.loc.gov/apis/ |
| **Rate limits** | Identifiable User-Agent, serial requests, default 700 ms delay. |
| **Auth** | None for public JSON endpoints. |
| **Egyptian / Arabic / Indian features** | Not a strength of this collection. Classic U.S. paper-print / government films are. Modular registry allows later sources. |
| **DMCA** | Library of Congress legal page + our `/contact` DMCA form. |

## Why this source (and why not scrape)

LOC publishes a **documented JSON interface** (`fo=json`) over catalog collections. We do not scrape HTML. Media URLs come from `resources[].video` on `tile.loc.gov`.

## Fail-closed license rules (implemented)

| Evidence on the item | Decision |
|---|---|
| `access_restricted: true` | REJECT |
| Rights text: all rights reserved / copyrighted / in copyright | REJECT |
| Rights text: no known restrictions / public domain / CC0 / CC BY / CC BY-SA | ACCEPT |
| U.S. government producer (USDA, US Govt, Library of Congress production) | ACCEPT as U.S. Government Work |
| Year ≤ PD cutoff **and** U.S. origin | ACCEPT as Public Domain (pre-cutoff) |
| Missing rights **and** year after cutoff | REJECT |

Live sample accepted: Edison *Buffalo Fire Department in action* (1897) — Paper Print Collection, year 1897.  
Live sample rejected: *American scrapbook* (1954, General Electric / Copyright Collection) — post-cutoff, no PD statement.
