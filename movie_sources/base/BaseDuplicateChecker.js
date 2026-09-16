/**
 * BaseDuplicateChecker — prevents duplicate imports.
 *
 * Matching order:
 *   1. external_id   (exact, source-prefixed — e.g. "commons-12345")
 *   2. source_url    (canonical origin page)
 *   3. title + year  (normalized, ACROSS sources — protects against importing
 *                     the same film twice from two different archives)
 *
 * LEGACY PROTECTION RULE: enrichment updates are ONLY ever applied to rows
 * that belong to the SAME source (source_id match). Rows from other sources —
 * especially legacy Internet Archive movies — are never modified.
 */

const { get } = require('../../db/database');

class BaseDuplicateChecker {
  async check(candidate, { sourceKey } = {}) {
    if (candidate.external_id) {
      const byExternalId = await get('SELECT * FROM movies WHERE external_id = ?', [candidate.external_id]);
      if (byExternalId) {
        return this._dup(byExternalId, `Matched external ID: ${candidate.external_id}`, byExternalId.source_id === sourceKey);
      }
    }

    if (candidate.source_url) {
      const byUrl = await get('SELECT * FROM movies WHERE source_url = ?', [candidate.source_url]);
      if (byUrl) {
        return this._dup(byUrl, `Matched source URL: ${candidate.source_url}`, byUrl.source_id === sourceKey);
      }
    }

    if (candidate.title && candidate.year) {
      const normalizedTitle = String(candidate.title).trim().toLowerCase();
      const byTitleYear = await get(
        'SELECT * FROM movies WHERE LOWER(TRIM(title)) = ? AND year = ?',
        [normalizedTitle, candidate.year]
      );
      if (byTitleYear) {
        return this._dup(
          byTitleYear,
          `Matched title "${candidate.title}" (${candidate.year})${byTitleYear.source_id !== sourceKey ? ' already imported from another source' : ''}`,
          byTitleYear.source_id === sourceKey
        );
      }
    }

    return { isDuplicate: false, existing: null, matchReason: null, sameSource: false };
  }

  _dup(existing, reason, sameSource) {
    return { isDuplicate: true, existing, matchReason: reason, sameSource: !!sameSource };
  }
}

module.exports = BaseDuplicateChecker;
