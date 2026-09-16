/**
 * Duplicate Detector for AKASHA HUB
 * Checks whether an incoming movie already exists in the database
 * using External ID, Source URL, or Normalized Title + Year.
 */

const { query, get } = require('../db/database');

class DuplicateDetector {
  /**
   * Check if movie exists
   * @param {Object} item - Parsed item with external_id, source_url, title, year
   * @returns {Object} { isDuplicate: boolean, existingMovie: Object | null, matchReason: string | null }
   */
  static async check(item) {
    // 1. Check by External Source ID (highest priority)
    if (item.external_id) {
      const byExternalId = await get('SELECT * FROM movies WHERE external_id = ?', [item.external_id]);
      if (byExternalId) {
        return {
          isDuplicate: true,
          existingMovie: byExternalId,
          matchReason: `Matched External Source ID: ${item.external_id}`
        };
      }
    }

    // 2. Check by exact Source URL
    if (item.source_url) {
      const byUrl = await get('SELECT * FROM movies WHERE source_url = ?', [item.source_url]);
      if (byUrl) {
        return {
          isDuplicate: true,
          existingMovie: byUrl,
          matchReason: `Matched Source URL: ${item.source_url}`
        };
      }
    }

    // 3. Check by Normalized Title and Year (if year is valid)
    if (item.title && item.year) {
      const normalizedTitle = item.title.trim().toLowerCase();
      const byTitleYear = await get(
        'SELECT * FROM movies WHERE LOWER(TRIM(title)) = ? AND year = ?',
        [normalizedTitle, item.year]
      );
      if (byTitleYear) {
        return {
          isDuplicate: true,
          existingMovie: byTitleYear,
          matchReason: `Matched Normalized Title ("${item.title}") and Year (${item.year})`
        };
      }
    }

    return {
      isDuplicate: false,
      existingMovie: null,
      matchReason: null
    };
  }

  /**
   * Checks whether incoming item contains richer / newer information than the existing movie
   */
  static shouldUpdate(existing, incoming) {
    let hasEnrichment = false;
    const updates = {};

    // Check if new description is longer and existing was empty or very short
    if ((!existing.description || existing.description.length < 50) && incoming.description && incoming.description.length > 50) {
      updates.description = incoming.description;
      hasEnrichment = true;
    }

    // Check if poster was missing and now available
    if (!existing.poster_url && incoming.poster_url) {
      updates.poster_url = incoming.poster_url;
      hasEnrichment = true;
    }

    // Check if director was unknown and now available
    if ((!existing.director || existing.director === 'Unknown Director') && incoming.director && incoming.director !== 'Unknown Director') {
      updates.director = incoming.director;
      hasEnrichment = true;
    }

    // Check if duration was missing and now available
    if (!existing.duration && incoming.duration) {
      updates.duration = incoming.duration;
      updates.duration_raw = incoming.duration_raw;
      hasEnrichment = true;
    }

    return { hasEnrichment, updates };
  }
}

module.exports = DuplicateDetector;
