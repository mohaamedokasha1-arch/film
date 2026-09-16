const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const defaultSettings = require('../config/defaultSettings');

const DB_PATH = process.env.AKAVOX_DB_PATH || path.join(__dirname, 'akavox.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * ---------------------------------------------------------------------------
 * Dual-Engine Database Layer (AKAVOX)
 * ---------------------------------------------------------------------------
 * Primary engine  : sqlite3 (native, production standard — unchanged behavior)
 * Fallback engine : sql.js  (pure WebAssembly SQLite, zero native compilation)
 *
 * The fallback exists purely for constrained environments (e.g. CI sandboxes
 * or hosts where the native sqlite3 binding cannot be compiled). Both engines
 * expose the exact same async API: query / get / run / exec.
 * ---------------------------------------------------------------------------
 */

let engine = null;
let engineReadyPromise = null;
let sqljsSaveTimer = null;

function locateWasm(file) {
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
}

async function initEngine() {
  // Attempt native sqlite3 first (production path)
  try {
    const sqlite3 = require('sqlite3');
    const db = await new Promise((resolve, reject) => {
      const instance = new sqlite3Module.Database(DB_PATH, (err) => {
        if (err) reject(err); else resolve(instance);
      });
      instance.on('error', (err) => reject(err));
    });
    console.log('✅ SQLite (native) connected:', DB_PATH);
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA foreign_keys = ON;');
    return { kind: 'sqlite3', db };
  } catch (nativeErr) {
    console.warn('⚠️  Native sqlite3 unavailable (' + (nativeErr.message || nativeErr) + '). Falling back to sql.js (WASM).');
  }

  // Fallback: sql.js (WebAssembly) — same SQL semantics, in-memory with persistence
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: locateWasm });
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db = existing ? new SQL.Database(existing) : new SQL.Database();
  try { db.run('PRAGMA foreign_keys = ON;'); } catch (e) { /* pragma advisory only */ }
  console.log('✅ SQLite (sql.js WASM) connected:', DB_PATH);
  return { kind: 'sqljs', db };
}

function getEngine() {
  if (!engineReadyPromise) {
    engineReadyPromise = initEngine().then((eng) => { engine = eng; return eng; });
  }
  return engineReadyPromise;
}

function persistSqljs() {
  if (!engine || engine.kind !== 'sqljs') return;
  if (sqljsSaveTimer) clearTimeout(sqljsSaveTimer);
  sqljsSaveTimer = setTimeout(() => {
    try {
      const data = Buffer.from(engine.db.export());
      fs.writeFileSync(DB_PATH, data);
    } catch (e) {
      console.error('❌ Failed to persist sql.js database:', e.message);
    }
  }, 50);
}

// Flush pending sql.js persistence on process exit (debounce timer dies with the process)
process.on('exit', () => {
  if (engine && engine.kind === 'sqljs') {
    try { fs.writeFileSync(DB_PATH, Buffer.from(engine.db.export())); } catch (e) { /* best effort */ }
  }
});

function getDb() {
  // Preserved for backwards compatibility. Returns the raw engine handle.
  return engine ? engine.db : null;
}

// ---------------------------------------------------------------------------
// Async wrapper methods (identical contract for both engines)
// ---------------------------------------------------------------------------
async function query(sql, params = []) {
  const eng = await getEngine();
  if (eng.kind === 'sqlite3') {
    return new Promise((resolve, reject) => {
      eng.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }
  const stmt = eng.db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

async function get(sql, params = []) {
  const eng = await getEngine();
  if (eng.kind === 'sqlite3') {
    return new Promise((resolve, reject) => {
      eng.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function run(sql, params = []) {
  const eng = await getEngine();
  if (eng.kind === 'sqlite3') {
    return new Promise((resolve, reject) => {
      eng.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
  eng.db.run(sql, params);
  const changes = eng.db.getRowsModified();
  let lastID = null;
  const res = eng.db.exec('SELECT last_insert_rowid() AS id');
  if (res && res[0] && res[0].values && res[0].values[0]) {
    lastID = res[0].values[0][0];
  }
  persistSqljs();
  return { lastID, changes };
}

async function exec(sql) {
  const eng = await getEngine();
  if (eng.kind === 'sqlite3') {
    return new Promise((resolve, reject) => {
      eng.db.exec(sql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
  eng.db.exec(sql);
  persistSqljs();
}

// Helper to hash passwords (SHA256 with salt)
function hashPassword(password) {
  const salt = 'akavox_salt_sec_2026';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

// Settings helpers
async function getSetting(key, fallback = null) {
  const row = await get('SELECT value, type FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  if (row.type === 'boolean') return row.value === 'true' || row.value === '1';
  if (row.type === 'int') return parseInt(row.value, 10);
  if (row.type === 'json') {
    try { return JSON.parse(row.value); } catch (e) { return fallback; }
  }
  return row.value;
}

async function getSettingsMap() {
  const rows = await query('SELECT key, value, type FROM settings');
  const map = {};
  for (const r of rows) {
    if (r.type === 'boolean') map[r.key] = (r.value === 'true' || r.value === '1');
    else if (r.type === 'int') map[r.key] = parseInt(r.value, 10);
    else if (r.type === 'json') {
      try { map[r.key] = JSON.parse(r.value); } catch (e) { map[r.key] = null; }
    } else {
      map[r.key] = r.value;
    }
  }
  return map;
}

async function setSetting(key, value, type = 'string') {
  let valStr = String(value);
  if (type === 'json' && typeof value === 'object') {
    valStr = JSON.stringify(value);
  } else if (type === 'boolean') {
    valStr = value ? 'true' : 'false';
  }
  await run(
    `INSERT INTO settings (key, value, type, updated_at) 
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type, updated_at = CURRENT_TIMESTAMP`,
    [key, valStr, type]
  );
}

// Initialize database schema and seeds
async function initDb() {
  await getEngine();
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await exec(schemaSql);

  // Additive, reversible migrations (new source system — never drops legacy data)
  const { runMigrations } = require('./migrations');
  await runMigrations();

  // Seed default settings
  for (const setting of defaultSettings) {
    const existing = await get('SELECT key FROM settings WHERE key = ?', [setting.key]);
    if (!existing) {
      await run(
        'INSERT INTO settings (key, value, type) VALUES (?, ?, ?)',
        [setting.key, setting.value, setting.type]
      );
    }
  }

  // Seed default admin if none exists (admin / admin123)
  const existingAdmin = await get('SELECT id FROM admins LIMIT 1');
  if (!existingAdmin) {
    const defaultPasswordHash = hashPassword('admin123');
    await run(
      'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
      ['admin', defaultPasswordHash]
    );
    console.log('🔐 Default admin account created: username: "admin", password: "admin123"');
  }

  // Flush sql.js persistence after bootstrap writes
  persistSqljs();
  console.log('✅ Database initialized successfully');
}

module.exports = {
  getDb,
  query,
  get,
  run,
  exec,
  initDb,
  getSetting,
  getSettingsMap,
  setSetting,
  hashPassword
};
