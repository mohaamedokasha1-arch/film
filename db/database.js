const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const defaultSettings = require('../config/defaultSettings');

const DB_PATH = path.join(__dirname, 'akavox.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Failed to open database:', err.message);
      } else {
        console.log('✅ SQLite connected:', DB_PATH);
      }
    });

    // Enable WAL mode & foreign keys for high performance & integrity
    dbInstance.run('PRAGMA journal_mode = WAL;');
    dbInstance.run('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

// Async wrapper methods
function query(sql, params = []) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function get(sql, params = []) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function run(sql, params = []) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function exec(sql) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
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
  getDb();
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await exec(schemaSql);

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
