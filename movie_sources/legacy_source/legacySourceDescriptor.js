/**
 * LEGACY SOURCE DESCRIPTOR — READ-ONLY INTEGRATION POINT
 * -------------------------------------------------------
 * This descriptor exposes the PRE-EXISTING Internet Archive pipeline
 * (services/importer.js + services/archiveFetcher.js + services/licenseValidator.js)
 * inside the new "Movie Sources" admin UI **without modifying a single line**
 * of the legacy code. "Run Now" simply delegates to the existing importer.
 *
 * DO NOT ADD BEHAVIOR HERE THAT CHANGES THE LEGACY PIPELINE.
 */

const { get, query } = require('../../db/database');

const legacySourceDescriptor = {
  key: 'internet_archive',
  name: 'Internet Archive (Legacy Source)',
  sourceType: 'legacy',

  async getAdminView() {
    const counts = await get('SELECT COUNT(*) as total FROM movies');
    const legacyCounts = await get(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) as published FROM movies WHERE source_id = 'internet_archive' OR source_id IS NULL"
    );
    const lastModified = await get('SELECT MAX(updated_at) as last_modified FROM movies');
    const lastLog = await get('SELECT * FROM import_logs WHERE source_name = ? OR source_name IS NULL ORDER BY started_at DESC LIMIT 1', ['Internet Archive']);
    const logCount = await get('SELECT COUNT(*) as c FROM import_logs');

    return {
      key: this.key,
      name: 'Internet Archive (Legacy Source)',
      sourceType: 'legacy',
      officialUrl: 'https://archive.org',
      licensePolicyUrl: 'https://help.archive.org/help/public-domain/',
      apiDocsUrl: 'https://archive.org/developers/idxsearch.html',
      enabled: true, // the legacy pipeline is always preserved & active
      status: 'active',
      connectionStatus: null, // not probed by the new system (do not touch legacy)
      lastConnectionTest: null,
      lastImportAt: lastLog ? lastLog.started_at : null,
      nextRunAt: null, // managed by the legacy scheduler (services/scheduler.js)
      totalImported: legacyCounts ? (legacyCounts.total || 0) : 0,
      publishedImported: legacyCounts ? (legacyCounts.published || 0) : 0,
      totalMoviesAllSources: counts ? counts.total : 0,
      lastModified: lastModified ? lastModified.last_modified : null,
      importRuns: logCount ? logCount.c : 0,
      lastRun: lastLog,
      isRunning: false, // legacy importer state is internal to services/importer.js
      modifiable: false, // admin UI must not allow disabling/modifying the legacy source
      protectionNote: 'Protected legacy pipeline — cannot be disabled or modified from the sources manager.'
    };
  }
};

module.exports = legacySourceDescriptor;
