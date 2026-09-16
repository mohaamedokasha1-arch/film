/**
 * Automatic Movie Importer Engine for AKAVOX
 * Orchestrates Fetching, License Validation, Cleaning, Deduplication, and Database Storage.
 */

const { query, get, run, getSetting, setSetting } = require('../db/database');
const ArchiveFetcher = require('./archiveFetcher');
const LicenseValidator = require('./licenseValidator');
const DataCleaner = require('./dataCleaner');
const DuplicateDetector = require('./duplicateDetector');

class MovieImporter {
  constructor() {
    this.fetcher = new ArchiveFetcher();
    this.isImportRunning = false;
    this.activeLogListeners = new Set();
  }

  /**
   * Register a callback listener for real-time live log events
   */
  addLogListener(callback) {
    this.activeLogListeners.add(callback);
    return () => this.activeLogListeners.delete(callback);
  }

  /**
   * Broadcast real-time log event
   */
  emitLog(logObj) {
    for (const listener of this.activeLogListeners) {
      try {
        listener(logObj);
      } catch (err) {
        console.error('Error emitting live log:', err);
      }
    }
  }

  /**
   * Synchronize genres table with movie counts
   */
  async syncGenre(genreName, movieId) {
    const slug = genreName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // Ensure genre exists
    let genre = await get('SELECT id, movie_count FROM genres WHERE slug = ?', [slug]);
    if (!genre) {
      const res = await run('INSERT INTO genres (name, slug, movie_count) VALUES (?, ?, 1)', [genreName, slug]);
      genre = { id: res.lastID, movie_count: 1 };
    } else {
      await run('UPDATE genres SET movie_count = movie_count + 1 WHERE id = ?', [genre.id]);
    }

    // Link movie_genres
    try {
      await run(
        'INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)',
        [movieId, genre.id]
      );
    } catch (e) {}
  }

