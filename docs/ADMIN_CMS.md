# AKAVOX Admin CMS

The control panel stays on Express + EJS (no React rewrite, no extra npm packages). Public site templates are unchanged unless CMS page HTML is published.

## Login
- URL: `/admin/login`
- Default: `admin` / `AkavoxAdmin2026Secure`
- Roles: `super_admin`, `admin`, `editor`, `moderator`

## New admin areas
| Path | Purpose |
|---|---|
| `/admin/movies` | List, search, bulk, trash |
| `/admin/movies/new` | Add movie (live DB) |
| `/admin/categories` | Genres CRUD |
| `/admin/homepage` | Hero + sections |
| `/admin/pages` | CMS pages (system pages keep original templates until content is filled) |
| `/admin/media` | URL media library |
| `/admin/users` | Admin accounts |
| `/admin/analytics` | Views / genres |
| `/admin/activity` | Audit trail |
| `/admin/backup` | JSON + SQLite export |
| `/admin/settings/social` | Social URLs |

Custom published pages: `/p/:slug`

## Migration
`db/migrations/up/003_admin_cms.sql` (additive). Reverse: `down/003_admin_cms.sql` (drops new tables only).
