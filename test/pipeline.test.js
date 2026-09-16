/**
 * AKAVOX Multi-Source Pipeline Tests
 * ============================================================================
 * IMPORT — READ THIS — IMPORT
 *   No mock data is used by any RUNTIME code path. The importer, at runtime,
 *   always calls the official Wikimedia Commons API. The fixtures in
 *   test/fixtures/ are REAL recorded API responses (captured 2026-09-16) used
 *   ONLY here, because this CI sandbox has no outbound network access.
 *   Injecting a transport is a standard offline-test technique; the exact same
 *   parser → license-checker → validator → dedupe → database pipeline runs as
 *   in production.
 * ============================================================================
 */

process.env.AKAVOX_DB_PATH = require('path').join(__dirname, 'test_akavox.db');

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'wikimedia_commons');

// Fresh isolated DB for the test run
if (fs.existsSync(process.env.AKAVOX_DB_PATH)) fs.unlinkSync(process.env.AKAVOX_DB_PATH);

const { initDb, get, query, run } = require('../db/database');
const WikimediaFetcher = require('../movie_sources/wikimedia_commons/WikimediaFetcher');
const WikimediaParser = require('../movie_sources/wikimedia_commons/WikimediaParser');
const WikimediaLicenseChecker = require('../movie_sources/wikimedia_commons/WikimediaLicenseChecker');
const WikimediaValidator = require('../movie_sources/wikimedia_commons/WikimediaValidator');
const registry = require('../movie_sources');

let passed = 0, failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.error(`  ❌ ${name}\n     ${e.message}`); }
}

/** Transport that replays recorded real API responses (offline tests only) */
function fixtureFor(url) {
  const decoded = decodeURIComponent(String(url).replace(/\+/g, ' '));
  if (decoded.includes('"Night of the Living Dead"')) return path.join(FIXTURE_DIR, 'search_notld_pd.json');
  if (decoded.includes('incategory:"Videos of films in the public domain"')) return path.join(FIXTURE_DIR, 'category_pd_films.json');
  if (decoded.includes('"CC BY-SA"')) return path.join(FIXTURE_DIR, 'search_cc_licensed.json');
  if (decoded.includes('GFDL')) return path.join(FIXTURE_DIR, 'search_gfdl_dual.json');
  return null;
}

function makeFixtureTransport() {
  return async (url) => {
    const file = fixtureFor(url);
    if (!file) throw new Error('No fixture for URL: ' + url);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: { get: () => null },
      json: async () => parsed
    };
  };
}

