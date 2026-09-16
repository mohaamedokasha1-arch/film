/**
 * Additive, reversible migration runner for AKAVOX multi-source support.
 * - Tracks applied migrations in `schema_migrations`
 * - Executes each statement individually (tolerates idempotent re-runs)
 * - `down(name)` fully reverses a migration
 */

const fs = require('fs');
const path = require('path');
const { exec, get, run } = require('./database');

const UP_DIR = path.join(__dirname, 'migrations', 'up');
const DOWN_DIR = path.join(__dirname, 'migrations', 'down');

function listMigrations() {
  if (!fs.existsSync(UP_DIR)) return [];
  return fs.readdirSync(UP_DIR).filter(f => f.endsWith('.sql')).sort();
}

function readStatements(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split(/;\s*(?:\n|$)/)
    .map(s => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(s => s.length > 0);
}

function isBenignError(err) {
  const msg = (err && err.message ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('duplicate column name') ||
    msg.includes('no such column') ||
    msg.includes('already exists')
  );
}

async function runMigrations() {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const files = listMigrations();
  for (const file of files) {
    const applied = await get('SELECT name FROM schema_migrations WHERE name = ?', [file]);
    if (applied) continue;

    const statements = readStatements(path.join(UP_DIR, file));
    for (const stmt of statements) {
      try {
        await exec(stmt);
      } catch (err) {
        if (!isBenignError(err)) throw err;
      }
    }
    await run('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`📦 Migration applied: ${file}`);
  }
}

async function downMigration(name) {
  const downFile = path.join(DOWN_DIR, name);
  if (!fs.existsSync(downFile)) {
    throw new Error(`No down migration found for ${name}`);
  }
  const statements = readStatements(downFile);
  for (const stmt of statements) {
    try {
      await exec(stmt);
    } catch (err) {
      if (!isBenignError(err)) throw err;
    }
  }
  await run('DELETE FROM schema_migrations WHERE name = ?', [name]);
  console.log(`↩️  Migration reversed: ${name}`);
}

module.exports = { runMigrations, downMigration, listMigrations };
