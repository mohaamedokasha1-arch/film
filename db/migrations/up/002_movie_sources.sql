-- Migration 002 (UP): Movie Sources System
-- Adds multi-source support columns, registry, and audit tables.
-- Existing movies/import logs are NEVER modified or deleted — only additive changes.
-- SQLite note: "ADD COLUMN IF NOT EXISTS" is Postgres syntax; the migration
-- runner executes each statement individually and tolerates duplicate-column
-- errors, making this idempotent.

ALTER TABLE movies ADD COLUMN source_id TEXT;
ALTER TABLE movies ADD COLUMN source_type TEXT DEFAULT 'legacy';
ALTER TABLE movies ADD COLUMN can_rehost INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN original_source_url TEXT;

-- Tag every pre-existing movie as legacy Internet Archive content (preservation step)
UPDATE movies SET source_id = 'internet_archive', source_type = 'legacy' WHERE source_id IS NULL;

-- Extend import log with source attribution (legacy rows default to Internet Archive)
ALTER TABLE import_logs ADD COLUMN source_name TEXT DEFAULT 'Internet Archive';
ALTER TABLE import_logs ADD COLUMN next_run_at DATETIME;
ALTER TABLE import_logs ADD COLUMN metadata TEXT DEFAULT '{}';
ALTER TABLE import_logs ADD COLUMN items_rejected INTEGER;
ALTER TABLE import_logs ADD COLUMN items_duplicate INTEGER;

-- Source registry (enable/disable + configuration + scheduling state per source)
CREATE TABLE IF NOT EXISTS movie_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    source_type TEXT DEFAULT 'external',
    enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'registered',
    last_connection_test TEXT,
    connection_status TEXT,
    last_import_at DATETIME,
    next_run_at DATETIME,
    config TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rejected items log for new-source importers (legacy importer keeps failed_items)
CREATE TABLE IF NOT EXISTS rejected_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name VARCHAR(100),
    item_title VARCHAR(255),
    external_id TEXT,
    source_url TEXT,
    rejection_stage TEXT,
    rejection_reason TEXT NOT NULL,
    raw_data TEXT,
    rejected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movies_source ON movies(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_import_logs_source ON import_logs(source_name, started_at);
CREATE INDEX IF NOT EXISTS idx_rejected_items_source ON rejected_items(source_name, rejected_at);
CREATE INDEX IF NOT EXISTS idx_movie_sources_key ON movie_sources(source_key);