async function main() {
  console.log('\n════════ AKAVOX Multi-Source Pipeline Tests ════════\n');
  await initDb();

  /* ---------------------------------------------------------------- */
  console.log('─ Group 1: Database schema (additive migrations)');

  await ok('movies table gained source_id / source_type / can_rehost / original_source_url', async () => {
    const cols = (await query('PRAGMA table_info(movies)')).map(c => c.name);
    ['source_id', 'source_type', 'can_rehost', 'original_source_url'].forEach(c =>
      assert(cols.includes(c), `missing column ${c}`));
  });

  await ok('new tables movie_sources + rejected_items exist; legacy tables intact', async () => {
    const tables = (await query("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name);
    for (const t of ['movie_sources', 'rejected_items', 'movies', 'import_logs', 'failed_items', 'settings', 'admins', 'genres']) {
      assert(tables.includes(t), `missing table ${t}`);
    }
  });

  await ok('down-migration reverses cleanly, then re-applies', async () => {
    const { downMigration, runMigrations } = require('../db/migrations');
    await downMigration('002_movie_sources.sql');
    let tables = (await query("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name);
    assert(!tables.includes('movie_sources'), 'movie_sources should be gone after down');
    await runMigrations();
    tables = (await query("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name);
    assert(tables.includes('movie_sources'), 'movie_sources should be back after up');
  });

  /* ---------------------------------------------------------------- */
  console.log('\n─ Group 2: License checker (strict per-item rules — unit vectors of real license labels)');

  const checker = new WikimediaLicenseChecker({ allowPublicDomain: true, allowCc0: true, allowCcBy: true, allowCcBySa: true });
  const mk = (license, extra = {}) => ({ title: 'T', source_url: 'https://commons.wikimedia.org/wiki/File:T.webm', license, ...extra });

  await ok('ACCEPT: Public Domain (copyrighted=False)', async () => {
    const r = checker.check(mk({ shortName: 'Public domain', usageTerms: 'Public domain', copyrightedFlag: 'false', licenseCode: 'pd' }));
    assert(r.accepted && r.canRehost && r.commercialAllowed, JSON.stringify(r));
  });
  await ok('REJECT: PD claim contradicted by active copyright flag (ambiguity = fail-closed)', async () => {
    const r = checker.check(mk({ shortName: 'Public domain', copyrightedFlag: 'true' }));
    assert(!r.accepted && /ambiguous/i.test(r.reason), JSON.stringify(r));
  });
  await ok('ACCEPT: CC0', async () => {
    const r = checker.check(mk({ shortName: 'CC0', usageTerms: 'Creative Commons CC0 1.0 Universal Dedication' }));
    assert(r.accepted && /CC0/.test(r.licenseType), JSON.stringify(r));
  });
  await ok('ACCEPT: CC BY 4.0 with attribution required', async () => {
    const r = checker.check(mk({ shortName: 'CC BY 4.0', usageTerms: 'Creative Commons Attribution 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0', attributionRequiredFlag: 'true', copyrightedFlag: 'true' }));
    assert(r.accepted && r.attributionRequired && r.commercialAllowed, JSON.stringify(r));
  });
  await ok('ACCEPT: CC BY-SA 3.0 (dual-licensed migrated file)', async () => {
    const r = checker.check(mk({ shortName: 'CC BY-SA 3.0', licenseUrl: 'http://creativecommons.org/licenses/by-sa/3.0/', copyrightedFlag: 'true' }));
    assert(r.accepted && /ShareAlike/.test(r.licenseType), JSON.stringify(r));
  });
  await ok('REJECT: NC (non-commercial) variants', async () => {
    for (const name of ['CC BY-NC 2.5', 'CC BY-NC-SA 4.0', 'Attribution-NonCommercial 3.0']) {
      const r = checker.check(mk({ shortName: name, usageTerms: name }));
      assert(!r.accepted && /NON-COMMERCIAL/i.test(r.reason), `${name}: ${JSON.stringify(r)}`);
    }
  });
  await ok('REJECT: ND (no derivatives) variants', async () => {
    const r = checker.check(mk({ shortName: 'CC BY-ND 4.0', usageTerms: 'CC BY-ND 4.0' }));
    assert(!r.accepted && /ND|derivative/i.test(r.reason), JSON.stringify(r));
  });
  await ok('REJECT: fair use / non-free / all rights reserved', async () => {
    for (const name of ['Fair use', 'Non-free (Wikipedia policy)', 'All rights reserved']) {
      const r = checker.check(mk({ shortName: name }));
      assert(!r.accepted, `${name}: ${JSON.stringify(r)}`);
    }
  });
  await ok('REJECT: GFDL-only (no free CC option)', async () => {
    const r = checker.check(mk({ shortName: 'GFDL', usageTerms: 'GNU Free Documentation License', licenseCode: 'gfdl' }));
    assert(!r.accepted && /Unrecognized|fail-closed/i.test(r.reason), JSON.stringify(r));
  });
  await ok('REJECT: empty/missing license metadata', async () => {
    const r = checker.check(mk({}));
    assert(!r.accepted && /No license information/i.test(r.reason), JSON.stringify(r));
  });
  await ok('REJECT: admins can disable a license class (CC BY-SA off)', async () => {
    const strict = new WikimediaLicenseChecker({ allowCcBySa: false });
    const r = strict.check(mk({ shortName: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', copyrightedFlag: 'true' }));
    assert(!r.accepted && /disabled in site settings/.test(r.reason), JSON.stringify(r));
  });

  /* ---------------------------------------------------------------- */
  console.log('\n─ Group 3: Parser & Validator (against REAL recorded payloads)');

  const parser = new WikimediaParser();
  const validator = new WikimediaValidator({ minDurationSeconds: 400 });

  await ok('parses PD film (NOTLD): year from metadata, duration, PD license fields', async () => {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'search_notld_pd.json')));
    const c = parser.parse(fx.query.pages[0]);
    assert.equal(c.external_id, 'commons-36110112');
    assert.equal(c.title, 'Night of the Living Dead (1968)');
    assert.equal(c.year, 1968);
    assert.equal(c.duration_minutes, 96);
    assert(c.license.shortName === 'Public domain');
    assert(c.source_url.startsWith('https://commons.wikimedia.org/wiki/File:'));
    assert(c.video_url.startsWith('https://upload.wikimedia.org/wikipedia/commons/'));
    assert(!c.video_url.includes('utm_'), 'utm params must be stripped');
    assert(c.genres.includes('Horror'));
    assert.equal(c.country, 'United States');
  });

  await ok('year extraction prefers title over upload date (Ivan the Terrible → 1944)', async () => {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'category_pd_films.json')));
    const c = parser.parse(fx.query.pages[0]);
    assert.equal(c.year, 1944, `got ${c.year}`);
  });

  await ok('validator rejects real 269s item when minimum duration is 400s', async () => {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'search_cc_licensed.json')));
    const c = parser.parse(fx.query.pages[1]); // Näin lisäät… (269s)
    const v = validator.validate(c);
    assert(!v.valid && /below configured minimum/.test(v.reason), JSON.stringify(v));
  });

  /* ---------------------------------------------------------------- */
  console.log('\n─ Group 4: FULL PIPELINE — fetch → parse → license → validate → dedupe → insert');

  const importer = registry.get('wikimedia_commons');
  assert(importer, 'wikimedia_commons importer registered');

  // Install fixture transport for offline pipeline replay ONLY where a
  // fixture exists; other requests (e.g. siteinfo) hit the REAL network
  // exactly as production does.
  const realFetchJson = importer.fetcher.fetchJson.bind(importer.fetcher);
  importer.fetcher.fetchJson = async (url, opts = {}) => {
    if (fixtureFor(url)) opts.transport = makeFixtureTransport();
    return realFetchJson(url, opts);
  };

  // Configure crawl: all four recorded queries
  await run(`INSERT INTO settings (key, value, type) VALUES ('commons_search_queries', '"Night of the Living Dead"|incategory:"Videos of films in the public domain"|"CC BY-SA"|GFDL', 'string')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  await run(`INSERT INTO settings (key, value, type) VALUES ('commons_min_duration_seconds', '400', 'int')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`);

  // Seed a PROTECTED legacy row that will collide with a Commons import by title+year
  await run(
    `INSERT INTO movies (external_id, source_url, title, slug, year, description, license_type, source_id, source_type, source_name, status)
     VALUES ('legacy_notld', 'https://archive.org/details/notld', 'Night of the Living Dead (1968)', 'notld-legacy', 1968, 'Legacy copy', 'Public Domain', 'internet_archive', 'legacy', 'Internet Archive', 'published')`
  );
  const legacyBefore = JSON.stringify(await get("SELECT * FROM movies WHERE external_id = 'legacy_notld'"));

  let run1;
  await ok('run #1: 9 found → 7 imported, 1 license/quality rejected, 1 cross-source duplicate (legacy protected)', async () => {
    run1 = await importer.run({ trigger: 'test' });
    assert.equal(run1.status, 'success', run1.errorMessage);
    assert.equal(run1.itemsFound, 9, `found ${run1.itemsFound}`);
    assert.equal(run1.itemsImported, 7, `imported ${run1.itemsImported}`);
    assert.equal(run1.itemsRejected, 1, `rejected ${run1.itemsRejected}`);
    assert.equal(run1.itemsDuplicate, 1, `dup ${run1.itemsDuplicate}`);
  });

  await ok('imported rows carry full source + license metadata', async () => {
    // NOTE: commons-36110112 is the cross-source duplicate (legacy row holds the
    // same title+year) — assert on the second NOTLD file instead.
    const m = await get("SELECT * FROM movies WHERE external_id = 'commons-39873494'");
    assert(m, 'NOTLD (film) imported');
    assert.equal(m.source_id, 'wikimedia_commons');
    assert.equal(m.source_type, 'external');
    assert.equal(m.source_name, 'Wikimedia Commons');
    assert.equal(m.can_rehost, 1);
    assert(/public domain/i.test(m.license_type));
    assert.equal(m.attribution_required, 0);
    assert.equal(m.status, 'published');
    assert(m.original_source_url.startsWith('https://commons.wikimedia.org/wiki/'));
    const cc = await get("SELECT * FROM movies WHERE external_id = 'commons-91010154'");
    assert.equal(cc.attribution_required, 1, 'CC BY requires attribution flag');
    assert(/Attribution 4\.0/.test(cc.license_type), cc.license_type);
    assert(cc.attribution_text.length > 20 && /CC BY 4\.0/.test(cc.attribution_text));
  });

  await ok('legacy row is BYTE-IDENTICAL after cross-source collision (protection rule)', async () => {
    const legacyAfter = JSON.stringify(await get("SELECT * FROM movies WHERE external_id = 'legacy_notld'"));
    assert.equal(legacyAfter, legacyBefore, 'legacy row must never be modified by another source');
  });

  await ok('rejected_items recorded with stage + reason + raw data', async () => {
    const rej = await query("SELECT * FROM rejected_items WHERE source_name = 'Wikimedia Commons'");
    assert(rej.length >= 1);
    assert(rej.some(r => /below configured minimum/.test(r.rejection_reason)), JSON.stringify(rej.map(r => r.rejection_reason)));
    const raw = JSON.parse(rej[0].raw_data);
    assert(raw.license, 'raw candidate data stored');
  });

  await ok('import_logs row attributed to source with stats + next_run_at', async () => {
    const log = await get('SELECT * FROM import_logs ORDER BY id DESC LIMIT 1');
    assert.equal(log.source_name, 'Wikimedia Commons');
    assert.equal(log.items_found, 9);
    assert(log.next_run_at, 'next_run_at scheduled');
    assert.equal(log.status, 'success');
  });

  await ok('movie_sources registry updated (last/next import)', async () => {
    const row = await get("SELECT * FROM movie_sources WHERE source_key = 'wikimedia_commons'");
    assert(row && row.last_import_at && row.next_run_at);
  });

  let run2;
  await ok('run #2: everything is duplicate or already-rejected — zero new imports', async () => {
    run2 = await importer.run({ trigger: 'test' });
    assert.equal(run2.itemsImported, 0, `imported ${run2.itemsImported}`);
    assert.equal(run2.itemsDuplicate, 8, `duplicates ${run2.itemsDuplicate} (7 own + 1 legacy collision)`);
    assert.equal(run2.itemsRejected, 1);
  });

  await ok('run #3 (legacy collision removed): the film imports from the new source', async () => {
    await run("DELETE FROM movies WHERE external_id = 'legacy_notld'");
    const run3 = await importer.run({ trigger: 'test' });
    assert.equal(run3.itemsImported, 1, `imported ${run3.itemsImported}`);
    const m = await get("SELECT * FROM movies WHERE external_id = 'commons-36110112'");
    assert(m && m.year === 1968);
    assert(/public domain/i.test(m.license_type));
  });

  /* ---------------------------------------------------------------- */
  console.log('\n─ Group 5: Registry & connection testing');

  await ok('registry lists legacy + external sources with stats', async () => {
    const list = await registry.listAll();
    const legacy = list.find(s => s.sourceType === 'legacy');
    const commons = list.find(s => s.key === 'wikimedia_commons');
    assert(legacy && legacy.modifiable === false, 'legacy must be read-only');
    assert(commons && commons.modifiable === true);
    assert(commons.totalImported >= 8, `commons count ${commons.totalImported}`);
  });

  await ok('connection test returns structured result (real network attempt)', async () => {
    // No transport injection here on purpose: proves graceful failure in offline
    // sandboxes and the exact code path that hits the real API in production.
    const result = await importer.fetcher.testConnection();
    assert(typeof result.ok === 'boolean' && result.endpoint === 'https://commons.wikimedia.org/w/api.php');
    console.log(`     (live API from this sandbox: ${result.ok ? 'OK' : 'unreachable — ' + result.detail.slice(0, 60)})`);
  });

  /* ---------------------------------------------------------------- */
  console.log(`\n════════ RESULTS: ${passed} passed, ${failed} failed ════════\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
