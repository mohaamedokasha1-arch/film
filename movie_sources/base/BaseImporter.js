/**
 * BaseImporter — abstract import pipeline orchestrator.
 *
 * Pipeline per candidate item:
 *   fetch → parse → LICENSE CHECK → validate → duplicate check → insert
 *
 * Responsibilities:
 *  - writes its own import_logs rows (attributed via source_name)
 *  - records rejected candidates in rejected_items (with reason + raw data)
 *  - keeps the movie_sources registry row (status/last/next run) current
 *  - broadcasts live progress events for the admin SSE console
 *  - guarantees failure isolation: one bad item never aborts the batch
 */

const { run, get } = require('../../db/database');

// Process-wide lock: only one import may run at a time across ALL sources
// (the legacy importer has its own independent guard in services/importer.js).
const globalLock = { active: false, sourceKey: null };

class BaseImporter {
  /**
   * @param {Object} spec
   * @param {string} spec.key           unique registry key, e.g. 'wikimedia_commons'
   * @param {string} spec.name          display name
   * @param {string} spec.sourceType    e.g. 'external'
   * @param {string} spec.sourceId      value stored in movies.source_id
   * @param {Object} spec.fetcher       implements fetchBatch() + testConnection()
   * @param {Object} spec.parser        implements parse(raw)
   * @param {Object} spec.licenseChecker implements check(item)
   * @param {Object} spec.validator     implements validate(record)
   * @param {Object} spec.duplicateChecker implements check(candidate, {sourceKey})
   * @param {Function} spec.loadSettings async () => resolved configuration
   * @param {Object} spec.meta          official URL / docs / license policy summary
   */
  constructor(spec) {
    this.key = spec.key;
    this.name = spec.name;
    this.sourceType = spec.sourceType || 'external';
    this.sourceId = spec.sourceId || spec.key;
    this.fetcher = spec.fetcher;
    this.parser = spec.parser;
    this.licenseChecker = spec.licenseChecker;
    this.validator = spec.validator;
    this.duplicateChecker = spec.duplicateChecker;
    this.loadSettings = spec.loadSettings;
    this.meta = spec.meta || {};
    this.activeLogListeners = new Set();
    this.isRunning = false;
  }

  /* -------------------- live event stream -------------------- */

  addLogListener(cb) {
    this.activeLogListeners.add(cb);
    return () => this.activeLogListeners.delete(cb);
  }

  emit(event) {
    for (const listener of this.activeLogListeners) {
      try { listener(event); } catch (e) { /* listener errors must never break imports */ }
    }
  }

  /* -------------------- import run -------------------- */

