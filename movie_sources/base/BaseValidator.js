/**
 * BaseValidator — data-quality gate.
 * Rejects candidates with missing required fields, malformed URLs, or
 * implausible metadata BEFORE they reach the database.
 */

class BaseValidator {
  constructor(options = {}) {
    this.minDurationSeconds = options.minDurationSeconds != null ? options.minDurationSeconds : 60;
    this.maxDurationSeconds = options.maxDurationSeconds != null ? options.maxDurationSeconds : 60 * 60 * 8;
    this.currentYear = new Date().getFullYear() + 1;
  }

  /**
   * @param {Object} record - normalized candidate record
   * @returns {{valid: boolean, reason: string|null}}
   */
  validate(record) {
    if (!record) return { valid: false, reason: 'No parsable data' };

    if (!record.title || String(record.title).trim().length < 2) {
      return { valid: false, reason: 'Missing required field: title' };
    }
    if (!record.description || String(record.description).trim().length === 0) {
      return { valid: false, reason: 'Missing required field: description' };
    }
    const year = parseInt(record.year, 10);
    if (!year || isNaN(year) || year < 1850 || year > this.currentYear) {
      return { valid: false, reason: `Missing or implausible required field: year (got "${record.year}")` };
    }

    if (!record.video_url || !/^https:\/\//i.test(record.video_url)) {
      return { valid: false, reason: 'Invalid or missing media URL (must be https)' };
    }
    if (!record.source_url || !/^https:\/\//i.test(record.source_url)) {
      return { valid: false, reason: 'Invalid or missing source URL (must be https)' };
    }
    if (record.poster_url && !/^https:\/\//i.test(record.poster_url)) {
      return { valid: false, reason: 'Poster URL must be https when present' };
    }

    if (record.duration_seconds != null) {
      const d = Number(record.duration_seconds);
      if (isNaN(d)) return { valid: false, reason: 'Duration metadata is not numeric' };
      if (d < this.minDurationSeconds) {
        return {
          valid: false,
          reason: `Duration ${Math.round(d)}s is below configured minimum of ${this.minDurationSeconds}s (not a feature film)`
        };
      }
      if (d > this.maxDurationSeconds) {
        return { valid: false, reason: `Duration ${Math.round(d)}s exceeds maximum plausible runtime` };
      }
    }

    if (record.mime && !/^video\//i.test(record.mime) && record.mime !== 'application/ogg') {
      return { valid: false, reason: `Mime type "${record.mime}" is not a video` };
    }

    return { valid: true, reason: null };
  }
}

module.exports = BaseValidator;
