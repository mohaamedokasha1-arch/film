const BaseValidator = require('../base/BaseValidator');

class LocValidator extends BaseValidator {
  validate(record) {
    const base = super.validate(record);
    if (!base.valid) return base;
    if (!/^https:\/\/(tile\.loc\.gov|www\.loc\.gov)\//i.test(record.video_url)) {
      return { valid: false, reason: 'Media URL is not an official loc.gov / tile.loc.gov resource' };
    }
    if (!/^https:\/\/www\.loc\.gov\//i.test(record.source_url || '')) {
      return { valid: false, reason: 'Source URL is not an official loc.gov item page' };
    }
    return { valid: true, reason: null };
  }
}

module.exports = LocValidator;