  async run({ limit = null, trigger = 'scheduler' } = {}) {
    if (this.isRunning || globalLock.active) {
      const msg = globalLock.active && globalLock.sourceKey !== this.key
        ? `Another source import (${globalLock.sourceKey}) is active.`
        : `Import for ${this.key} is already running.`;
      return { status: 'busy', message: msg };
    }

    this.isRunning = true;
    globalLock.active = true;
    globalLock.sourceKey = this.key;

    const startTime = Date.now();
    const startedAt = new Date().toISOString();
    const settings = await this.loadSettings();
    const batchLimit = limit || settings.batchSize || 10;

    const logResult = await run(
      `INSERT INTO import_logs (started_at, status, source_name, log_details, metadata)
       VALUES (?, 'running', ?, '[]', '{}')`,
      [startedAt, this.name]
    );
    const importLogId = logResult.lastID;

    const events = [];
    const record = (type, message, data = {}) => {
      const ev = { time: new Date().toISOString(), type, message, ...data };
      events.push(ev);
      this.emit({ importId: importLogId, source: this.key, ...ev });
    };

    let itemsFound = 0, itemsImported = 0, itemsSkipped = 0, itemsRejected = 0, itemsDuplicate = 0;
    let errorMessage = null;

    try {
      record('fetch', `Connecting to ${this.meta.officialUrl || this.name}…`);
      const rawItems = await this.fetcher.fetchBatch({ limit: batchLimit, settings });
      itemsFound = rawItems.length;
      record('fetch_success', `Discovered ${itemsFound} candidate items`, { count: itemsFound });

      for (let i = 0; i < rawItems.length; i++) {
        try {
          const outcome = await this._processItem(rawItems[i], settings);
          switch (outcome.stage) {
            case 'imported': itemsImported++; break;
            case 'rejected': itemsRejected++; break;
            case 'duplicate': itemsDuplicate++; break;
            case 'skipped': itemsSkipped++; break;
          }
        } catch (itemErr) {
          itemsRejected++;
          record('error', `Item ${i + 1} failed processing: ${itemErr.message}`);
          await this._recordRejection({
            title: `Unknown item #${i + 1}`,
            stage: 'processing',
            reason: itemErr.message,
            rawData: {}
          });
        }
      }
    } catch (err) {
      errorMessage = err.message;
      record('error', `Import run failed: ${err.message}`, { stack: err.stack });
    } finally {
      this.isRunning = false;
      globalLock.active = false;
      globalLock.sourceKey = null;

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      const endedAt = new Date().toISOString();
      const finalStatus = errorMessage
        ? 'failed'
        : (itemsImported === 0 && itemsFound > 0 ? 'partial' : 'success');

      try {
        await run(
          `UPDATE import_logs SET ended_at = ?, duration_seconds = ?, items_found = ?, items_imported = ?,
           items_skipped = ?, items_rejected = ?, items_duplicate = ?, status = ?, error_message = ?,
           log_details = ?, next_run_at = ?, metadata = ? WHERE id = ?`,
          [
            endedAt, durationSeconds, itemsFound, itemsImported, itemsSkipped, itemsRejected,
            itemsDuplicate, finalStatus, errorMessage, JSON.stringify(events),
            this._nextRunIso(settings), JSON.stringify({ source_key: this.key, trigger }),
            importLogId
          ].map(v => v === undefined ? null : v)
        );
      } catch (logErr) {
        console.error(`[${this.key}] Failed to finalize import log:`, logErr.message);
      }

      if (finalStatus !== 'failed') {
        await this._updateRegistryRow({ lastImportAt: endedAt, nextRunAt: this._nextRunIso(settings), status: 'active' });
      } else {
        await this._updateRegistryRow({ status: 'error', lastImportAt: endedAt, nextRunAt: this._nextRunIso(settings) });
      }

      record('completed', `Run finished [${finalStatus}] — found ${itemsFound}, imported ${itemsImported}, rejected ${itemsRejected}, duplicates ${itemsDuplicate}, duration ${durationSeconds}s`);
    }

    return {
      importLogId,
      status: errorMessage ? 'failed' : 'success',
      itemsFound, itemsImported, itemsSkipped, itemsRejected, itemsDuplicate,
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
      errorMessage
    };
  }

  async _processItem(rawItem, settings) {
    // 1. PARSE
    const candidate = this.parser.parse(rawItem);
    if (!candidate) {
      return { stage: 'skipped' };
    }
    this.emit({ time: new Date().toISOString(), type: 'processing_item', source: this.key, message: `Analyzing: "${candidate.title}"` });

    // 2. LICENSE CHECK (non-negotiable legal gate)
    const license = this.licenseChecker.check(candidate);
    if (!license.accepted) {
      this.emit({ time: new Date().toISOString(), type: 'license_rejected', source: this.key, message: `❌ License REJECTED: "${candidate.title}" — ${license.reason}` });
      await this._recordRejection({ title: candidate.title, externalId: candidate.external_id, sourceUrl: candidate.source_url, stage: 'license', reason: license.reason, rawData: candidate });
      return { stage: 'rejected' };
    }
    this.emit({ time: new Date().toISOString(), type: 'license_accepted', source: this.key, message: `✅ License VERIFIED: ${license.licenseType}${license.commercialAllowed ? ' (commercial+ads allowed)' : ''}` });

    // 3. VALIDATION (data quality)
    const candidateWithDuration = { ...candidate, duration_seconds: candidate.duration_seconds };
    const validation = this.validator.validate(candidateWithDuration);
    if (!validation.valid) {
      this.emit({ time: new Date().toISOString(), type: 'validation_rejected', source: this.key, message: `⚠️ Validation rejected: "${candidate.title}" — ${validation.reason}` });
      await this._recordRejection({ title: candidate.title, externalId: candidate.external_id, sourceUrl: candidate.source_url, stage: 'validation', reason: validation.reason, rawData: candidate });
      return { stage: 'rejected' };
    }

    // 4. DUPLICATE CHECK (cross-source protection included)
    const dup = await this.duplicateChecker.check(candidate, { sourceKey: this.sourceId });
    if (dup.isDuplicate) {
      this.emit({ time: new Date().toISOString(), type: 'duplicate_skipped', source: this.key, message: `Duplicate skipped (${dup.matchReason})` });
      return { stage: 'duplicate' };
    }

    // 5. PERSIST
    const inserted = await this._insertMovie(candidate, license, settings);
    this.emit({ time: new Date().toISOString(), type: 'imported', source: this.key, message: `🎉 Imported: "${candidate.title}" (${candidate.year})`, id: inserted.lastID });
    return { stage: 'imported' };
  }

