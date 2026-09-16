/**
 * Wikimedia Commons Validator — source-specific data quality rules layered on
 * the shared BaseValidator: URLs must genuinely point at Wikimedia infrastructure.
 */

const BaseValidator = require('../base/BaseValidator');

class WikimediaValidator extends BaseValidator {
  validate(record) {
    const base = super.validate(record);
    if (!base.valid) return base;

    if (!/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//i.test(record.video_url)) {
      return { valid: false, reason: 'Media URL is not an official upload.wikimedia.org file' };
    }
    if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(record.source_url)) {
      return { valid: false, reason: 'Source URL is not an official Commons file page' };
    }
    return { valid: true, reason: null };
  }
}

module.exports = WikimediaValidator;
