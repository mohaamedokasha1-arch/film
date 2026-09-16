-- Migration 003 (UP): Full Admin CMS tables and additive movie/genre/admin columns.

ALTER TABLE movies ADD COLUMN title_ar TEXT;
ALTER TABLE movies ADD COLUMN country TEXT;
ALTER TABLE movies ADD COLUMN rating REAL;
ALTER TABLE movies ADD COLUMN trailer_url TEXT;
ALTER TABLE movies ADD COLUMN cover_url TEXT;
ALTER TABLE movies ADD COLUMN writer TEXT;
ALTER TABLE movies ADD COLUMN studio TEXT;
ALTER TABLE movies ADD COLUMN age_rating TEXT;
ALTER TABLE movies ADD COLUMN tags TEXT DEFAULT '[]';
ALTER TABLE movies ADD COLUMN content_type TEXT DEFAULT 'movie';
ALTER TABLE movies ADD COLUMN featured INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN trending INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN popular INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN is_new INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN coming_soon INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN meta_title TEXT;
ALTER TABLE movies ADD COLUMN meta_description TEXT;
ALTER TABLE movies ADD COLUMN meta_keywords TEXT;
ALTER TABLE movies ADD COLUMN deleted_at DATETIME;
ALTER TABLE movies ADD COLUMN extra_sources TEXT DEFAULT '[]';
ALTER TABLE movies ADD COLUMN comments_enabled INTEGER DEFAULT 1;

ALTER TABLE genres ADD COLUMN name_ar TEXT;
ALTER TABLE genres ADD COLUMN description TEXT;
ALTER TABLE genres ADD COLUMN image_url TEXT;
ALTER TABLE genres ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE genres ADD COLUMN visible INTEGER DEFAULT 1;
ALTER TABLE genres ADD COLUMN show_in_nav INTEGER DEFAULT 1;
ALTER TABLE genres ADD COLUMN show_on_home INTEGER DEFAULT 1;
ALTER TABLE genres ADD COLUMN parent_id INTEGER;
ALTER TABLE genres ADD COLUMN color TEXT;

ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'super_admin';
ALTER TABLE admins ADD COLUMN email TEXT;
ALTER TABLE admins ADD COLUMN last_login DATETIME;
ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1;

UPDATE admins SET role = 'super_admin' WHERE role IS NULL;

CREATE TABLE IF NOT EXISTS cms_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT DEFAULT '',
    status TEXT DEFAULT 'published',
    show_in_nav INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    meta_title TEXT,
    meta_description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homepage_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    section_key TEXT UNIQUE NOT NULL,
    section_type TEXT DEFAULT 'movies',
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    item_limit INTEGER DEFAULT 12,
    layout TEXT DEFAULT 'grid',
    source_mode TEXT DEFAULT 'auto',
    filter_genre TEXT,
    filter_flag TEXT,
    movie_ids TEXT DEFAULT '[]',
    custom_html TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    media_type TEXT DEFAULT 'image',
    used_in TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movies_deleted ON movies(deleted_at);
CREATE INDEX IF NOT EXISTS idx_movies_featured ON movies(featured, status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON cms_pages(slug);