  async _insertMovie(candidate, license, settings) {
    // Avoid duplicated years in slugs when the title already ends with (year)
    const titleSlug = this._slugify(candidate.title);
    const baseSlug = titleSlug.endsWith(`-${candidate.year}`) ? titleSlug : this._slugify(`${candidate.title}-${candidate.year || ''}`);
    let slug = baseSlug;
    let counter = 1;
    while (await get('SELECT id FROM movies WHERE slug = ?', [slug])) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return run(
      `INSERT INTO movies (
        external_id, source_url, title, original_title, slug, year, description,
        duration, duration_raw, language, poster_url, video_url, embed_url,
        director, cast_members, genres, license_type, license_url,
        rights_statement, attribution_required, attribution_text,
        source_id, source_type, source_name, can_rehost, original_source_url,
        status, imported_at, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        candidate.external_id,
        candidate.source_url,
        candidate.title,
        candidate.original_title || candidate.title,
        slug,
        candidate.year,
        candidate.description,
        candidate.duration_minutes || null,
        candidate.duration_raw || null,
        candidate.language || null,
        candidate.poster_url || null,
        candidate.video_url,
        candidate.embed_url || null,
        candidate.director || null,
        JSON.stringify(candidate.cast_members || []),
        JSON.stringify(candidate.genres || []),
        license.licenseType,
        license.licenseUrl,
        license.licenseType + (license.licenseUrl ? ` (${license.licenseUrl})` : ''),
        license.attributionRequired ? 1 : 0,
        license.attributionText || '',
        this.sourceId,
        this.sourceType,
        this.name,
        license.canRehost ? 1 : 0,
        candidate.source_url,
        settings.autoPublish === false ? 'draft' : 'published'
      ]
    );
  }

  async _recordRejection({ title, externalId, sourceUrl, stage, reason, rawData }) {
    // Avoid spamming identical rejections across runs
    const existing = await get(
      'SELECT id FROM rejected_items WHERE source_name = ? AND external_id = ? AND rejection_reason = ?',
      [this.name, externalId || '', reason]
    );
    if (existing) return;
    await run(
      `INSERT INTO rejected_items (source_name, item_title, external_id, source_url, rejection_stage, rejection_reason, raw_data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [this.name, title || null, externalId || null, sourceUrl || null, stage, reason, JSON.stringify(rawData || {})]
    );
  }

  async _updateRegistryRow({ lastImportAt, nextRunAt, status }) {
    const row = await get('SELECT id FROM movie_sources WHERE source_key = ?', [this.key]);
    if (!row) {
      // Self-healing: the registry row should already exist (created at
      // startup), but never let its absence lose import statistics.
      await run(
        `INSERT INTO movie_sources (source_key, name, source_type, status, last_import_at, next_run_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [this.key, this.name, this.sourceType, status || 'active', lastImportAt || null, nextRunAt || null]
      );
      return;
    }
    await run(
      `UPDATE movie_sources SET status = ?, last_import_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE source_key = ?`,
      [status || 'active', lastImportAt || null, nextRunAt || null, this.key]
    );
  }

  _nextRunIso(settings) {
    const hours = settings.frequencyHours || 6;
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  _slugify(text) {
    return String(text)
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9\u0600-\u06FF\u0400-\u04FF\u0900-\u097F]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'film';
  }

  /**
   * Registry information for the admin "Movie Sources" page.
   */
  async getSourceInfo() {
    return {
      key: this.key,
      name: this.name,
      sourceType: this.sourceType,
      isRunning: this.isRunning,
      meta: this.meta
    };
  }
}

BaseImporter.globalLock = globalLock;
module.exports = BaseImporter;