  /**
   * Ensures slug uniqueness in the database
   */
  async ensureUniqueSlug(baseSlug, currentId = null) {
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await get('SELECT id FROM movies WHERE slug = ?', [slug]);
      if (!existing || (currentId && existing.id === currentId)) {
        return slug;
      }
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  /**
   * Main Import Pipeline Runner
   */
  async runImport({ rows = null, page = 1, trigger = 'scheduler' } = {}) {
    if (this.isImportRunning) {
      const msg = 'An import process is already active. Please wait for it to complete.';
      console.warn(`[MovieImporter] ${msg}`);
      return { status: 'busy', message: msg };
    }

    this.isImportRunning = true;
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    // Load active settings from database
    const rowsSetting = rows || await getSetting('archive_rows_per_import', 15);
    const collectionsStr = await getSetting('archive_search_collections', 'feature_films,silent_films,Comedy_Films');
    const collections = collectionsStr.split(',').map(s => s.trim()).filter(Boolean);
    const autoPublish = await getSetting('auto_publish', true);
    const sortOrder = await getSetting('archive_sort_order', 'downloads desc');

    const licenseSettings = {
      license_allow_public_domain: await getSetting('license_allow_public_domain', true),
      license_allow_cc0: await getSetting('license_allow_cc0', true),
      license_allow_cc_by: await getSetting('license_allow_cc_by', true),
      license_allow_cc_by_sa: await getSetting('license_allow_cc_by_sa', true),
      license_allow_cc_nc: await getSetting('license_allow_cc_nc', false),
      license_allow_cc_nd: await getSetting('license_allow_cc_nd', false),
      public_domain_cutoff_year: await getSetting('public_domain_cutoff_year', 1929)
    };

    const validator = new LicenseValidator(licenseSettings);

    // Create log record in DB
    const logResult = await run(
      `INSERT INTO import_logs (started_at, status, log_details) VALUES (?, 'running', '[]')`,
      [startedAt]
    );
    const importLogId = logResult.lastID;

    const detailedEvents = [];
    const recordEvent = (type, message, data = {}) => {
      const event = { time: new Date().toISOString(), type, message, ...data };
      detailedEvents.push(event);
      this.emitLog({ importId: importLogId, ...event });
    };

    recordEvent('info', `Starting automated import (Trigger: ${trigger}, Batch size: ${rowsSetting}, Collections: ${collections.join(', ')})`);

    let itemsFound = 0;
    let itemsImported = 0;
    let itemsSkipped = 0;
    let itemsFailed = 0;
    let licenseRejections = 0;
    let duplicateRejections = 0;
    let errorMessage = null;

    try {
      // 1. Fetch search batch from Internet Archive
      recordEvent('fetch', `Connecting to Internet Archive API...`);
      const searchDocs = await this.fetcher.searchMovies({
        collections,
        rows: rowsSetting,
        page,
        sort: sortOrder
      });

      itemsFound = searchDocs.length;
      recordEvent('fetch_success', `Discovered ${itemsFound} candidate movie entries from Internet Archive`);

      // 2. Process each movie candidate through strict pipeline
      for (let i = 0; i < searchDocs.length; i++) {
        const doc = searchDocs[i];
        const identifier = doc.identifier;
        const rawTitle = doc.title || identifier;

        recordEvent('processing_item', `[${i + 1}/${itemsFound}] Analyzing: "${rawTitle}" (${identifier})`, { identifier });

        // A. Check if permanently ignored in failed_items
        const ignored = await get('SELECT id, failure_reason FROM failed_items WHERE external_id = ? AND permanently_ignored = 1', [identifier]);
        if (ignored) {
          itemsSkipped++;
          recordEvent('skipped', `Skipped permanently ignored item: ${identifier} (${ignored.failure_reason})`, { identifier });
          continue;
        }

        // B. Fetch deep metadata for complete license & file verification
        let fullMeta;
        try {
          fullMeta = await this.fetcher.getItemMetadata(identifier);
        } catch (fetchErr) {
          console.warn(`[MovieImporter] Metadata fetch error for ${identifier}:`, fetchErr.message);
          // Fall back to doc fields if metadata endpoint fails
          fullMeta = { metadata: doc, files: [] };
        }

        const mergedMeta = { ...doc, ...fullMeta.metadata };

        // C. LICENSE VALIDATOR (Crucial step)
        const licenseCheck = validator.validate(mergedMeta);
        if (!licenseCheck.isValid) {
          licenseRejections++;
          itemsFailed++;
          recordEvent('license_rejected', `❌ License REJECTED: "${rawTitle}" - ${licenseCheck.rejectionReason}`, {
            identifier,
            reason: licenseCheck.rejectionReason
          });

          // Record in failed_items table
          await run(
            `INSERT INTO failed_items (external_id, source_url, title, failure_reason, license_issue, metadata_snapshot)
             VALUES (?, ?, ?, ?, 1, ?)`,
            [
              identifier,
              `https://archive.org/details/${identifier}`,
              rawTitle,
              licenseCheck.rejectionReason,
              JSON.stringify(mergedMeta)
            ]
          );
          continue;
        }

        recordEvent('license_accepted', `✅ License VERIFIED: ${licenseCheck.licenseType} (${licenseCheck.commercialAllowed ? 'Commercial allowed' : ''})`, { identifier, license: licenseCheck.licenseType });

        // D. DATA CLEANER
        const cleanTitle = DataCleaner.normalizeTitle(mergedMeta.title || rawTitle);
        const year = DataCleaner.normalizeYear(mergedMeta.date, mergedMeta.year);
        const description = DataCleaner.cleanText(mergedMeta.description || `${cleanTitle} (${year || 'Classic film'}) restored and preserved by the Internet Archive.`);
        const durationInfo = DataCleaner.normalizeDuration(mergedMeta.runtime, fullMeta.files);
        const genresList = DataCleaner.normalizeGenres(mergedMeta.subject, mergedMeta.collection);
        const director = DataCleaner.normalizeDirector(mergedMeta.director, mergedMeta.creator);
        const castMembers = DataCleaner.normalizeCast(mergedMeta.cast, description);
        const sourceUrl = `https://archive.org/details/${identifier}`;
        const posterUrl = `https://archive.org/services/img/${identifier}`;
        const embedUrl = `https://archive.org/embed/${identifier}`;

        // Locate video stream file if present
        let videoUrl = null;
        if (fullMeta.files && Array.isArray(fullMeta.files)) {
          const mp4File = fullMeta.files.find(f => (f.format === 'h.264' || f.name?.endsWith('.mp4')) && !f.name?.includes('thumb'));
          if (mp4File && fullMeta.server && fullMeta.dir) {
            videoUrl = `https://${fullMeta.server}${fullMeta.dir}/${mp4File.name}`;
          }
        }

        // E. DUPLICATE DETECTOR
        const candidateRecord = {
          external_id: identifier,
          source_url: sourceUrl,
          title: cleanTitle,
          year
        };

        const dupCheck = await DuplicateDetector.check(candidateRecord);
        if (dupCheck.isDuplicate) {
          duplicateRejections++;
          itemsSkipped++;

          // Check if enrichment is beneficial
          const { hasEnrichment, updates } = DuplicateDetector.shouldUpdate(dupCheck.existingMovie, {
            description,
            poster_url: posterUrl,
            director,
            duration: durationInfo.minutes,
            duration_raw: durationInfo.raw
          });

          if (hasEnrichment) {
            const updateFields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(dupCheck.existingMovie.id);
            await run(`UPDATE movies SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
            recordEvent('duplicate_updated', `Duplicate detected but enriched existing record: "${cleanTitle}"`, { identifier });
          } else {
            recordEvent('duplicate_skipped', `Duplicate skipped (${dupCheck.matchReason}): "${cleanTitle}"`, { identifier });
          }
          continue;
        }

        // F. GENERATE UNIQUE SLUG
        const baseSlug = DataCleaner.generateSlug(cleanTitle, year);
        const uniqueSlug = await this.ensureUniqueSlug(baseSlug);

        // G. DATABASE STORAGE
        const movieStatus = autoPublish ? 'published' : 'draft';

        const insertResult = await run(
          `INSERT INTO movies (
            external_id, source_url, title, original_title, slug, year,
            description, duration, duration_raw, language, poster_url, video_url,
            embed_url, director, cast_members, genres, license_type, license_url,
            rights_statement, attribution_required, attribution_text, source_name,
            status, imported_at, last_checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            identifier,
            sourceUrl,
            cleanTitle,
            cleanTitle,
            uniqueSlug,
            year,
            description,
            durationInfo.minutes,
            durationInfo.raw,
            mergedMeta.language || 'English',
            posterUrl,
            videoUrl,
            embedUrl,
            director,
            JSON.stringify(castMembers),
            JSON.stringify(genresList),
            licenseCheck.licenseType,
            licenseCheck.licenseUrl,
            licenseCheck.rightsStatement,
            licenseCheck.attributionRequired ? 1 : 0,
            licenseCheck.attributionText,
            'Internet Archive',
            movieStatus
          ]
        );

        const newId = insertResult.lastID;
        itemsImported++;

        // H. SYNC GENRES
        for (const g of genresList) {
          await this.syncGenre(g, newId);
        }

        recordEvent('imported', `🎉 Successfully imported: "${cleanTitle}" (${year || 'N/A'}) [${uniqueSlug}]`, {
          identifier,
          id: newId,
          slug: uniqueSlug,
          title: cleanTitle
        });
      }

    } catch (err) {
      errorMessage = err.message;
      recordEvent('error', `Import job failed with unexpected error: ${err.message}`, { stack: err.stack });
      console.error('[MovieImporter] Fatal error during import:', err);
    } finally {
      this.isImportRunning = false;
      const endTime = Date.now();
      const durationSeconds = Math.round((endTime - startTime) / 1000);
      const endedAt = new Date().toISOString();

      let finalStatus = 'success';
      if (errorMessage) finalStatus = 'failed';
      else if (itemsImported === 0 && itemsFound > 0) finalStatus = 'partial';

      // Update import log record in database
      await run(
        `UPDATE import_logs SET
          ended_at = ?,
          duration_seconds = ?,
          items_found = ?,
          items_imported = ?,
          items_skipped = ?,
          items_failed = ?,
          license_rejections = ?,
          duplicate_rejections = ?,
          status = ?,
          error_message = ?,
          log_details = ?
        WHERE id = ?`,
        [
          endedAt,
          durationSeconds,
          itemsFound,
          itemsImported,
          itemsSkipped,
          itemsFailed,
          licenseRejections,
          duplicateRejections,
          finalStatus,
          errorMessage,
          JSON.stringify(detailedEvents),
          importLogId
        ]
      );

      if (finalStatus !== 'failed') {
        await setSetting('last_successful_import', endedAt, 'string');
      }

      recordEvent('completed', `Import run completed. Status: ${finalStatus}. Imported: ${itemsImported}, Skipped: ${itemsSkipped}, License Rejected: ${licenseRejections}, Failed: ${itemsFailed}, Duration: ${durationSeconds}s`);
    }

    return {
      importLogId,
      status: errorMessage ? 'failed' : 'success',
      itemsFound,
      itemsImported,
      itemsSkipped,
      itemsFailed,
      licenseRejections,
      duplicateRejections,
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
      errorMessage
    };
  }
}

// Export singleton instance
const movieImporter = new MovieImporter();
module.exports = movieImporter;
