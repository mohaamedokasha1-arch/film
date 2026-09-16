/**
 * SourceRegistry — discovery, registration and lifecycle management for
 * every movie source (legacy + external). Adding a third source later is a
 * one-file operation: implement the source, require it here, register it.
 */

const { get, run, query } = require('../../db/database');

class SourceRegistry {
  constructor() {
    this.sources = new Map(); // key -> importer instance (BaseImporter subclass)
    this.legacyDescriptors = new Map(); // key -> read-only descriptor for the legacy source
  }

  /** Register a fully wired BaseImporter instance */
  register(importer) {
    this.sources.set(importer.key, importer);
    return importer;
  }

  /**
   * Register a LEGACY descriptor (read-only view over the pre-existing
   * importer — the legacy importer itself is never modified by this system).
   */
  registerLegacy(descriptor) {
    this.legacyDescriptors.set(descriptor.key, descriptor);
  }

  get(key) {
    return this.sources.get(key) || null;
  }

  getLegacy(key) {
    return this.legacyDescriptors.get(key) || null;
  }

  /** Ensure every registered source has a movie_sources row (idempotent) */
  async ensureDbRows() {
    for (const importer of this.sources.values()) {
      const row = await get('SELECT id FROM movie_sources WHERE source_key = ?', [importer.key]);
      if (!row) {
        await run(
          `INSERT INTO movie_sources (source_key, name, source_type, status) VALUES (?, ?, ?, 'registered')`,
          [importer.key, importer.name, importer.sourceType]
        );
      } else {
        await run('UPDATE movie_sources SET name = ? WHERE source_key = ?', [importer.name, importer.key]);
      }
    }
  }

  /**
   * Full listing for the admin page: legacy card(s) + every registered source,
   * enriched with live stats and scheduling state.
   */
  async listAll() {
    await this.ensureDbRows();
    const result = [];

    for (const descriptor of this.legacyDescriptors.values()) {
      result.push(await descriptor.getAdminView());
    }

    for (const importer of this.sources.values()) {
      const row = await get('SELECT * FROM movie_sources WHERE source_key = ?', [importer.key]);
      const counts = await get(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) as published
         FROM movies WHERE source_id = ?`, [importer.sourceId]
      );
      const lastLog = await get(
        'SELECT * FROM import_logs WHERE source_name = ? ORDER BY started_at DESC LIMIT 1',
        [importer.name]
      );
      result.push({
        key: importer.key,
        name: importer.name,
        sourceType: importer.sourceType,
        officialUrl: importer.meta.officialUrl,
        licensePolicyUrl: importer.meta.licensePolicyUrl,
        apiDocsUrl: importer.meta.apiDocsUrl,
        enabled: row ? !!row.enabled : true,
        status: row ? row.status : 'registered',
        connectionStatus: row ? row.connection_status : null,
        lastConnectionTest: row ? row.last_connection_test : null,
        lastImportAt: row ? row.last_import_at : null,
        nextRunAt: row ? row.next_run_at : null,
        totalImported: counts ? (counts.total || 0) : 0,
        publishedImported: counts ? (counts.published || 0) : 0,
        lastRun: lastLog,
        isRunning: importer.isRunning,
        modifiable: true
      });
    }

    return result;
  }

  async runSource(key, opts = {}) {
    const importer = this.sources.get(key);
    if (!importer) throw new Error(`Unknown source: ${key}`);
    return importer.run(opts);
  }

  async runAllEnabled(trigger = 'scheduler') {
    await this.ensureDbRows();
    const results = [];
    for (const importer of this.sources.values()) {
      const row = await get('SELECT enabled FROM movie_sources WHERE source_key = ?', [importer.key]);
      if (row && !row.enabled) continue;
      try {
        const res = await importer.run({ trigger });
        results.push({ source: importer.key, ...res });
      } catch (err) {
        results.push({ source: importer.key, status: 'failed', errorMessage: err.message });
      }
    }
    return results;
  }

  async setEnabled(key, enabled) {
    const row = await get('SELECT id FROM movie_sources WHERE source_key = ?', [key]);
    if (!row) throw new Error(`Unknown source: ${key}`);
    await run(
      'UPDATE movie_sources SET enabled = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE source_key = ?',
      [enabled ? 1 : 0, enabled ? 'active' : 'disabled', key]
    );
  }

  async setConnectionStatus(key, status) {
    await run(
      'UPDATE movie_sources SET connection_status = ?, last_connection_test = CURRENT_TIMESTAMP WHERE source_key = ?',
      [status, key]
    );
  }

  isAnyExternalRunning() {
    for (const importer of this.sources.values()) {
      if (importer.isRunning) return importer.key;
    }
    return null;
  }
}

module.exports = SourceRegistry;
