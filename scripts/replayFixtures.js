#!/usr/bin/env node
/**
 * Offline Fixture Replay Utility
 * ============================================================================
 * PURPOSE (transparency):
 *   This utility replays RECORDED real Wikimedia Commons API responses
 *   (test/fixtures/, captured 2026-09-16) through the exact production
 *   pipeline — parser → license checker → validator → duplicate checker →
 *   database — so the import flow can be demonstrated on hosts WITHOUT
 *   outbound internet access (e.g. this CI sandbox).
 *
 *   It is a DEMO/VERIFICATION tool only. The scheduler, admin "Run Now" and
 *   all runtime code paths ALWAYS call the live official API
 *   (https://commons.wikimedia.org/w/api.php) and never read fixtures.
 *
 * Usage: node scripts/replayFixtures.js
 * ============================================================================
 */

process.env.AKAVOX_DB_PATH = process.env.AKAVOX_DB_PATH || require('path').join(__dirname, '..', 'db', 'akavox.db');

const fs = require('fs');
const path = require('path');
const FIXTURE_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'wikimedia_commons');

function fixtureFor(url) {
  const decoded = decodeURIComponent(String(url).replace(/\+/g, ' '));
  if (decoded.includes('"Night of the Living Dead"')) return path.join(FIXTURE_DIR, 'search_notld_pd.json');
  if (decoded.includes('incategory:"Videos of films in the public domain"')) return path.join(FIXTURE_DIR, 'category_pd_films.json');
  if (decoded.includes('"CC BY-SA"')) return path.join(FIXTURE_DIR, 'search_cc_licensed.json');
  if (decoded.includes('GFDL')) return path.join(FIXTURE_DIR, 'search_gfdl_dual.json');
  return null;
}

(async () => {
  const { initDb, run } = require('../db/database');
  await initDb();

  const registry = require('../movie_sources');
  const importer = registry.get('wikimedia_commons');

  const realFetchJson = importer.fetcher.fetchJson.bind(importer.fetcher);
  importer.fetcher.fetchJson = async (url, opts = {}) => {
    const file = fixtureFor(url);
    if (file) {
      opts.transport = async () => ({
        ok: true, status: 200, statusText: 'OK',
        headers: { get: () => null },
        json: async () => JSON.parse(fs.readFileSync(file, 'utf8'))
      });
    }
    return realFetchJson(url, opts); // no fixture → real network, as in production
  };

  // Crawl configuration mirroring the admin defaults
  await run(
    "INSERT INTO settings (key, value, type) VALUES ('commons_search_queries', ?, 'string') ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ['"Night of the Living Dead"|incategory:"Videos of films in the public domain"|"CC BY-SA"|GFDL']
  );
  await run("INSERT INTO settings (key, value, type) VALUES ('commons_min_duration_seconds', '180', 'int') ON CONFLICT(key) DO UPDATE SET value=excluded.value");

  console.log('▶ Replaying recorded Commons API batches through the production pipeline…\n');
  importer.addLogListener((ev) => {
    if (ev.type !== 'ping') console.log(`  [${ev.type}] ${ev.message}`);
  });

  const result = await importer.run({ trigger: 'offline_replay_demo' });
  console.log('\n▶ Result:', JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((e) => { console.error('REPLAY FAILED:', e); process.exit(1); });
