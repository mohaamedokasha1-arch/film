-- AKASHA HUB Database Schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    source_url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    original_title TEXT,
    slug TEXT UNIQUE NOT NULL,
    year INTEGER,
    description TEXT,
    duration INTEGER,
    duration_raw TEXT,
    language TEXT DEFAULT 'English',
    poster_url TEXT,
    video_url TEXT,
    embed_url TEXT,
    director TEXT,
    cast_members TEXT DEFAULT '[]',
    genres TEXT DEFAULT '[]',
    license_type TEXT NOT NULL,
    license_url TEXT,
    rights_statement TEXT,
    attribution_required INTEGER DEFAULT 0,
    attribution_text TEXT,
    source_name TEXT DEFAULT 'Internet Archive',
    status TEXT DEFAULT 'published',
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    movie_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movie_genres (
    movie_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (movie_id, genre_id),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    duration_seconds REAL DEFAULT 0,
    items_found INTEGER DEFAULT 0,
    items_imported INTEGER DEFAULT 0,
    items_skipped INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    license_rejections INTEGER DEFAULT 0,
    duplicate_rejections INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',
    error_message TEXT,
    log_details TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS failed_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    source_url TEXT,
    title TEXT,
    failure_reason TEXT NOT NULL,
    license_issue INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    last_retry_at DATETIME,
    permanently_ignored INTEGER DEFAULT 0,
    metadata_snapshot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT DEFAULT 'string',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & SEO
CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug);
CREATE INDEX IF NOT EXISTS idx_movies_external_id ON movies(external_id);
CREATE INDEX IF NOT EXISTS idx_movies_status_created ON movies(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);
CREATE INDEX IF NOT EXISTS idx_genres_slug ON genres(slug);
CREATE INDEX IF NOT EXISTS idx_import_logs_started ON import_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_items_external ON failed_items(external_id);
