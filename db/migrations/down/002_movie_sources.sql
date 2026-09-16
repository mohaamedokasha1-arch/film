-- Migration 002 (DOWN): fully reverses the Movie Sources System migration.
-- Drops the new tables/indexes and removes the added columns
-- (SQLite >= 3.35 supports DROP COLUMN). Legacy movie data is untouched.

DROP INDEX IF EXISTS idx_movie_sources_key;
DROP INDEX IF EXISTS idx_rejected_items_source;
DROP INDEX IF EXISTS idx_import_logs_source;
DROP INDEX IF EXISTS idx_movies_source;

DROP TABLE IF EXISTS rejected_items;
DROP TABLE IF EXISTS movie_sources;

ALTER TABLE import_logs DROP COLUMN items_duplicate;
ALTER TABLE import_logs DROP COLUMN items_rejected;
ALTER TABLE import_logs DROP COLUMN metadata;
ALTER TABLE import_logs DROP COLUMN next_run_at;
ALTER TABLE import_logs DROP COLUMN source_name;

ALTER TABLE movies DROP COLUMN original_source_url;
ALTER TABLE movies DROP COLUMN can_rehost;
ALTER TABLE movies DROP COLUMN source_type;
ALTER TABLE movies DROP COLUMN source_id;
